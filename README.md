# Reconfirmação de Hotéis — Web

Sistema web (Next.js + Supabase) para a Snow Operadora automatizar o envio e
acompanhamento de e-mails de reconfirmação de reservas a hotéis.

Documentação de produto e arquitetura: [`docs/PRD.md`](docs/PRD.md) e
[`CLAUDE.md`](CLAUDE.md). Plano de construção por milestones:
[`docs/PLAN.md`](docs/PLAN.md).

## Como rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Credenciais

Todas as credenciais (Supabase, OpenAI, Tavily, Microsoft Graph) ficam em
`.env` na raiz do projeto — nunca commitado. Veja `.env.example` para a lista
de chaves esperadas.

## Banco de dados

Projeto Supabase **compartilhado** com o TripQuote. As tabelas deste sistema
vivem isoladas no schema `reconfirmacao` (nunca em `public`). Migrations em
`supabase/migrations/`.
