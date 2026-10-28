# CHANGELOG — Reconfirmação de Hotéis (Web)

Histórico de mudanças pós-lançamento. `docs/PLAN.md` cobre a construção inicial (Milestones 0–13) e está concluído; a partir daqui, toda melhoria, correção ou débito técnico entra aqui, em ordem cronológica reversa (mais recente no topo).

Formato de cada entrada: data, título curto, o que mudou e por quê (não só o "o quê" — commits já contam isso).

---

## 2026-10-28 — Correção de e-mail errado do hotel e reenvio no dialog de reserva

Caso real: reserva 7FX157 caiu em REVISAR porque o e-mail cadastrado do hotel (MR Hotel) estava errado — a resposta recebida veio de um domínio/fornecedor diferente (M&R Hotel Management vs. HotelDo nos dados da reserva), sem referência à reserva. Sem como corrigir o e-mail e reenviar pela própria tela, o consultor dependia de replicar manualmente o fluxo de `/hoteis` e depois reenviar por fora.

Novo botão "Corrigir e-mail do hotel" em `ReservationDetailDialog`, ao lado de "Histórico com o hotel" (só aparece quando já há envio registrado). Abre um campo de e-mail que, ao salvar, chama a nova rota `POST /api/reservations/[id]/corrigir-email-e-reenviar`:

- Marca como `obsoleto` todo e-mail ativo (`confirmado` ou `sugerido`) do hotel em `hotel_emails` — evita que o e-mail errado continue sendo usado em outras reservas do mesmo hotel.
- Insere o e-mail corrigido já como `confirmado` (mesmo nível de confiança de uma correção manual em `/hoteis`); se já existir (unique `hotel_id, email`), reconfirma em vez de duplicar.
- Reenvia a reconfirmação como um **novo envio original** (`enviarReconfirmacaoInicial`, `tipo: 'reconfirmacao_inicial'`), não como `reenvio` de uma thread — o e-mail errado nem é o mesmo hotel/pessoa, então não faz sentido responder a ele.
- Zera `reservations.status_manual` para o status automático recalcular a partir do novo `email_send` (view `audit_status` usa sempre o último envio) — a reserva volta para `AGUARDANDO_RESPOSTA` em vez de continuar presa em `REVISAR` por causa da resposta antiga.

O histórico anterior (envio e resposta divergente) continua visível no dialog, sem ser apagado — só deixa de determinar o status atual.

---

## 2026-10-27 — Scroll no modal de detalhe da reserva

Com o e-mail completo do hotel (melhoria anterior) e sua tradução expandidos, o conteúdo do `ReservationDetailDialog` passou a ultrapassar a altura da tela em respostas longas, cortando o topo (título) e o rodapé (botões Cancelar/Salvar) para fora da área visível — sem como rolar.

`DialogContent` (componente genérico em `components/ui/dialog.tsx`) não tem `max-height`/`overflow` por padrão; não alterado ali para não afetar outros dialogs do app. Em vez disso, `max-h-[85vh] overflow-y-auto` foi adicionado só na instância deste dialog (`reservation-detail-dialog.tsx`). Efeito colateral aceito: `DialogFooter` (que antes ficava fixo colado na borda inferior) agora rola junto com o resto do conteúdo — troca razoável por garantir que título e botões fiquem sempre alcançáveis via scroll.

---

## 2026-10-27 — Botão de tradução do e-mail completo do hotel

Segue direto da melhoria anterior (abaixo): como o e-mail completo do hotel passou a ficar visível, boa parte chega em inglês/alemão/espanhol (hotéis internacionais) e o consultor pediu uma forma de traduzir sem sair da tela.

- Nova função `traduzirTextoIA` em `lib/openai/client.ts`: chamada simples ao `gpt-5-nano` (sem JSON Schema), prompt fixo de tradução PT-BR preservando números/nomes/formatação.
- Nova rota `POST /api/hotel-replies/[id]/traduzir`: busca `corpo_texto` da resposta pelo `hotel_replies.id` e traduz. Sem `audit_log` — é leitura, não altera estado da reserva.
- `ReservationDetailDialog`: botão "Traduzir para português" dentro do `<details>` do e-mail completo, com cache em memória por `hotel_replies.id` (não retraduz ao alternar "Ver original"/"Ver tradução") e chamada só sob demanda — nunca automática, para não gerar custo de API em todo envio/carregamento de tela (PRD §7 nunca se aplica aqui pois é ação explícita do usuário, não teste, mas o princípio de não gastar API à toa segue valendo).

---

## 2026-10-27 — Dialog de reserva mostra o e-mail completo do hotel, não só o resumo da IA

