import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm snow-card">
        <CardHeader>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <p className="text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
