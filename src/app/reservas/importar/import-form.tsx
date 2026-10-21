"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReservaConsolidadaComHotel } from "@/features/reservations/parse-rooming-list";

type ReservaPreview = ReservaConsolidadaComHotel;

type EstadoPreview =
  | { status: "vazio" }
  | { status: "carregando" }
  | { status: "erro"; mensagem: string; colunasFaltantes?: string[]; colunasEncontradas?: string[] }
  | { status: "pronto"; arquivoNome: string; reservas: ReservaPreview[] };

type EstadoConfirmacao =
  | { status: "idle" }
  | { status: "enviando" }
  | { status: "sucesso"; importadas: number; puladas: number }
  | { status: "erro"; mensagem: string };

export function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [preview, setPreview] = useState<EstadoPreview>({ status: "vazio" });
  const [confirmacao, setConfirmacao] = useState<EstadoConfirmacao>({ status: "idle" });

  async function processarArquivo(arquivo: File) {
    setConfirmacao({ status: "idle" });
    setPreview({ status: "carregando" });

    const formData = new FormData();
    formData.append("arquivo", arquivo);

    const resposta = await fetch("/api/reservations/import/preview", {
      method: "POST",
      body: formData,
    });
    const dados = await resposta.json();

    if (!dados.ok) {
      setPreview({
        status: "erro",
        mensagem: dados.erro ?? "Falha ao processar o arquivo.",
        colunasFaltantes: dados.colunasFaltantes,
        colunasEncontradas: dados.colunasEncontradas,
      });
      toast.error(dados.erro ?? "Falha ao processar o arquivo.");
      return;
    }

    setPreview({ status: "pronto", arquivoNome: dados.arquivoNome, reservas: dados.reservas });
    const novos = (dados.reservas as ReservaPreview[]).filter((reserva) => !reserva.jaProcessado).length;
    toast.success(
      `${dados.reservas.length} reserva(s) consolidada(s) por localizador em ${dados.arquivoNome}`,
      { description: `${novos} nova(s), ${dados.reservas.length - novos} já processada(s).` }
    );
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (arquivo) processarArquivo(arquivo);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setArrastando(false);
    const arquivo = event.dataTransfer.files?.[0];
    if (arquivo) processarArquivo(arquivo);
  }

  async function confirmarImportacao() {
    if (preview.status !== "pronto") return;
    setConfirmacao({ status: "enviando" });

    const novasReservas = preview.reservas.filter((reserva) => !reserva.jaProcessado);

    const resposta = await fetch("/api/reservations/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivoNome: preview.arquivoNome, reservas: novasReservas }),
    });
    const dados = await resposta.json();

    if (!dados.ok) {
      setConfirmacao({ status: "erro", mensagem: dados.erro ?? "Falha ao importar reservas." });
      toast.error(dados.erro ?? "Falha ao importar reservas.");
      return;
    }

    setConfirmacao({ status: "sucesso", importadas: dados.importadas, puladas: dados.puladas });
    toast.success(
      `${dados.importadas} reserva(s) importada(s)`,
      dados.puladas > 0 ? { description: `${dados.puladas} pulada(s) por já existir no banco.` } : undefined
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[15px] border-2 border-dashed px-6 py-12 text-center transition ${
          arrastando ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        }`}
      >
        <p className="font-medium">Arraste o arquivo .xlsx aqui ou clique para selecionar</p>
        <p className="text-sm text-muted-foreground">
          Cabeçalho do RoomingList deve estar na linha 5, formato padrão Snow Operadora.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {preview.status === "carregando" ? (
        <p className="text-sm text-muted-foreground">Processando arquivo...</p>
      ) : null}

      {preview.status === "erro" ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{preview.mensagem}</p>
            {preview.colunasFaltantes ? (
              <p className="mt-1 text-sm">
                Colunas faltantes: {preview.colunasFaltantes.join(", ")}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {preview.status === "pronto" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {preview.reservas.length} reserva(s) consolidada(s) por localizador em{" "}
              <strong>{preview.arquivoNome}</strong>
            </p>
            <Button
              onClick={confirmarImportacao}
              disabled={
                confirmacao.status === "enviando" ||
                preview.reservas.every((reserva) => reserva.jaProcessado)
              }
            >
              {confirmacao.status === "enviando" ? "Importando..." : "Confirmar importação"}
            </Button>
          </div>

          {confirmacao.status === "sucesso" ? (
            <Alert>
              <AlertDescription>
                {confirmacao.importadas} reserva(s) importada(s)
                {confirmacao.puladas > 0
                  ? `, ${confirmacao.puladas} pulada(s) por já existir no banco.`
                  : "."}
              </AlertDescription>
            </Alert>
          ) : null}

          {confirmacao.status === "erro" ? (
            <Alert variant="destructive">
              <AlertDescription>{confirmacao.mensagem}</AlertDescription>
            </Alert>
          ) : null}

          <div className="overflow-x-auto rounded-[15px] border border-border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-28">Localizador</TableHead>
                  <TableHead className="w-64">Hotel</TableHead>
                  <TableHead className="w-24">Check-in</TableHead>
                  <TableHead className="w-24">Check-out</TableHead>
                  <TableHead className="w-48">Regime</TableHead>
                  <TableHead>Hóspedes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.reservas.map((reserva) => (
                  <TableRow key={`${reserva.localizador}::${reserva.hotelNome}`}>
                    <TableCell>
                      {reserva.jaProcessado ? (
                        <Badge variant="secondary" title={reserva.jaProcessadoEm ?? undefined}>
                          Já processado
                          {reserva.jaProcessadoEm
                            ? ` em ${new Date(reserva.jaProcessadoEm).toLocaleDateString("pt-BR")}`
                            : ""}
                        </Badge>
                      ) : (
                        <Badge>Novo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{reserva.localizador}</TableCell>
                    <TableCell className="truncate" title={reserva.hotelNome}>
                      {reserva.hotelNome}
                      {!reserva.hotelId ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (hotel novo — e-mail/país serão buscados automaticamente ao confirmar)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{reserva.dataCheckin ?? "—"}</TableCell>
                    <TableCell>{reserva.dataCheckout ?? "—"}</TableCell>
                    <TableCell className="truncate" title={reserva.regimeAlimentar ?? ""}>
                      {reserva.regimeAlimentar ?? "—"}
                    </TableCell>
                    <TableCell
                      className="truncate"
                      title={reserva.hospedes.map((hospede) => hospede.nome).join(", ")}
                    >
                      {reserva.hospedes.map((hospede) => hospede.nome).join(", ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