Usuário reportou que, para validar uma resposta divergente com confiança, precisava ver a mensagem real do hotel — só tinha acesso ao `resumo` gerado pelo `gpt-5-nano`, que pode errar ou simplificar demais (caso real: resumo apontando "divergência de fornecedor" sem o consultor conseguir conferir o texto original).

`reconfirmacao.hotel_replies.corpo_texto` (corpo integral da resposta do hotel) já era gravado desde o Milestone 6 e já vinha na resposta de `/api/audit/[id]` (`select("*, hotel_replies(*)")`), só não era exibido. Adicionado um `<details>` "Ver e-mail completo do hotel" em `ReservationDetailDialog` sob cada resposta, mostrando `corpo_texto` com `whitespace-pre-wrap`. Nenhuma mudança de API ou migration necessária — só UI.

---

## 2026-10-26 — Correção: e-mail "sugerido" (Tavily) também dispara envio automático

Bug reportado pelo usuário logo após o deploy da mudança anterior: a tela `/hoteis` continuava mostrando e-mails recém-encontrados pelo Tavily como "A confirmar" e o import não disparava envio para eles — a trava de "só e-mail confirmado por humano dispara envio automático" (PRD §4.2 item 2) nunca tinha sido removida, só o status `NAO_ENVIADO`/`EMAIL_NAO_ENCONTRADO` foi ajustado por cima dela. Resultado: toda reserva cujo hotel só tinha e-mail sugerido continuava sem envio, sem diferença prática do comportamento antigo.

Corrigido removendo essa trava a pedido explícito do usuário (volume real de reservas torna inviável revisar e-mail por e-mail antes de cada import):
- `/api/reservations/import/confirm`: usa qualquer e-mail do hotel (prioriza `confirmado` quando há mais de um, mas não exige mais).
- Migration `20261026140000`: `EMAIL_NAO_ENCONTRADO` na view `audit_status` agora significa "nenhum e-mail cadastrado" (confirmado ou sugerido), não mais "nenhum confirmado".
- `/api/audit/[id]` e `ReservationDetailDialog`: campo renomeado de `temEmailConfirmado` para `temEmailDisponivel`, mesma mudança de semântica.

A confirmação manual em `/hoteis` continua existindo como ação do consultor (ele ainda pode promover um e-mail sugerido a confirmado, ou corrigi-lo), só deixou de ser pré-requisito do primeiro envio.

---

## 2026-10-26 — Envio automático pós-import e status "E-mail não encontrado"

Dois problemas reportados pelo usuário em teste de produção no localhost, com volume real de reservas:

1. **Import exigia aprovação implícita demais.** O botão da tela de upload se chamava "Confirmar importação" e dava a entender que o envio dos e-mails ficava pendente de uma segunda etapa — na prática o backend (`/api/reservations/import/confirm`) já envia automaticamente para todo hotel com e-mail confirmado desde o Milestone 7, sem exigir aprovação por reserva. Renomeado o botão/mensagens para deixar isso explícito (`import-form.tsx`): "Importar e enviar reconfirmações".
2. **Hotel sem e-mail confirmado caía em `NAO_ENVIADO`**, indistinguível de "ainda não processamos essa reserva" — o consultor não tinha como saber, olhando o dashboard, que aquele caso específico precisava de ação manual (inserir e-mail). Resolvido com:
   - Novo valor de status `EMAIL_NAO_ENCONTRADO` no enum `reconfirmacao.audit_status_manual` e recálculo da view `reconfirmacao.audit_status` (migration `20261026130000`): quando não há `hotel_emails` com `confiabilidade = 'confirmado'` para o hotel da reserva **e** nunca houve tentativa de envio, o status passa a ser `EMAIL_NAO_ENCONTRADO` em vez de `NAO_ENVIADO`.
   - Nova rota `POST /api/reservations/[id]/enviar-com-email-manual`: grava o e-mail informado pelo consultor em `hotel_emails` (já como `confirmado`, mesmo nível de confiança de uma confirmação em `/hoteis`) e dispara `enviarReconfirmacaoInicial` na mesma chamada.
   - `ReservationDetailDialog` passa a mostrar um campo de e-mail + botão "Enviar reconfirmação" quando a reserva não tem envio nem e-mail confirmado (`/api/audit/[id]` agora retorna `temEmailConfirmado`).

Essa migration reaproveita exatamente o padrão de aplicação via Supabase Management API (`SUPABASE_ACCESS_TOKEN` + `/v1/projects/{ref}/database/query`) já usado nas sessões anteriores, porque o histórico de migrations do CLI diverge do estado real do projeto (compartilhado com o TripQuote, que aplica as suas por fora deste repositório) — `supabase db push` não é seguro aqui.

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
