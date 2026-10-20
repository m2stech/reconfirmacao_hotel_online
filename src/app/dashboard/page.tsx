import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCards } from "./metric-cards";
import { AuditTable } from "./audit-table";

function MetricCardsFallback() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, indice) => (
        <Card key={indice} className="snow-card">
          <CardContent className="flex flex-col gap-1 py-4">
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <Suspense fallback={<MetricCardsFallback />}>
        <MetricCards />
      </Suspense>

      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Reservas</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
            <AuditTable />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
