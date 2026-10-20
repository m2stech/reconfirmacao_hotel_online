---
name: db-migration
description: Cria migration Supabase com RLS e políticas para uma tabela ou bucket do TripQuote.
---

1. Crie arquivo em `supabase/migrations/` com timestamp e nome descritivo.
2. Habilite RLS e crie políticas por operação/papel (consultor: próprios registros; admin: gestão).
3. Inclua colunas de auditoria (`created_at`, `created_by`) e, para gerações, modelo/tokens/custo/`prompt_version_id`/status.
4. Atualize tipos gerados e schemas Zod relacionados.
5. Acione o agente `supabase-rls-reviewer` antes de concluir.
