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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HotelRow } from "./hotels-table";

type EstadoMesclar = { status: "idle" } | { status: "mesclando" } | { status: "erro"; mensagem: string };

export function MergeHotelDialog({
  hotel,
  hoteis,
  onClose,
  onMerged,
}: {
  hotel: HotelRow;
  hoteis: HotelRow[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [hotelPrincipalId, setHotelPrincipalId] = useState<string>("");
  const [estado, setEstado] = useState<EstadoMesclar>({ status: "idle" });

  async function confirmar() {
    if (!hotelPrincipalId) {
      setEstado({ status: "erro", mensagem: "Selecione o hotel principal." });
      return;
    }

    setEstado({ status: "mesclando" });
    try {
      const resposta = await fetch(`/api/hoteis/${hotel.id}/mesclar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelPrincipalId }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        setEstado({ status: "erro", mensagem: dados.erro ?? "Falha ao mesclar hotéis." });
        return;
      }
      onMerged();
      onClose();
    } catch {
      setEstado({ status: "erro", mensagem: "Falha de rede ao mesclar hotéis." });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mesclar hotel duplicado</DialogTitle>
          <DialogDescription>
            Reatribui reservas e e-mails de <strong>{hotel.nome}</strong> para o hotel principal escolhido e remove
            este registro duplicado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>
              Esta ação não pode ser desfeita. O registro de <strong>{hotel.nome}</strong> será excluído após a
              mesclagem.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-1">
            <Label htmlFor="hotel-principal">Mesclar com (hotel principal)</Label>
            <Select value={hotelPrincipalId} onValueChange={(valor) => setHotelPrincipalId(valor ?? "")}>
              <SelectTrigger id="hotel-principal" className="w-full">
                <SelectValue placeholder="Selecione o hotel principal">
                  {(valor: string | null) => hoteis.find((candidato) => candidato.id === valor)?.nome}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {hoteis.map((candidato) => (
                  <SelectItem key={candidato.id} value={candidato.id}>
                    {candidato.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button variant="destructive" onClick={confirmar} disabled={estado.status === "mesclando"}>
            {estado.status === "mesclando" ? "Mesclando..." : "Confirmar mesclagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
