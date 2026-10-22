import Link from "next/link";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";
import { UserMenu } from "@/components/user-menu";
import { NotificationsMenu } from "@/components/notifications-menu";

export async function SiteHeader() {
  const { user, profile } = await getCurrentUserWithProfile();

  return (
    <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            SR
          </span>
          <span className="text-sm sm:text-base">Snow Reconfirmação</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 text-sm sm:flex">
              <Link href="/dashboard" className="text-sidebar-foreground/80 transition hover:text-sidebar-foreground">
                Dashboard
              </Link>
              <Link href="/reservas/importar" className="text-sidebar-foreground/80 transition hover:text-sidebar-foreground">
                Importar
              </Link>
              <Link href="/hoteis" className="text-sidebar-foreground/80 transition hover:text-sidebar-foreground">
                Hotéis
              </Link>
              {profile?.role === "admin" ? (
                <>
                  <Link href="/admin/usuarios" className="text-sidebar-foreground/80 transition hover:text-sidebar-foreground">
                    Usuários
                  </Link>
                  <Link href="/admin/custos" className="text-sidebar-foreground/80 transition hover:text-sidebar-foreground">
                    Custos de IA
                  </Link>
                </>
              ) : null}
            </nav>
            <NotificationsMenu />
            <UserMenu name={profile?.full_name ?? user.email ?? ""} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
