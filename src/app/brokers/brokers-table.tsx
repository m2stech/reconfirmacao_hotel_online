"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrokerFormDialog } from "./broker-form-dialog";

export type BrokerRow = {
  id: string;
  nome: string;
  email: string | null;
  pais: string | null;
  ultima_confirmacao_em: string | null;
};

export function BrokersTable() {
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroNome, setFiltroNome] = useState("");

  const [brokerEmEdicao, setBrokerEmEdicao] = useState<BrokerRow | null>(null);

  const carregar = useCallback(async (nome: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (nome) params.set("nome", nome);
      const resposta = await fetch(`/api/brokers?${params.toString()}`);
      const dados = await resposta.json();
      if (!dados.ok) {
        setErro(dados.erro ?? "Falha ao carregar brokers.");
        setCarregando(false);
        return;
      }
      setBrokers(dados.brokers);
    } catch {
      setErro("Falha ao carregar brokers.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => carregar(filtroNome), 300);
    return () => clearTimeout(timeout);
  }, [filtroNome, carregar]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filtro-nome-broker" className="text-xs text-muted-foreground">
            Buscar por nome
          </Label>
          <Input
            id="filtro-nome-broker"
            value={filtroNome}
            onChange={(event) => setFiltroNome(event.target.value)}
            placeholder="Nome do broker (fornecedor)"
            className="w-64"
          />
        </div>
      </div>

      {erro ? (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Nome (fornecedor)</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-36">País</TableHead>
              <TableHead className="w-32">Última confirmação</TableHead>
              <TableHead className="sticky right-0 w-32 bg-background text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.1)]">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : brokers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum broker encontrado. Brokers são cadastrados automaticamente ao enviar uma
                  reconfirmação para eles pelo detalhe da reserva.
                </TableCell>
              </TableRow>
            ) : (
              brokers.map((broker) => (
                <TableRow key={broker.id}>
                  <TableCell className="font-medium">
                    <div className="truncate" title={broker.nome}>
                      {broker.nome}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate" title={broker.email ?? undefined}>
                      {broker.email ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate" title={broker.pais ?? undefined}>
                      {broker.pais ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {broker.ultima_confirmacao_em
                      ? new Date(broker.ultima_confirmacao_em).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell className="sticky right-0 bg-background text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.1)]">
                    <Button variant="outline" size="sm" onClick={() => setBrokerEmEdicao(broker)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">{brokers.length} broker(s)</p>

      {brokerEmEdicao ? (
        <BrokerFormDialog
          broker={brokerEmEdicao}
          onClose={() => setBrokerEmEdicao(null)}
          onSaved={() => {
            carregar(filtroNome);
            toast.success("Broker atualizado.");
          }}
        />
      ) : null}
    </div>
  );
}
