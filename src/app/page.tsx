import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="snow-hero px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Reconfirmação de reservas de hotel
          </h1>
          <p className="mt-4 max-w-xl text-white/80">
            Automatiza o envio e o acompanhamento de e-mails de reconfirmação
            para a Snow Operadora.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard de auditoria</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Disponível a partir do Milestone 4.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Importar RoomingList</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Disponível a partir do Milestone 3.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Banco de hotéis</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Disponível a partir do Milestone 5.
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
