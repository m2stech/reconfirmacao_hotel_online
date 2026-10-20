-- Milestone 3 — descoberto ao testar o fluxo de importação de ponta a ponta:
-- expor o schema `reconfirmacao` no PostgREST (Settings → API → Exposed
-- schemas, já aplicado via Management API) não é suficiente — o Postgres
-- ainda nega acesso porque nenhuma migration anterior deu GRANT de
-- schema/tabela para authenticated/anon. RLS só se aplica depois do GRANT
-- básico existir; sem isso toda query falha com 42501 "permission denied
-- for schema reconfirmacao", mesmo com as policies corretas.

grant usage on schema reconfirmacao to authenticated, anon, service_role;

grant select, insert, update on reconfirmacao.hotels to authenticated, service_role;
grant select, insert, update on reconfirmacao.hotel_emails to authenticated, service_role;
grant select, insert, update on reconfirmacao.reservations to authenticated, service_role;
grant select, insert on reconfirmacao.email_sends to authenticated, service_role;
grant select, insert on reconfirmacao.hotel_replies to authenticated, service_role;
grant select on reconfirmacao.audit_status to authenticated, service_role;

-- Sequências/defaults usam gen_random_uuid(), não há sequence própria a
-- liberar. As quatro tabelas com trigger de updated_at já têm EXECUTE
-- liberado implicitamente (owner da função = migration anterior).
