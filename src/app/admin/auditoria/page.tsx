import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";
import { AuditLogTable } from "./audit-log-table";

async function AuditLogTableGuarded() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile || profile.role !== "admin" || !profile.active) {
    redirect("/dashboard");
  }

  return <AuditLogTable />;
}

export default function AdminAuditoriaPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
            <AuditLogTableGuarded />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
