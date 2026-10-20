import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm snow-card">
        <CardHeader>
          <CardTitle className="text-xl">Entrar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Acesse com a mesma conta usada no SnowQuote.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
