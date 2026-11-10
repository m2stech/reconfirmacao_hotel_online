-- View de apoio à tela /admin/auditoria: resolve actor_id contra
-- public.profiles (nome/e-mail) para exibição, igual ao padrão já usado em
-- reconfirmacao.audit_status (view com join, Milestone 2).
-- audit_log não tem RLS própria compatível com embed automático do PostgREST
-- entre schemas diferentes (public <-> reconfirmacao) — a view resolve isso
-- no banco, numa única query paginável, sem N+1 no backend.

create view reconfirmacao.audit_log_detalhado as
select
  al.id,
  al.actor_id,
  p.full_name as actor_nome,
  p.email as actor_email,
  al.action,
  al.entity_type,
  al.entity_id,
  al.metadata,
  al.created_at
from reconfirmacao.audit_log al
left join public.profiles p on p.id = al.actor_id;

comment on view reconfirmacao.audit_log_detalhado is 'reconfirmacao.audit_log com nome/e-mail do ator resolvidos (join em public.profiles), para a tela /admin/auditoria. Mesma RLS de audit_log por ser security_invoker (padrão de view do Postgres) sobre tabela que já restringe SELECT a admin.';

-- View herda RLS da tabela base (security_invoker é o padrão desde PG15,
-- confirmado PG17 neste projeto) — já restrita a admin ativo via
-- audit_log_select_admin. Grant explícito necessário mesmo assim (GRANT de
-- view é independente do GRANT da tabela base). USAGE do schema já concedido
-- a authenticated/service_role em 20261020174225_reconfirmacao_schema_grants.sql
-- (grant de schema cobre objetos criados depois).
grant select on reconfirmacao.audit_log_detalhado to authenticated;
grant select on reconfirmacao.audit_log_detalhado to service_role;
