-- Descoberto ao limpar dados de teste duplicados do Milestone 8 (bug de
-- confirmação dupla de importação): não havia GRANT DELETE em reservations
-- nem policy de DELETE — mesma classe de lacuna já corrigida para hotels na
-- migration 20261020200000 (RLS só é avaliada depois do GRANT de tabela
-- existir, sem isso o DELETE falha com 42501 mesmo para service_role).
--
-- service_role precisa poder apagar reserva para correção operacional de
-- dados (ex. duplicata criada por bug, como a que motivou esta migration);
-- authenticated (consultor/admin) não recebe DELETE aqui — exclusão de
-- reserva pelo usuário final não é uma operação do produto hoje, e um DELETE
-- direto em reservations cascateia para email_sends (on delete cascade) e,
-- por sua vez, hotel_replies — sem soft-delete nem confirmação de UI, não é
-- algo que deva ficar disponível sem uma funcionalidade de produto desenhada
-- para isso (revisão do agente supabase-rls-reviewer, Milestone 8 fix).
--
-- Nota: service_role tem BYPASSRLS por padrão no Supabase — o GRANT abaixo é
-- o controle real; a policy é apenas documentação da intenção (nunca é de
-- fato avaliada para essa role), diferente das demais policies deste schema,
-- todas `to authenticated`.

grant delete on reconfirmacao.reservations to service_role;

create policy reservations_delete_service_role on reconfirmacao.reservations
  for delete to service_role
  using (true);
