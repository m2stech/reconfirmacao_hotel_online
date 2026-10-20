"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CustoPorPeriodo = {
  periodo: string;
  chamadas: number;
  tokens_input: number;
  tokens_output: number;
  custo_usd: number;
};

const formatadorMoeda = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatadorNumero = new Intl.NumberFormat("pt-BR");

export function CostsTable() {
  const [custos, setCustos] = useState<CustoPorPeriodo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resposta = await fetch("/api/admin/custos");
        const dados = await resposta.json();
        if (!dados.ok) {
          setErro(dados.erro ?? "Falha ao carregar custos.");
          return;
        }
        setCustos(dados.custos);
      } catch {
        setErro("Falha ao carregar custos.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const totalCusto = custos.reduce((soma, linha) => soma + linha.custo_usd, 0);
  const totalChamadas = custos.reduce((soma, linha) => soma + linha.chamadas, 0);

  return (
    <div className="flex flex-col gap-4">
      {erro ? (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead className="text-right">Chamadas de IA</TableHead>
              <TableHead className="text-right">Tokens de entrada</TableHead>
              <TableHead className="text-right">Tokens de saída</TableHead>
              <TableHead className="text-right">Custo (USD)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : custos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma chamada de IA registrada ainda. Esta tela será populada a partir da
                  interpretação de respostas de hotel via OpenAI (Milestone 9).
                </TableCell>
              </TableRow>
            ) : (
              custos.map((linha) => (
                <TableRow key={linha.periodo}>
                  <TableCell className="font-medium">{linha.periodo}</TableCell>
                  <TableCell className="text-right">{formatadorNumero.format(linha.chamadas)}</TableCell>
                  <TableCell className="text-right">{formatadorNumero.format(linha.tokens_input)}</TableCell>
                  <TableCell className="text-right">{formatadorNumero.format(linha.tokens_output)}</TableCell>
                  <TableCell className="text-right">{formatadorMoeda.format(linha.custo_usd)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Total: {formatadorNumero.format(totalChamadas)} chamada(s), {formatadorMoeda.format(totalCusto)}
      </p>
    </div>
  );
}
