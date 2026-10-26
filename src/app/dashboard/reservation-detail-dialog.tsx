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
  hotel_id: string | null;
  hotels: { nome: string; pais: string | null; idioma: string | null } | null;
};

type Envio = {
  id: string;
  tipo: string;
  status: string;
  destinatario: string;
  assunto: string;
  created_at: string;
  erro_detalhe?: string | null;
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
  const [temEmailConfirmado, setTemEmailConfirmado] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [emailManual, setEmailManual] = useState("");
  const [enviandoEmailManual, setEnviandoEmailManual] = useState(false);

  const [statusManual, setStatusManual] = useState<string>("nenhum");
  const [regimeConfirmado, setRegimeConfirmado] = useState(false);
  const [pagamentoManual, setPagamentoManual] = useState("");
  const [tipoPendenciaManual, setTipoPendenciaManual] = useState("");

  const [editandoReenvioId, setEditandoReenvioId] = useState<string | null>(null);
  const [destinatarioReenvio, setDestinatarioReenvio] = useState("");
  const [assuntoReenvio, setAssuntoReenvio] = useState("");
  const [reenviando, setReenviando] = useState(false);

  const [respondendoId, setRespondendoId] = useState<string | null>(null);
  const [textoResposta, setTextoResposta] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);

  async function carregarDetalhe() {
    const resposta = await fetch(`/api/audit/${reservationId}`);
    const dados = await resposta.json();
    if (!dados.ok) {
      toast.error(dados.erro ?? "Falha ao carregar reserva.");
      return;
    }
    setReserva(dados.reserva);
    setEnvios(dados.envios);
    setTemEmailConfirmado(Boolean(dados.temEmailConfirmado));
    setStatusManual(dados.reserva.status_manual ?? "nenhum");
    setRegimeConfirmado(Boolean(dados.reserva.regime_alimentar_confirmado_manual));
    setPagamentoManual(dados.reserva.pagamento_manual ?? "");
    setTipoPendenciaManual(dados.reserva.tipo_pendencia_manual ?? "");
  }

  useEffect(() => {
    (async () => {
      setCarregando(true);
      await carregarDetalhe();
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  async function enviarComEmailManual() {
    if (!reserva) return;
    if (!emailManual.trim()) {
      toast.error("Digite o e-mail do hotel.");
      return;
    }
    setEnviandoEmailManual(true);
    const resposta = await fetch(`/api/reservations/${reserva.id}/enviar-com-email-manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailManual.trim() }),
    });
    const dados = await resposta.json();
    setEnviandoEmailManual(false);

    if (!dados.ok) {
      toast.error(dados.erro ?? "Falha ao enviar reconfirmação.");
      return;
    }
    toast.success("E-mail do hotel salvo e reconfirmação enviada.");
    setEmailManual("");
    await carregarDetalhe();
    onSaved();
  }

  async function reenviar(envioId: string) {
    setReenviando(true);
    const resposta = await fetch(`/api/email-sends/${envioId}/reenviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinatario: destinatarioReenvio, assunto: assuntoReenvio }),
    });
    const dados = await resposta.json();
    setReenviando(false);

    if (!dados.ok) {
      toast.error(dados.erro ?? "Falha ao reenviar e-mail.");
      return;
    }
    toast.success("E-mail reenviado.");
    setEditandoReenvioId(null);
    await carregarDetalhe();
  }

  async function responder(envioId: string) {
    if (!textoResposta.trim()) {
      toast.error("Digite o texto da resposta.");
      return;
    }
    setEnviandoResposta(true);
    const resposta = await fetch(`/api/email-sends/${envioId}/responder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textoUsuario: textoResposta }),
    });
    const dados = await resposta.json();
    setEnviandoResposta(false);

    if (!dados.ok) {
      toast.error(dados.erro ?? "Falha ao enviar resposta.");
      return;
    }
    toast.success("Resposta enviada ao hotel.");
    setRespondendoId(null);
    setTextoResposta("");
    await carregarDetalhe();
  }

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
              {envios.length === 0 && !temEmailConfirmado ? (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-sm text-destructive">
                    E-mail não encontrado para este hotel — a reconfirmação ainda não foi enviada.
                    Informe o e-mail de contato para enviar agora.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="email@hotel.com"
                      value={emailManual}
                      onChange={(event) => setEmailManual(event.target.value)}
                    />
                    <Button size="sm" disabled={enviandoEmailManual} onClick={enviarComEmailManual}>
                      {enviandoEmailManual ? "Enviando..." : "Enviar reconfirmação"}
                    </Button>
                  </div>
                </div>
              ) : envios.length === 0 ? (
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
                      {envio.status === "erro" ? (
                        <p className="mt-1 text-xs text-destructive">{envio.erro_detalhe}</p>
                      ) : null}
                      {envio.hotel_replies.map((resposta, indice) => (
                        <div key={indice} className="mt-1 rounded bg-muted/50 p-2 text-xs">
                          <p className="font-medium">
                            Resposta em {new Date(resposta.recebido_em).toLocaleString("pt-BR")}
                          </p>
                          <p>{resposta.resumo ?? resposta.corpo_texto}</p>
                        </div>
                      ))}

                      <div className="mt-2 flex gap-2">
                        {envio.status === "erro" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditandoReenvioId(editandoReenvioId === envio.id ? null : envio.id);
                              setDestinatarioReenvio(envio.destinatario);
                              setAssuntoReenvio(envio.assunto);
                            }}
                          >
                            {editandoReenvioId === envio.id ? "Cancelar" : "Reenviar"}
                          </Button>
                        ) : null}
                        {envio.status === "enviado" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRespondendoId(respondendoId === envio.id ? null : envio.id);
                              setTextoResposta("");
                            }}
                          >
                            {respondendoId === envio.id ? "Cancelar" : "Responder"}
                          </Button>
                        ) : null}
                      </div>

                      {editandoReenvioId === envio.id ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <Label>Destinatário</Label>
                            <Input
                              value={destinatarioReenvio}
                              onChange={(event) => setDestinatarioReenvio(event.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label>Assunto</Label>
                            <Input
                              value={assuntoReenvio}
                              onChange={(event) => setAssuntoReenvio(event.target.value)}
                            />
                          </div>
                          <Button size="sm" disabled={reenviando} onClick={() => reenviar(envio.id)}>
                            {reenviando ? "Reenviando..." : "Confirmar reenvio"}
                          </Button>
                        </div>
                      ) : null}

                      {respondendoId === envio.id ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            className="min-h-20 rounded-md border border-border bg-background p-2 text-sm"
                            placeholder="Escreva a resposta ao hotel..."
                            value={textoResposta}
                            onChange={(event) => setTextoResposta(event.target.value)}
                          />
                          <Button
                            size="sm"
                            disabled={enviandoResposta}
                            onClick={() => responder(envio.id)}
                          >
                            {enviandoResposta ? "Enviando..." : "Enviar resposta"}
                          </Button>
                        </div>
                      ) : null}
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
