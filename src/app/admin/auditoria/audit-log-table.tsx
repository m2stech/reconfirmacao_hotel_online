"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditLogRow = {
  id: string;
  actor_id: string;
  actor_nome: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type UsuarioOpcao = { id: string; full_name: string | null; email: string };

const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function AuditLogTable() {
  const [linhas, setLinhas] = useState<AuditLogRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);

  const [filtroEntityType, setFiltroEntityType] = useState("todos");
  const [filtroActorId, setFiltroActorId] = useState("todos");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  useEffect(() => {
    (async () => {
      const resposta = await fetch("/api/admin/auditoria/filtros");
      const dados = await resposta.json();
      if (dados.ok) {
        setEntityTypes(dados.entityTypes);
        setUsuarios(dados.usuarios);
      }
    })();
  }, []);

  const carregarPagina = useCallback(
    async (numeroPagina: number) => {
      setCarregando(true);
      const params = new URLSearchParams();
      params.set("pagina", String(numeroPagina));
      if (filtroEntityType !== "todos") params.set("entityType", filtroEntityType);
      if (filtroActorId !== "todos") params.set("actorId", filtroActorId);
      if (filtroDataInicio) params.set("dataInicio", filtroDataInicio);
      if (filtroDataFim) params.set("dataFim", filtroDataFim);

      const resposta = await fetch(`/api/admin/auditoria?${params.toString()}`);
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao carregar auditoria.");
        setCarregando(false);
        return;
      }

      setLinhas(dados.registros);
      setPagina(dados.pagina);
      setTotalPaginas(dados.totalPaginas);
      setTotal(dados.total);
      setCarregando(false);
    },
    [filtroEntityType, filtroActorId, filtroDataInicio, filtroDataFim]
  );

  useEffect(() => {
    carregarPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEntityType, filtroActorId, filtroDataInicio, filtroDataFim]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <Select value={filtroEntityType} onValueChange={(valor) => setFiltroEntityType(valor ?? "todos")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {entityTypes.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Usuário</span>
          <Select value={filtroActorId} onValueChange={(valor) => setFiltroActorId(valor ?? "todos")}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {usuarios.map((usuario) => (
                <SelectItem key={usuario.id} value={usuario.id}>
                  {usuario.full_name ?? usuario.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">De</span>
          <Input
            type="date"
            value={filtroDataInicio}
            onChange={(event) => setFiltroDataInicio(event.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Até</span>
          <Input
            type="date"
            value={filtroDataFim}
            onChange={(event) => setFiltroDataFim(event.target.value)}
            className="w-40"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum registro de auditoria encontrado.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((linha) => (
                <TableRow key={linha.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatadorDataHora.format(new Date(linha.created_at))}
                  </TableCell>
                  <TableCell>{linha.actor_nome ?? linha.actor_email ?? "—"}</TableCell>
                  <TableCell className="font-medium">{linha.action}</TableCell>
                  <TableCell>{linha.entity_type}</TableCell>
                  <TableCell>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">Ver metadata</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {JSON.stringify(linha.metadata, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} registro(s)</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => carregarPagina(pagina - 1)}>
            Anterior
          </Button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <Button variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => carregarPagina(pagina + 1)}>
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
