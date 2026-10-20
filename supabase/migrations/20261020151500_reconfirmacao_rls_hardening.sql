-- Ajustes pós-revisão supabase-rls-reviewer da migration do Milestone 2
-- (20261020150000_reconfirmacao_domain_schema.sql).

-- Decisão de design: bounce é UPDATE do email_sends.status existente
-- (enviado -> bounce), não um novo registro — é o mesmo envio que falhou
-- depois de aceito pelo Graph, não um novo envio. Faltava a policy de UPDATE
-- correspondente; sem ela, o job de detecção de bounce (Milestone 7/10)
-- falharia silenciosamente sob RLS (0 rows affected, sem erro visível).
create policy email_sends_update on reconfirmacao.email_sends
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

-- hotel_replies permanece sem policy de UPDATE: resposta do hotel é fato
-- histórico imutável; uma tréplica gera nova linha, nunca edita a anterior.

-- Hardening: a função é security definer e por padrão executável por PUBLIC
-- (inclui `anon`). Não é um bug — a função só lê auth.uid() do chamador, não
-- pode ser usada para checar outro usuário — mas restringe a superfície.
revoke execute on function reconfirmacao.is_active_authenticated_user() from public;
grant execute on function reconfirmacao.is_active_authenticated_user() to authenticated;
