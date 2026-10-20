import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HotelsTable } from "./hotels-table";

export default function HoteisPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Banco de contatos de hotéis</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
            <HotelsTable />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
