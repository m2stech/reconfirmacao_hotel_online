"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HotelFormDialog } from "./hotel-form-dialog";
import { MergeHotelDialog } from "./merge-hotel-dialog";

export type HotelEmailRow = {
  id: string;
  email: string;
  fonte: string;
  confiabilidade: string;
  bounced_em: string | null;
};

export type HotelRow = {
  id: string;
  nome: string;
  pais: string | null;
  pais_a_confirmar: boolean;
  idioma: string | null;
  confiabilidade_contato: string;
  ultima_confirmacao_em: string | null;
  ultima_confirmacao_por: string | null;
  hotel_emails: HotelEmailRow[];
};

const CONFIABILIDADE_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  confirmado: "default",
  sugerido: "secondary",
  obsoleto: "outline",
};

const CONFIABILIDADE_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  sugerido: "Sugerido",
  obsoleto: "Obsoleto",
};

export function HotelsTable() {
  const [hoteis, setHoteis] = useState<HotelRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroNome, setFiltroNome] = useState("");

  const [hotelEmEdicao, setHotelEmEdicao] = useState<HotelRow | "novo" | null>(null);
  const [hotelParaMesclar, setHotelParaMesclar] = useState<HotelRow | null>(null);

  const carregar = useCallback(async (nome: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (nome) params.set("nome", nome);
      const resposta = await fetch(`/api/hoteis?${params.toString()}`);
      const dados = await resposta.json();
      if (!dados.ok) {
        setErro(dados.erro ?? "Falha ao carregar hotéis.");
        setCarregando(false);
        return;
      }
      setHoteis(dados.hoteis);
    } catch {
      setErro("Falha ao carregar hotéis.");
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
          <Label htmlFor="filtro-nome-hotel" className="text-xs text-muted-foreground">
            Buscar por nome
          </Label>
          <Input
            id="filtro-nome-hotel"
            value={filtroNome}
            onChange={(event) => setFiltroNome(event.target.value)}
            placeholder="Nome do hotel"
            className="w-64"
          />
        </div>
        <Button onClick={() => setHotelEmEdicao("novo")}>Novo hotel</Button>
      </div>

      {erro ? (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail(s)</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Idioma</TableHead>
              <TableHead>Confiabilidade</TableHead>
              <TableHead>Última confirmação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : hoteis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhum hotel encontrado.
                </TableCell>
              </TableRow>
            ) : (
              hoteis.map((hotel) => (
                <TableRow key={hotel.id}>
                  <TableCell className="font-medium">{hotel.nome}</TableCell>
                  <TableCell>
                    {hotel.hotel_emails.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {hotel.hotel_emails.map((hotelEmail) => (
                          <div key={hotelEmail.id} className="flex items-center gap-2 text-sm">
                            <span
                              className={
                                hotelEmail.confiabilidade === "obsoleto"
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }
                            >
                              {hotelEmail.email}
                            </span>
                            <Badge
                              variant={CONFIABILIDADE_BADGE[hotelEmail.confiabilidade] ?? "outline"}
                              className="text-[10px]"
                            >
                              {CONFIABILIDADE_LABEL[hotelEmail.confiabilidade] ?? hotelEmail.confiabilidade}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {hotel.pais ?? "—"}
                    {hotel.pais_a_confirmar ? (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        A confirmar
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{hotel.idioma ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={CONFIABILIDADE_BADGE[hotel.confiabilidade_contato] ?? "outline"}>
                      {CONFIABILIDADE_LABEL[hotel.confiabilidade_contato] ?? hotel.confiabilidade_contato}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {hotel.ultima_confirmacao_em
                      ? new Date(hotel.ultima_confirmacao_em).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setHotelEmEdicao(hotel)}>
                        Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setHotelParaMesclar(hotel)}>
                        Mesclar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">{hoteis.length} hotel(is)</p>

      {hotelEmEdicao ? (
        <HotelFormDialog
          hotel={hotelEmEdicao === "novo" ? null : hotelEmEdicao}
          onClose={() => setHotelEmEdicao(null)}
          onSaved={() => {
            carregar(filtroNome);
            toast.success(hotelEmEdicao === "novo" ? "Hotel criado." : "Hotel atualizado.");
          }}
        />
      ) : null}

      {hotelParaMesclar ? (
        <MergeHotelDialog
          hotel={hotelParaMesclar}
          hoteis={hoteis.filter((hotel) => hotel.id !== hotelParaMesclar.id)}
          onClose={() => setHotelParaMesclar(null)}
          onMerged={() => {
            carregar(filtroNome);
            toast.success("Hotéis mesclados.");
          }}
        />
      ) : null}
    </div>
  );
}
