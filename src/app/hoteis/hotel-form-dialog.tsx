"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HotelRow } from "./hotels-table";

const CONFIABILIDADE_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  sugerido: "Sugerido",
  obsoleto: "Obsoleto",
};

type EstadoSalvar = { status: "idle" } | { status: "salvando" } | { status: "erro"; mensagem: string };

export function HotelFormDialog({
  hotel,
  onClose,
  onSaved,
}: {
  hotel: HotelRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ehEdicao = hotel !== null;

  const [nome, setNome] = useState(hotel?.nome ?? "");
  const [pais, setPais] = useState(hotel?.pais ?? "");
  const [idioma, setIdioma] = useState(hotel?.idioma ?? "");
  const [emailInicial, setEmailInicial] = useState("");
  const [confiabilidadeContato, setConfiabilidadeContato] = useState(
    hotel?.confiabilidade_contato ?? "confirmado"
  );
  const [novoEmail, setNovoEmail] = useState("");
  const [emails, setEmails] = useState(hotel?.hotel_emails ?? []);

  const [estado, setEstado] = useState<EstadoSalvar>({ status: "idle" });
  const [adicionandoEmail, setAdicionandoEmail] = useState(false);
  const [marcandoObsoletoId, setMarcandoObsoletoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) {
      setEstado({ status: "erro", mensagem: "Nome do hotel é obrigatório." });
      return;
    }

    setEstado({ status: "salvando" });

    try {
      if (ehEdicao) {
        const resposta = await fetch(`/api/hoteis/${hotel.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome,
            pais: pais || null,
            idioma: idioma || null,
            confiabilidadeContato,
          }),
        });
        const dados = await resposta.json();
        if (!dados.ok) {
          setEstado({ status: "erro", mensagem: dados.erro ?? "Falha ao salvar hotel." });
          return;
        }
      } else {
        const resposta = await fetch("/api/hoteis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, pais: pais || null, idioma: idioma || null, email: emailInicial || null }),
        });
        const dados = await resposta.json();
        if (!dados.ok) {
          setEstado({ status: "erro", mensagem: dados.erro ?? "Falha ao criar hotel." });
          return;
        }
      }

      onSaved();
      onClose();
    } catch {
      setEstado({ status: "erro", mensagem: "Falha de rede ao salvar hotel." });
    }
  }

  async function adicionarEmail() {
    if (!hotel || !novoEmail.trim()) return;
    setAdicionandoEmail(true);
    try {
      const resposta = await fetch(`/api/hoteis/${hotel.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: novoEmail.trim() }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao adicionar e-mail.");
        return;
      }
      setEmails((atual) => [...atual, dados.email]);
      setNovoEmail("");
      toast.success("E-mail adicionado.");
      onSaved();
    } catch {
      toast.error("Falha de rede ao adicionar e-mail.");
    } finally {
      setAdicionandoEmail(false);
    }
  }

  async function confirmarEmail(emailId: string) {
    if (!hotel) return;
    setConfirmandoId(emailId);
    try {
      const resposta = await fetch(`/api/hoteis/${hotel.id}/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmar" }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao confirmar e-mail.");
        return;
      }
      setEmails((atual) =>
        atual.map((email) => (email.id === emailId ? { ...email, confiabilidade: "confirmado" } : email))
      );
      setConfiabilidadeContato("confirmado");
      toast.success("E-mail confirmado — já pode ser usado para envio.");
      onSaved();
    } catch {
      toast.error("Falha de rede ao confirmar e-mail.");
    } finally {
      setConfirmandoId(null);
    }
  }

  async function marcarObsoleto(emailId: string) {
    if (!hotel) return;
    setMarcandoObsoletoId(emailId);
    try {
      const resposta = await fetch(`/api/hoteis/${hotel.id}/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "marcar_obsoleto" }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao marcar e-mail como obsoleto.");
        return;
      }
      setEmails((atual) =>
        atual.map((email) =>
          email.id === emailId
            ? { ...email, confiabilidade: "obsoleto", bounced_em: new Date().toISOString() }
            : email
        )
      );
      toast.success("E-mail marcado como obsoleto.");
      onSaved();
    } catch {
      toast.error("Falha de rede ao marcar e-mail como obsoleto.");
    } finally {
      setMarcandoObsoletoId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ehEdicao ? `Editar hotel: ${hotel.nome}` : "Novo hotel"}</DialogTitle>
          <DialogDescription>
            {ehEdicao
              ? "Atualize os dados de contato e a confiabilidade do hotel."
              : "Cadastre um novo hotel no banco de contatos."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="hotel-nome">Nome</Label>
              <Input id="hotel-nome" value={nome} onChange={(event) => setNome(event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="hotel-pais">País</Label>
              <Input id="hotel-pais" value={pais ?? ""} onChange={(event) => setPais(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="hotel-idioma">Idioma</Label>
              <Input id="hotel-idioma" value={idioma ?? ""} onChange={(event) => setIdioma(event.target.value)} />
            </div>

            {ehEdicao ? (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="hotel-confiabilidade">Confiabilidade do contato</Label>
                <Select
                  value={confiabilidadeContato}
                  onValueChange={(valor) => setConfiabilidadeContato(valor ?? "confirmado")}
                >
                  <SelectTrigger id="hotel-confiabilidade" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONFIABILIDADE_LABEL).map(([valor, label]) => (
                      <SelectItem key={valor} value={valor}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="hotel-email-inicial">E-mail inicial (opcional)</Label>
                <Input
                  id="hotel-email-inicial"
                  type="email"
                  value={emailInicial}
                  onChange={(event) => setEmailInicial(event.target.value)}
                />
              </div>
            )}
          </div>

          {ehEdicao ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <Label>E-mails cadastrados</Label>
              <p className="text-xs text-muted-foreground">
                E-mail &quot;Sugerido&quot; (encontrado automaticamente) só é usado para envio depois de
                confirmado — clique em &quot;Confirmar&quot; após verificar que o endereço está correto.
              </p>
              {emails.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum e-mail cadastrado.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {emails.map((email) => (
                    <li key={email.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={email.confiabilidade === "obsoleto" ? "text-muted-foreground line-through" : ""}>
                          {email.email}
                        </span>
                        <Badge variant={email.confiabilidade === "obsoleto" ? "outline" : "secondary"} className="text-[10px]">
                          {CONFIABILIDADE_LABEL[email.confiabilidade] ?? email.confiabilidade}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {email.confiabilidade === "sugerido" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={confirmandoId === email.id}
                            onClick={() => confirmarEmail(email.id)}
                          >
                            {confirmandoId === email.id ? "Confirmando..." : "Confirmar"}
                          </Button>
                        ) : null}
                        {email.confiabilidade !== "obsoleto" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={marcandoObsoletoId === email.id}
                            onClick={() => marcarObsoleto(email.id)}
                          >
                            {marcandoObsoletoId === email.id ? "Marcando..." : "Marcar obsoleto"}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="hotel-novo-email">Adicionar e-mail</Label>
                  <Input
                    id="hotel-novo-email"
                    type="email"
                    value={novoEmail}
                    onChange={(event) => setNovoEmail(event.target.value)}
                    placeholder="reservas@hotel.com"
                  />
                </div>
                <Button type="button" variant="outline" disabled={adicionandoEmail || !novoEmail.trim()} onClick={adicionarEmail}>
                  {adicionandoEmail ? "Adicionando..." : "Adicionar"}
                </Button>
              </div>
            </div>
          ) : null}

          {estado.status === "erro" ? (
            <p className="text-sm text-destructive" role="alert">
              {estado.mensagem}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={estado.status === "salvando"}>
            {estado.status === "salvando" ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
