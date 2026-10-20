"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { STATUS_AUDITORIA, STATUS_BADGE_VARIANT, STATUS_LABEL, type StatusAuditoria } from "@/features/audit/status";
import { ReservationDetailDialog } from "./reservation-detail-dialog";

export type AuditRow = {
  reservation_id: string;
  localizador: string | null;
  hotel_nome: string | null;
  data_checkin: string | null;
  data_checkout: string | null;
  status: string | null;
  last_email_send_at: string | null;
  last_hotel_reply_at: string | null;
  pagamento_manual: string | null;
  tipo_pendencia_manual: string | null;
};

export function AuditTable() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [linhas, setLinhas] = useState<AuditRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);
  const [reservaAbertaId, setReservaAbertaId] = useState<string | null>(null);

  const [filtroHotel, setFiltroHotel] = useState(searchParams.get("hotel") ?? "");
  const [filtroLocalizador, setFiltroLocalizador] = useState(searchParams.get("localizador") ?? "");
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get("status") ?? "todos");

  const carregarPagina = useCallback(
    async (numeroPagina: number) => {
      setCarregando(true);
      const params = new URLSearchParams();
      params.set("pagina", String(numeroPagina));
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      if (filtroHotel) params.set("hotel", filtroHotel);
      if (filtroLocalizador) params.set("localizador", filtroLocalizador);

      const resposta = await fetch(`/api/audit?${params.toString()}`);
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao carregar reservas.");
        setCarregando(false);
        return;
      }

      setLinhas(dados.reservas);
      setPagina(dados.pagina);
      setTotalPaginas(dados.totalPaginas);
      setTotal(dados.total);
      setCarregando(false);
    },
    [filtroStatus, filtroHotel, filtroLocalizador]
  );

  useEffect(() => {
    const statusUrl = searchParams.get("status") ?? "todos";
    setFiltroStatus(statusUrl);
  }, [searchParams]);

  useEffect(() => {
    carregarPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroHotel, filtroLocalizador]);

  function aplicarFiltroStatus(valor: string | null) {
    const valorFinal = valor ?? "todos";
    setFiltroStatus(valorFinal);
    const params = new URLSearchParams(searchParams.toString());
    if (valorFinal === "todos") params.delete("status");
    else params.set("status", valorFinal);
    router.replace(`/dashboard?${params.toString()}`);
  }

  function exportar() {
    const params = new URLSearchParams();
    if (filtroStatus !== "todos") params.set("status", filtroStatus);
    if (filtroHotel) params.set("hotel", filtroHotel);
    if (filtroLocalizador) params.set("localizador", filtroLocalizador);
    window.open(`/api/audit/export?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <Select value={filtroStatus} onValueChange={aplicarFiltroStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {STATUS_AUDITORIA.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Hotel</span>
          <Input
            value={filtroHotel}
            onChange={(event) => setFiltroHotel(event.target.value)}
            placeholder="Nome do hotel"
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Localizador</span>
          <Input
            value={filtroLocalizador}
            onChange={(event) => setFiltroLocalizador(event.target.value)}
            placeholder="Ex. 9QGJZN"
            className="w-40"
          />
        </div>
        <Button variant="outline" onClick={exportar} className="ml-auto">
          Exportar Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Localizador</TableHead>
              <TableHead>Hotel</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Último envio</TableHead>
              <TableHead>Última resposta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Nenhuma reserva encontrada.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((linha) => (
                <TableRow
                  key={linha.reservation_id}
                  className="cursor-pointer"
                  onClick={() => setReservaAbertaId(linha.reservation_id)}
                >
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[linha.status as StatusAuditoria] ?? "outline"}>
                      {STATUS_LABEL[linha.status as StatusAuditoria] ?? linha.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{linha.localizador}</TableCell>
                  <TableCell>{linha.hotel_nome ?? "—"}</TableCell>
                  <TableCell>{linha.data_checkin ?? "—"}</TableCell>
                  <TableCell>{linha.data_checkout ?? "—"}</TableCell>
                  <TableCell>{linha.last_email_send_at ? new Date(linha.last_email_send_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>{linha.last_hotel_reply_at ? new Date(linha.last_hotel_reply_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} reserva(s)</span>
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

      {reservaAbertaId ? (
        <ReservationDetailDialog
          reservationId={reservaAbertaId}
          onClose={() => setReservaAbertaId(null)}
          onSaved={() => carregarPagina(pagina)}
        />
      ) : null}
    </div>
  );
}
