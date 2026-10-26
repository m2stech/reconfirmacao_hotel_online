import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { METRICA_CARDS } from "@/features/audit/status";

export async function MetricCards() {
  // Mesmo boundary dinâmico de getCurrentUserWithProfile (Milestone 13) —
  // sem isso, o Next 16 Cache Components tenta prerenderizar esta query e
  // expõe Date.now() do SDK Supabase (checagem de sessão) como erro.
  await connection();
  const supabase = await createClient();

  const contagens = await Promise.all(
    METRICA_CARDS.map(async ({ status }) => {
      let query = supabase
        .schema("reconfirmacao")
        .from("audit_status")
        .select("*", { count: "exact", head: true });
      if (status !== "TOTAL") query = query.eq("status", status);
      const { count } = await query;
      return count ?? 0;
    })
  );

  const metricas = METRICA_CARDS.map((card, indice) => ({ ...card, total: contagens[indice] }));

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {metricas.map((metrica) => (
        <a key={metrica.status} href={metrica.status === "TOTAL" ? "/dashboard" : `/dashboard?status=${metrica.status}`}>
          <Card className="snow-card transition hover:border-primary">
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="text-2xl font-semibold text-foreground">{metrica.total}</span>
              <span className="text-xs text-muted-foreground">{metrica.label}</span>
            </CardContent>
          </Card>
        </a>
      ))}
    </div>
  );
}
