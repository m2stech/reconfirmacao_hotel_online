import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserWithProfile } from "@/lib/supabase/profile";
import { CostsTable } from "./costs-table";

async function CostsTableGuarded() {
  const { user, profile } = await getCurrentUserWithProfile();

  if (!user) {
    redirect("/login");
  }
  if (!profile || profile.role !== "admin" || !profile.active) {
    redirect("/dashboard");
  }

  return <CostsTable />;
}

export default function AdminCustosPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Custo de IA por período</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
            <CostsTableGuarded />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
