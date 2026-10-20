"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { STATUS_LABEL, STATUS_MANUAL_OPCOES, validarStatusManual, type StatusAuditoria } from "@/features/audit/status";

type Hospede = { nome: string };

type Reserva = {
  id: string;
  localizador: string;
  localizador_externo: string | null;
  fornecedor: string | null;
  data_checkin: string | null;
  data_checkout: string | null;
  tipo_habitacao: string | null;
  regime_alimentar: string | null;
  hospedes: Hospede[];
  status_manual: StatusAuditoria | null;
  regime_alimentar_confirmado_manual: boolean | null;
  pagamento_manual: string | null;
  tipo_pendencia_manual: string | null;
  hotels: { nome: string; pais: string | null; idioma: string | null } | null;
};

type Envio = {
  id: string;
  tipo: string;
  status: string;
  destinatario: string;
  assunto: string;
  created_at: string;
  hotel_replies: { recebido_em: string; resumo: string | null; corpo_texto: string }[];
};

export function ReservationDetailDialog({
  reservationId,
  onClose,
  onSaved,
}: {
  reservationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [statusManual, setStatusManual] = useState<string>("nenhum");
  const [regimeConfirmado, setRegimeConfirmado] = useState(false);
  const [pagamentoManual, setPagamentoManual] = useState("");
  const [tipoPendenciaManual, setTipoPendenciaManual] = useState("");

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const resposta = await fetch(`/api/audit/${reservationId}`);
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao carregar reserva.");
        setCarregando(false);
        return;
      }
      setReserva(dados.reserva);
      setEnvios(dados.envios);
      setStatusManual(dados.reserva.status_manual ?? "nenhum");
      setRegimeConfirmado(Boolean(dados.reserva.regime_alimentar_confirmado_manual));
      setPagamentoManual(dados.reserva.pagamento_manual ?? "");
      setTipoPendenciaManual(dados.reserva.tipo_pendencia_manual ?? "");
      setCarregando(false);
    }
    carregar();
  }, [reservationId]);

  async function salvar() {
    const statusParaValidar = statusManual === "nenhum" ? null : (statusManual as StatusAuditoria);
    const erro = validarStatusManual(statusParaValidar, regimeConfirmado);
    if (erro) {
      toast.error(erro);
      return;
    }

    setSalvando(true);
    const resposta = await fetch(`/api/audit/${reservationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusManual: statusParaValidar,
        regimeAlimentarConfirmadoManual: regimeConfirmado,
        pagamentoManual: pagamentoManual || null,
        tipoPendenciaManual: tipoPendenciaManual || null,
      }),
    });
    const dados = await resposta.json();
    setSalvando(false);

    if (!dados.ok) {
      toast.error(dados.erro ?? "Falha ao salvar auditoria.");
      return;
    }

    toast.success("Auditoria atualizada.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhe da reserva {reserva?.localizador ?? ""}</DialogTitle>
        </DialogHeader>

        {carregando || !reserva ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Hotel</span>
                <p className="font-medium">{reserva.hotels?.nome ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Fornecedor</span>
                <p className="font-medium">{reserva.fornecedor ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Check-in / Check-out</span>
                <p className="font-medium">
                  {reserva.data_checkin ?? "—"} a {reserva.data_checkout ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Tipo de habitação / Regime</span>
                <p className="font-medium">
                  {reserva.tipo_habitacao ?? "—"} · {reserva.regime_alimentar ?? "—"}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Hóspedes</span>
                <p className="font-medium">{reserva.hospedes.map((h) => h.nome).join(", ") || "—"}</p>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="mb-2 text-sm font-medium">Histórico com o hotel</h3>
              {envios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum e-mail enviado ainda.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {envios.map((envio) => (
                    <div key={envio.id} className="rounded-lg border border-border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{envio.assunto}</span>
                        <Badge variant={envio.status === "erro" ? "destructive" : "secondary"}>{envio.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enviado em {new Date(envio.created_at).toLocaleString("pt-BR")} para {envio.destinatario}
                      </p>
                      {envio.hotel_replies.map((resposta, indice) => (
                        <div key={indice} className="mt-1 rounded bg-muted/50 p-2 text-xs">
                          <p className="font-medium">
                            Resposta em {new Date(resposta.recebido_em).toLocaleString("pt-BR")}
                          </p>
                          <p>{resposta.resumo ?? resposta.corpo_texto}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="mb-2 text-sm font-medium">Edição manual de auditoria</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Status</Label>
                  <Select value={statusManual} onValueChange={(valor) => setStatusManual(valor ?? "nenhum")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Automático</SelectItem>
                      {STATUS_MANUAL_OPCOES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 self-end pb-1 text-sm leading-none font-medium select-none">
                  <Checkbox
                    checked={regimeConfirmado}
                    onCheckedChange={(checked) => setRegimeConfirmado(Boolean(checked))}
                  />
                  Regime alimentar confirmado
                </label>
                <div className="flex flex-col gap-1">
                  <Label>Pagamento</Label>
                  <Input value={pagamentoManual} onChange={(event) => setPagamentoManual(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Tipo de pendência</Label>
                  <Input value={tipoPendenciaManual} onChange={(event) => setTipoPendenciaManual(event.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || carregando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
