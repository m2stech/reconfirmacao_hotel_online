-- Tabela de audit_log exclusiva deste sistema, no schema reconfirmacao.
-- Até aqui todo insert de auditoria deste domínio ia para public.audit_log,
-- tabela que pertence ao TripQuote (CLAUDE.md "Banco de dados" documentava
-- esse compartilhamento como intencional). Na prática não há benefício real
-- em compartilhar: nenhuma tela lê audit_log hoje, o isolamento entre os dois
-- produtos já era feito só por convenção de entity_type (risco de colisão
-- futura), e o objetivo imediato (tela /admin/auditoria, só para role=admin)
-- é mais simples de construir com RLS própria neste schema. Decisão do
-- usuário: migrar de vez, nunca mais escrever em public.audit_log a partir
-- deste sistema.
--
-- Mesma forma de coluna da tabela de origem (public.audit_log), confirmada
-- via information_schema antes de escrever esta migration.

create table reconfirmacao.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table reconfirmacao.audit_log is 'Auditoria exclusiva deste sistema (migrada de public.audit_log em 2026-11-10). entity_type usa os valores já em uso no código: reservation, email_send, hotel_reply, hotel, profile, broker, broker_send.';

create index audit_log_actor_id_idx on reconfirmacao.audit_log (actor_id);
create index audit_log_entity_idx on reconfirmacao.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on reconfirmacao.audit_log (created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================
-- Leitura restrita a admin (mesmo padrão já usado em public.audit_log do
-- TripQuote) — este log não segue a regra geral de "visão compartilhada entre
-- todo consultor" (CLAUDE.md) porque é dado sensível de auditoria, não dado
-- operacional do domínio; a tela futura de visualização é admin-only.
-- Escrita: nenhuma policy de INSERT para authenticated/anon — todo insert
-- deste sistema já é feito com SUPABASE_SERVICE_ROLE_KEY no backend (CLAUDE.md
-- "Schema public"), igual ao que já acontecia contra public.audit_log.

alter table reconfirmacao.audit_log enable row level security;

create function reconfirmacao.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'admin'
  );
$$;

revoke execute on function reconfirmacao.is_active_admin() from public;
grant execute on function reconfirmacao.is_active_admin() to authenticated;

create policy audit_log_select_admin on reconfirmacao.audit_log
  for select to authenticated
  using (reconfirmacao.is_active_admin());

-- ============================================================================
-- Grants
-- ============================================================================
-- Deliberadamente sem insert/update/delete para authenticated/anon — só
-- service_role grava (mesma restrição do CLAUDE.md para public.audit_log).

grant select, insert on reconfirmacao.audit_log to service_role;
grant select on reconfirmacao.audit_log to authenticated;

-- ============================================================================
-- Migração dos dados já existentes em public.audit_log
-- ============================================================================
-- Só os entity_type escritos por este sistema (confirmado via grep no código
-- e contagem real antes desta migration): reservation, email_send,
-- hotel_reply, hotel, profile. broker/broker_send não têm linha ainda, mas
-- entram na lista por completude — o filtro é por entity_type, não importa
-- se a contagem é 0. "quote" e "user" pertencem ao TripQuote e permanecem em
-- public.audit_log, intocados.

insert into reconfirmacao.audit_log (id, actor_id, action, entity_type, entity_id, metadata, created_at)
select id, actor_id, action, entity_type, entity_id, metadata, created_at
from public.audit_log
where entity_type in ('reservation', 'email_send', 'hotel_reply', 'hotel', 'profile', 'broker', 'broker_send');

delete from public.audit_log
where entity_type in ('reservation', 'email_send', 'hotel_reply', 'hotel', 'profile', 'broker', 'broker_send');
