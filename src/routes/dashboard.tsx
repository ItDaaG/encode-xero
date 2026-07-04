import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layers, LogOut } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FlowSync" },
      { name: "description", content: "Your FlowSync dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FlowSync</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 font-medium hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-card p-10">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dashboard</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Welcome to FlowSync 👋</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This is where your consolidated multi-entity view will live. Xero connections, branch ranking, live FX,
            and anomaly alerts are all coming next.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { title: "Connected entities", value: "0", hint: "No Xero organisations yet" },
              { title: "Home currency", value: "—", hint: "Set once entities are connected" },
              { title: "Alerts this week", value: "0", hint: "Nothing to report" },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.title}</div>
                <div className="mt-2 text-3xl font-semibold">{c.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}