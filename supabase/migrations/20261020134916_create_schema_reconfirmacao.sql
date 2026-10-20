-- Schema isolado do domínio de reconfirmação de hotéis.
-- Projeto Supabase compartilhado com o TripQuote: nenhuma tabela nova deste
-- sistema nasce em `public` (ver CLAUDE.md "Banco de dados").
create schema if not exists reconfirmacao;

-- Tabelas de domínio são criadas no Milestone 2 (reconfirmacao.hotels,
-- reservations, email_sends, hotel_replies, audit_status), já com RLS.
