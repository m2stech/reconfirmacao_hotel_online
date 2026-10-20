import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snow Reconfirmação de Hotéis",
  description: "Reconfirmação de reservas de hotel para a Snow Operadora",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
