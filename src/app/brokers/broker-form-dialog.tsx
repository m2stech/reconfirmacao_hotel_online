"use client";

import { useState } from "react";
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
import type { BrokerRow } from "./brokers-table";

type EstadoSalvar = { status: "idle" } | { status: "salvando" } | { status: "erro"; mensagem: string };

export function BrokerFormDialog({
  broker,
  onClose,
  onSaved,
}: {
  broker: BrokerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(broker.email ?? "");
  const [pais, setPais] = useState(broker.pais ?? "");
  const [estado, setEstado] = useState<EstadoSalvar>({ status: "idle" });

  async function salvar() {
    setEstado({ status: "salvando" });
    try {
      const resposta = await fetch(`/api/brokers/${broker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || null, pais: pais || null }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        setEstado({ status: "erro", mensagem: dados.erro ?? "Falha ao salvar broker." });
        return;
      }
      onSaved();
      onClose();
    } catch {
      setEstado({ status: "erro", mensagem: "Falha de rede ao salvar broker." });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar broker: {broker.nome}</DialogTitle>
          <DialogDescription>Atualize o e-mail e o país de contato deste broker.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="broker-email">E-mail</Label>
            <Input id="broker-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="broker-pais">País</Label>
            <Input id="broker-pais" value={pais} onChange={(event) => setPais(event.target.value)} />
          </div>

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
