import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";

async function DashboardGreeting() {
  const { profile } = await getCurrentUserWithProfile();

  return (
    <>Olá, {profile?.full_name ?? "consultor"}. O dashboard completo chega no Milestone 4.</>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Dashboard de auditoria</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <Suspense fallback={null}>
            <DashboardGreeting />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
