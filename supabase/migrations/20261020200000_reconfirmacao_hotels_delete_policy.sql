-- Milestone 5 — ação de mesclar hotéis duplicados precisa excluir o registro
-- duplicado depois de reatribuir reservas/e-mails ao hotel principal. Nota
-- deixada na migration do Milestone 2: faltava policy de DELETE em
-- `hotels`/`hotel_emails`, inexistente até aqui.
--
-- RLS só é avaliada depois do GRANT básico de tabela existir (ver migration
-- 20261020174225_reconfirmacao_schema_grants.sql, Milestone 3) — sem o
-- GRANT, o DELETE falha com 42501 mesmo com a policy correta. As migrations
-- anteriores (174225, 151500) já corrigiram esse mesmo padrão de lacuna
-- (grant esquecido / policy de UPDATE esquecida); replicando aqui o grant
-- junto da policy para não repetir o erro uma terceira vez.

create policy hotels_delete on reconfirmacao.hotels
  for delete to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy hotel_emails_delete on reconfirmacao.hotel_emails
  for delete to authenticated
  using (reconfirmacao.is_active_authenticated_user());

grant delete on reconfirmacao.hotels to authenticated, service_role;
grant delete on reconfirmacao.hotel_emails to authenticated, service_role;

-- Nota para o Milestone 6 (painel admin): DELETE direto em `hotels` fora do
-- fluxo `mesclarHoteis` (src/features/hotels/queries.ts) tem comportamento
-- assimétrico hoje — um hotel com reservas vinculadas falha com violação de
-- FK (reservations.hotel_id não tem on delete cascade/set null, erro 23503
-- cru para o usuário), enquanto um hotel com e-mails vinculados cascateia e
-- apaga os e-mails silenciosamente (hotel_emails.hotel_id tem on delete
-- cascade). Nenhum dos dois é "mesclar" — avaliar no Milestone 6 se DELETE
-- direto deve ser restrito a admin ou removido da superfície do client.
