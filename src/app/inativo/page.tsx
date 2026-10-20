import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InactiveUserPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm snow-card">
        <CardHeader>
          <CardTitle className="text-xl">Conta desativada</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Seu acesso a este sistema foi desativado. Entre em contato com um administrador para
            reativar sua conta.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
