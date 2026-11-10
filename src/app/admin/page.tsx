import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";

const SECOES = [
  {
    numero: "01",
    titulo: "Usuários",
    descricao: "Convide, ative/desative e defina o papel de cada usuário.",
    href: "/admin/usuarios",
  },
  {
    numero: "02",
    titulo: "Custos de IA",
    descricao: "Acompanhe tokens e custo estimado por interpretação de resposta.",
    href: "/admin/custos",
  },
  {
    numero: "03",
    titulo: "Auditoria",
    descricao: "Ações administrativas e operacionais registradas no sistema.",
    href: "/admin/auditoria",
  },
];

async function AdminHubGuarded() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile || profile.role !== "admin" || !profile.active) {
    redirect("/dashboard");
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SECOES.map((secao) => (
        <Link
          key={secao.href}
          href={secao.href}
          className="snow-card flex flex-col gap-2 p-6 transition hover:shadow-md"
        >
          <span className="text-sm font-semibold text-accent">{secao.numero}</span>
          <h2 className="text-lg font-semibold text-foreground">{secao.titulo}</h2>
          <p className="text-sm text-muted-foreground">{secao.descricao}</p>
          <span className="mt-2 text-sm font-medium text-primary">Acessar →</span>
        </Link>
      ))}
    </div>
  );
}

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div
        className="rounded-[15px] px-6 py-8 text-primary-foreground sm:px-10"
        style={{ background: "linear-gradient(135deg, #102b43, #175171)" }}
      >
        <h1 className="text-2xl font-semibold sm:text-3xl">Administração</h1>
        <p className="mt-2 text-sm text-primary-foreground/80 sm:text-base">
          Gestão de usuários, custos de IA e auditoria do sistema.
        </p>
      </div>

      <Suspense
        fallback={<p className="mt-8 text-sm text-muted-foreground">Carregando...</p>}
      >
        <AdminHubGuarded />
      </Suspense>
    </main>
  );
}
