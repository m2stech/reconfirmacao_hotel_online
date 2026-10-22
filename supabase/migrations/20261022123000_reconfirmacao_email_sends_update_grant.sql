-- Milestone 11 — lacuna real descoberta no teste de integração manual da
-- cobrança automática: a policy `email_sends_update` existe desde o
-- hardening do Milestone 2/3 (20261020151500, pensada para marcação de
-- bounce), mas o GRANT UPDATE correspondente nunca foi concedido — nem a
-- `authenticated` nem a `service_role` (20261020174225 só deu
-- `select, insert` a email_sends). RLS sem o GRANT de base é sempre
-- "permission denied" antes da policy ser avaliada — mesma classe de lacuna
-- já vista nos Milestones 2/3/5/8 deste projeto. Sem isso, nem o job de
-- cobrança (Milestone 11) nem uma futura detecção de bounce conseguem
-- atualizar email_sends.

grant update on reconfirmacao.email_sends to authenticated, service_role;
