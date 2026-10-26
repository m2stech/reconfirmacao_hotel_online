"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotificacaoTipo = "revisao_humana" | "erro_envio" | "sla_esgotado";

type Notificacao = {
  id: string;
  tipo: NotificacaoTipo;
  mensagem: string;
  lida_em: string | null;
  created_at: string;
  reservations: { localizador: string } | null;
};

const ROTULO_TIPO: Record<NotificacaoTipo, string> = {
  revisao_humana: "Revisão humana",
  erro_envio: "Erro no envio",
  sla_esgotado: "Sem resposta após cobranças",
};

// Polling simples (intervalo fixo) em vez de realtime — suficiente para um
// indicador de notificação que não precisa ser instantâneo; mesmo padrão
// de simplicidade já usado no botão de verificação manual (Milestone 10).
const INTERVALO_POLLING_MS = 60_000;

export function NotificationsMenu() {
  const router = useRouter();
  const [naoLidas, setNaoLidas] = useState(0);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  async function carregar() {
    try {
      const resposta = await fetch("/api/notificacoes");
      if (!resposta.ok) return;
      const dados = await resposta.json();
      setNaoLidas(dados.naoLidas ?? 0);
      setNotificacoes(dados.notificacoes ?? []);
    } catch {
      // Falha de polling não deve quebrar a UI — tenta de novo no próximo intervalo.
    }
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, []);

  async function marcarComoLida(id: string) {
    await fetch(`/api/notificacoes/${id}`, { method: "PATCH" });
    await carregar();
    router.push("/dashboard");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
          >
            <Bell className="size-5" />
            {naoLidas > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notificações</DropdownMenuLabel>
          {notificacoes.length === 0 ? (
            <div className="px-1.5 py-2 text-sm text-muted-foreground">Nenhuma notificação.</div>
          ) : (
            notificacoes.map((notificacao) => (
              <DropdownMenuItem
                key={notificacao.id}
                className="flex-col items-start gap-0.5 whitespace-normal"
                onClick={() => marcarComoLida(notificacao.id)}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {ROTULO_TIPO[notificacao.tipo]}
                  {notificacao.lida_em === null ? " · não lida" : ""}
                </span>
                <span>{notificacao.mensagem}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
