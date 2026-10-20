import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snow Reconfirmação de Hotéis",
  description: "Reconfirmação de reservas de hotel para a Snow Operadora",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Suspense fallback={<div className="h-16 border-b border-sidebar-border bg-sidebar" />}>
          <SiteHeader />
        </Suspense>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
