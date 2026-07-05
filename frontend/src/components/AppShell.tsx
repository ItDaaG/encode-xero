// Shared sidebar navigation + auth guard for every signed-in page
// (dashboard, tax, legislation). Centralizes what used to be a near-
// identical top header + session check duplicated on each page.
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CurrencySelector } from "@/components/CurrencySelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Layers, LayoutDashboard, Receipt, MessageCircleQuestion, FileDown, TrendingUp, Link2, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tax", label: "Tax", icon: Receipt },
  { to: "/fx-trends", label: "Currency Trends", icon: TrendingUp },
  { to: "/legislation", label: "Legislation Assistant", icon: MessageCircleQuestion },
  { to: "/reports", label: "Reports", icon: FileDown },
  { to: "/auth/connect", label: "Connect Xero", icon: Link2 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      setEmail(data.session.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth", replace: true });
      else setEmail(session.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowSync</span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu className="gap-1 px-2">
            {NAV_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname === item.to}>
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter className="gap-3 p-4">
          <div className="truncate text-xs text-muted-foreground">{email}</div>
          <div className="flex items-center gap-2">
            <CurrencySelector />
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
