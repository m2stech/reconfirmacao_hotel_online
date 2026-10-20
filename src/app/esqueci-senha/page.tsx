import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm snow-card">
        <CardHeader>
          <CardTitle className="text-xl">Esqueci minha senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Informe seu e-mail para receber um link de redefinição de senha.
          </p>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
