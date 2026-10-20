import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";
import { UsersTable } from "./users-table";

async function UsersTableGuarded() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile || profile.role !== "admin" || !profile.active) {
    redirect("/dashboard");
  }

  return <UsersTable usuarioAtualId={user.id} />;
}

export default function AdminUsuariosPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
            <UsersTableGuarded />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
