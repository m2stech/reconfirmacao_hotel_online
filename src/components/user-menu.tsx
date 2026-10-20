"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-sidebar-foreground/80 sm:inline">{name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
      >
        Sair
      </Button>
    </div>
  );
}
