// Cria um usuário "sistema" fixo em auth.users/public.profiles, usado como
// actor_id de audit_log para ações automáticas disparadas pelos jobs de
// Cron (Milestone 10) — nunca faz login real, só serve de FK obrigatória
// (public.audit_log.actor_id é NOT NULL, schema do TripQuote, compartilhado
// e não alterável por este sistema).
//
// Idempotente: se o usuário já existir (mesmo e-mail), não cria de novo.
//
// Uso: npx tsx src/lib/jobs/__integration__/criar-usuario-sistema.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // noop
}

import { createServiceRoleClient } from "@/lib/supabase/service-role";

const EMAIL_SISTEMA = "sistema-jobs@reconfirmacao.internal";

async function main() {
  const supabase = createServiceRoleClient();

  const { data: existentes, error: erroLista } = await supabase.auth.admin.listUsers();
  if (erroLista) throw erroLista;

  const jaExiste = existentes.users.find((u) => u.email === EMAIL_SISTEMA);
  if (jaExiste) {
    console.log("Usuário de sistema já existe:", jaExiste.id);
    return;
  }

  const { data: criado, error: erroCriacao } = await supabase.auth.admin.createUser({
    email: EMAIL_SISTEMA,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { nome_sistema: "Jobs automáticos (Reconfirmação de Hotéis)" },
  });
  if (erroCriacao) throw erroCriacao;
  console.log("Usuário de sistema criado em auth.users:", criado.user.id);

  // role: 'consultant' é suficiente — as policies RLS de `reconfirmacao`
  // (ver supabase/migrations/20261020150000_reconfirmacao_domain_schema.sql,
  // reconfirmacao.is_active_authenticated_user()) checam apenas
  // `profiles.active = true`, nunca `role`. 'admin' concederia acesso real
  // ao painel /admin/usuarios e a ações administrativas caso alguém
  // conseguisse logar como este usuário — privilégio que os jobs nunca usam.
  const { error: erroProfile } = await supabase
    .from("profiles")
    .update({ full_name: "Sistema (jobs automáticos)", role: "consultant" })
    .eq("id", criado.user.id);
  if (erroProfile) throw erroProfile;

  console.log("\nProfile atualizado. Guarde este id para uso em CRON_SYSTEM_USER_ID:");
  console.log(criado.user.id);
}

main().catch((erro) => {
  console.error(JSON.stringify(erro, null, 2));
  process.exitCode = 1;
});
