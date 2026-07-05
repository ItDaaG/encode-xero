import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { xero, type CurrencyTotal, type EntityBreakdown, type XeroSummary } from "@/lib/xero";
import { Layers, LogOut } from "lucide-react";

function formatCurrencyTotals(totals: CurrencyTotal[], emptyHint: string): { value: string; hint: string } {
  if (totals.length === 0) return { value: "$0", hint: emptyHint };

  const format = (t: CurrencyTotal) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: t.currency }).format(t.total);

  const [first, ...rest] = totals;
  if (rest.length === 0) return { value: format(first), hint: "Across all connected entities" };

  return {
    value: format(first),
    hint: `+ ${rest.map(format).join(", ")} (mixed currencies, not FX-converted)`,
  };
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function formatPercent(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

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
  const [summary, setSummary] = useState<XeroSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    xero
      .getSummary()
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : "Failed to load Xero data."));
  }, [ready]);

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

  const entities = summary?.entities ?? [];

  const mostProfitable = entities.length
    ? entities.reduce((best, e) => (e.netProfit > best.netProfit ? e : best))
    : null;

  const leanest = entities.filter((e) => e.grossMargin !== null).length
    ? entities
        .filter((e): e is EntityBreakdown & { grossMargin: number } => e.grossMargin !== null)
        .reduce((best, e) => (e.grossMargin > best.grossMargin ? e : best))
    : null;

  const totalRevenueRaw = entities.reduce((sum, e) => sum + e.revenue, 0);

  const kpiTiles = [
    { title: "Connected entities", value: String(entities.length), hint: entities.length ? "Xero organisations" : "No Xero organisations yet" },
    summaryError
      ? { title: "Consolidated Revenue", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Revenue", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Revenue", ...formatCurrencyTotals(summary.consolidated.revenue, "No revenue yet") },
    summaryError
      ? { title: "Consolidated Net Profit", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Net Profit", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Net Profit", ...formatCurrencyTotals(summary.consolidated.netProfit, "No profit data yet") },
    summaryError
      ? { title: "Consolidated Expenses", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Expenses", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Expenses", ...formatCurrencyTotals(summary.consolidated.expenses, "No expense data yet") },
    summaryError
      ? { title: "Total Cash Position", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Total Cash Position", value: "…", hint: "Loading from Xero…" }
        : { title: "Total Cash Position", ...formatCurrencyTotals(summary.consolidated.cash, "No bank accounts found") },
  ];

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
            <Link
              to="/legislation"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 font-medium hover:bg-accent"
            >
              Legislation Assistant
            </Link>
            <Link
              to="/auth/connect"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 font-medium hover:bg-accent"
            >
              Connect Xero
            </Link>
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
            Your consolidated multi-entity view, pulled live from every connected Xero organisation.
          </p>

          {summary && summary.warnings && summary.warnings.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
              {summary.warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {kpiTiles.map((c) => (
              <div key={c.title} className="rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.title}</div>
                <div className="mt-2 text-3xl font-semibold">{c.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
              </div>
            ))}
          </div>

          {summary && entities.length > 0 && (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Most Profitable Branch
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{mostProfitable?.tenantName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {mostProfitable ? formatMoney(mostProfitable.netProfit, mostProfitable.currency) : "—"} net profit
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Leanest Branch
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{leanest?.tenantName ?? "N/A"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {leanest ? formatPercent(leanest.grossMargin) : "No Cost of Sales data"} gross margin
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Per-Entity Breakdown
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Entity</th>
                        <th className="py-2 pr-4 font-medium">Currency</th>
                        <th className="py-2 pr-4 font-medium">Revenue</th>
                        <th className="py-2 pr-4 font-medium">Net Profit</th>
                        <th className="py-2 pr-4 font-medium">Net Margin</th>
                        <th className="py-2 pr-4 font-medium">Gross Margin</th>
                        <th className="py-2 font-medium">Cash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entities.map((e) => (
                        <tr key={e.tenantId}>
                          <td className="py-2 pr-4 font-medium">{e.tenantName}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{e.currency}</td>
                          <td className="py-2 pr-4">{formatMoney(e.revenue, e.currency)}</td>
                          <td className="py-2 pr-4">{formatMoney(e.netProfit, e.currency)}</td>
                          <td className="py-2 pr-4">{formatPercent(e.netMargin)}</td>
                          <td className="py-2 pr-4">{formatPercent(e.grossMargin)}</td>
                          <td className="py-2">{e.cash === null ? "N/A" : formatMoney(e.cash, e.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalRevenueRaw > 0 && (
                <div className="mt-6 rounded-xl border border-border bg-background p-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Revenue Split by Entity
                  </div>
                  <div className="mt-4 space-y-3">
                    {[...entities]
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((e) => {
                        const pct = (e.revenue / totalRevenueRaw) * 100;
                        return (
                          <div key={e.tenantId}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-medium">{e.tenantName}</span>
                              <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Percentages are computed on raw totals across entities; not FX-converted if currencies differ.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
