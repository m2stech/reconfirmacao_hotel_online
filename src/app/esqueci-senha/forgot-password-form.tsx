"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    setStatus(error ? "error" : "sent");
    setLoading(false);
  }

  if (status === "sent") {
    return (
      <Alert>
        <AlertDescription>
          Se houver uma conta com esse e-mail, você vai receber um link para redefinir a senha.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível enviar o e-mail agora. Tente novamente em instantes.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={loading} className="mt-2">
        {loading ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
