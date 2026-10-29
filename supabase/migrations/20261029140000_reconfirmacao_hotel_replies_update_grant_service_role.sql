-- hotel_replies e fato historico imutavel por design (Milestone 2: resposta
-- do hotel nao e editada, treplica gera nova linha) -- por isso nunca teve
-- GRANT UPDATE nem policy de UPDATE, nem para service_role.
--
-- Caso real (2026-10-29, reserva 7FX157): a interpretacao da IA continha um
-- erro proprio (reserva_confirmada=NAO apesar do HCN ter sido extraido
-- corretamente -- ver CHANGELOG 2026-10-29 e correcao de prompt em
-- src/lib/openai/client.ts). Corrigir esse tipo de erro de interpretacao
-- exige reinterpretar a MESMA mensagem ja recebida e atualizar a linha
-- existente (nao criar uma linha nova -- nao houve nova mensagem do hotel).
-- Mesmo padrao ja usado para outras correcoes operacionais pontuais do
-- projeto (reservations_delete_grant do Milestone 8, email_sends_update_grant
-- do Milestone 11): GRANT restrito a service_role, nunca authenticated --
-- nao existe nem deve existir funcionalidade de produto para o consultor
-- editar a interpretacao de uma resposta pela UI.

grant update on reconfirmacao.hotel_replies to service_role;

comment on table reconfirmacao.hotel_replies is 'Respostas de hotel interpretadas (IA/regex). Fato historico: nunca editada pela UI/authenticated (sem policy/grant de UPDATE para esse role) -- treplica gera nova linha. UPDATE restrito a service_role existe apenas para correcao operacional pontual de erro de interpretacao da IA (ex. reinterpretar-7fx157.manual.ts, 2026-10-29), sempre registrada em audit_log.';
