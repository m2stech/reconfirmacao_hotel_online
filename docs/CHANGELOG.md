# CHANGELOG — Reconfirmação de Hotéis (Web)

Histórico de mudanças pós-lançamento. `docs/PLAN.md` cobre a construção inicial (Milestones 0–13) e está concluído; a partir daqui, toda melhoria, correção ou débito técnico entra aqui, em ordem cronológica reversa (mais recente no topo).

Formato de cada entrada: data, título curto, o que mudou e por quê (não só o "o quê" — commits já contam isso).

---

## 2026-10-26 — Lançamento em produção (Milestone 13 concluído)

Projeto publicado em `reconfirmacao-hotel-online.vercel.app`. Hardening final: revisão consolidada de RLS (aprovada, sem bloqueantes), revisão de segurança (sem credencial exposta, rotas de job/admin protegidas), remoção de `GOOGLE_PLACES_API_KEY` morta, validação Zod em `/api/reservations/import/confirm`, troca de `MS_GRAPH_AUTHORIZED_EMAIL`/`NOTIFICACAO_EQUIPE_EMAIL` para `produtos1@bvgroup.com.br`.

Dois bugs de Next 16 Cache Components encontrados no teste de fumaça pós-deploy e corrigidos no mesmo dia:
- `/`, `/dashboard`, `/admin/custos` quebravam com "This page couldn't load" — `getCurrentUserWithProfile()` e `MetricCards` liam sessão/cookies sem `await connection()`, expondo `Date.now()` interno do SDK Supabase durante prerendering estático.
- Menu de notificações quebrava ao abrir (`MenuGroupContext is missing`) — `DropdownMenuLabel` usado sem o `DropdownMenuGroup` ancestral que o Base UI exige.

Pendências fora do alcance deste repositório, registradas no Milestone 13 do PLAN, aguardando ação manual do usuário:
- Redirect URLs de produção no Supabase (Authentication → URL Configuration) — mudança de infraestrutura compartilhada com o TripQuote.
- Budget alert na OpenAI e no Tavily (PRD §12.5) — configuração nos painéis desses provedores.

---

## Débito técnico conhecido (candidatos a próximas melhorias)

Lista viva — mover para uma entrada datada acima quando resolvido, não apagar daqui até lá.

- **DELETE de hotel cascateia `hotel_emails` silenciosamente.** Fora do fluxo de merge, qualquer consultor autenticado pode apagar um hotel e perder e-mails de contato vinculados sem aviso (`on delete cascade`, sem soft-delete). Sugestão do `supabase-rls-reviewer` (Milestone 13): revogar DELETE de `authenticated` em `hotels`/`hotel_emails` (mesmo padrão já usado em `reservations_delete_service_role`) ou adicionar trigger de bloqueio fora do merge.
- **DELETEs de correção via `service_role` não deixam rastro em `audit_log`.** Sem soft-delete/histórico, uma remoção manual de dado (hotel/reserva duplicada, por exemplo) não é auditável depois do fato. Mitigação simples: inserir manualmente uma linha em `public.audit_log` antes/depois de qualquer DELETE desse tipo.
- **`hotel_replies` sem coluna de "versão do prompt".** Se o prompt de interpretação de IA mudar ao longo do tempo, não há como correlacionar custo/qualidade por versão retroativamente — só rastreável pelo histórico de commits do prompt em si.
- **Usuário de sistema (`sistema-jobs@reconfirmacao.internal`) sem marcação visual em `/admin/usuarios`.** Aparece na lista como se fosse um consultor real; mitigação cosmética pendente (badge ou filtro).
- **Limite de Cron Jobs do plano Vercel Hobby (1x/dia).** Leitura de resposta de hotel só roda 1x/dia (mitigado parcialmente pelo botão manual "Verificar respostas agora"); reavaliar upgrade para o plano Pro (cron por minuto) quando o volume de uso justificar o custo.
- **Convite de usuário e reset de senha redirecionam para o domínio do TripQuote.** Templates de e-mail (Authentication → Emails, compartilhados por projeto Supabase) montam o link manualmente com `{{.SiteURL}}` fixo, ignorando `redirectTo`. Requer decisão de produto que afeta os dois sistemas (ajustar template/Site URL, ou hub de login próprio) — não resolvido no escopo deste repositório.
