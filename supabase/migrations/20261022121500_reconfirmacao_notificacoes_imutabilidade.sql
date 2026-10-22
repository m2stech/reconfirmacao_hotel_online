-- Milestone 11 — defesa em profundidade apontada pelo supabase-rls-reviewer:
-- hoje `tipo`/`mensagem`/`reservation_id` de reconfirmacao.notificacoes só
-- não são alteráveis pelo client porque o GRANT UPDATE é restrito à coluna
-- `lida_em` (20261022120000). Isso funciona, mas depende de nenhuma
-- migration futura alargar esse GRANT por engano. Trigger abaixo garante a
-- imutabilidade desses campos mesmo que isso aconteça — nunca bloqueia
-- service_role, que pode precisar corrigir dado por manutenção.

create function reconfirmacao.impedir_alteracao_notificacao()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.tipo is distinct from old.tipo
    or new.mensagem is distinct from old.mensagem
    or new.reservation_id is distinct from old.reservation_id
  then
    raise exception 'Apenas lida_em pode ser alterado em reconfirmacao.notificacoes.';
  end if;

  return new;
end;
$$;

create trigger notificacoes_impedir_alteracao
  before update on reconfirmacao.notificacoes
  for each row execute function reconfirmacao.impedir_alteracao_notificacao();
