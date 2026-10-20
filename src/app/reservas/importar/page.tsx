import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportForm } from "./import-form";

export default function ImportarReservasPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <Card className="snow-card">
        <CardHeader>
          <CardTitle>Importar RoomingList</CardTitle>
          <p className="text-sm text-muted-foreground">
            Suba o arquivo .xlsx recebido do fornecedor. As reservas são consolidadas por
            Localizador antes de serem gravadas — o envio de e-mail de reconfirmação é feito
            depois, no dashboard de auditoria.
          </p>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
    </main>
  );
}
