import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { xero, type CurrencyTotal, type EntityBreakdown, type XeroSummary } from "@/lib/xero";
import { useCurrency, moneySizeClassForGroup } from "@/lib/currency";
import { AppShell } from "@/components/AppShell";

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
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});

function Dashboard() {
  const { convert, displayCurrency } = useCurrency();
  const [summary, setSummary] = useState<XeroSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Converts and formats in one step -- every money value in this page goes
  // through this rather than the raw formatMoney, so it always reflects the
  // user's chosen display currency regardless of what currency the source
  // entity actually reports in.
  function displayMoney(amount: number, fromCurrency: string): string {
    return formatMoney(convert(amount, fromCurrency), displayCurrency);
  }

  function displayCurrencyTotals(totals: CurrencyTotal[], emptyHint: string): { value: string; hint: string } {
    if (totals.length === 0) return { value: formatMoney(0, displayCurrency), hint: emptyHint };
    const total = totals.reduce((sum, t) => sum + convert(t.total, t.currency), 0);
    return { value: formatMoney(total, displayCurrency), hint: "Across all connected entities" };
  }

  useEffect(() => {
    xero
      .getSummary()
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : "Failed to load Xero data."));
  }, []);

  const entities = summary?.entities ?? [];

  const mostProfitable = entities.length
    ? entities.reduce((best, e) => (e.netProfit > best.netProfit ? e : best))
    : null;

  const leanest = entities.filter((e) => e.grossMargin !== null).length
    ? entities
        .filter((e): e is EntityBreakdown & { grossMargin: number } => e.grossMargin !== null)
        .reduce((best, e) => (e.grossMargin > best.grossMargin ? e : best))
    : null;

  const totalRevenueConverted = entities.reduce((sum, e) => sum + convert(e.revenue, e.currency), 0);
  const lossMakingEntities = entities.filter((e) => e.netProfit < 0);

  const kpiTiles = [
    { title: "Connected entities", value: String(entities.length), hint: entities.length ? "Xero organisations" : "No Xero organisations yet" },
    summaryError
      ? { title: "Consolidated Revenue", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Revenue", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Revenue", ...displayCurrencyTotals(summary.consolidated.revenue, "No revenue yet") },
    summaryError
      ? { title: "Consolidated Net Profit", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Net Profit", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Net Profit", ...displayCurrencyTotals(summary.consolidated.netProfit, "No profit data yet") },
    summaryError
      ? { title: "Consolidated Expenses", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Consolidated Expenses", value: "…", hint: "Loading from Xero…" }
        : { title: "Consolidated Expenses", ...displayCurrencyTotals(summary.consolidated.expenses, "No expense data yet") },
    summaryError
      ? { title: "Total Cash Position", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Total Cash Position", value: "…", hint: "Loading from Xero…" }
        : { title: "Total Cash Position", ...displayCurrencyTotals(summary.consolidated.cash, "No bank accounts found") },
    summaryError
      ? { title: "Estimated Tax Owed", value: "—", hint: summaryError }
      : summary === null
        ? { title: "Estimated Tax Owed", value: "…", hint: "Loading from Xero…" }
        : {
            title: "Estimated Tax Owed",
            ...displayCurrencyTotals(summary.consolidated.estimatedTaxOwed, "No profit to tax yet"),
            hint:
              summary.consolidated.estimatedTaxOwed.length > 0
                ? "Rough estimate, not tax advice — see Legislation Assistant"
                : "No profit to tax yet",
          },
  ];

  const kpiValueSizeClass = moneySizeClassForGroup(
    kpiTiles.map((c) => c.value),
    [[9, "text-3xl"], [13, "text-2xl"], [17, "text-xl"], [21, "text-lg"], [Infinity, "text-base"]],
  );

  return (
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

        {lossMakingEntities.length > 0 && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="font-medium">
              {lossMakingEntities.length === 1
                ? `${lossMakingEntities[0].tenantName} is currently running at a loss`
                : `${lossMakingEntities.length} businesses are currently running at a loss`}
            </div>
            <div className="mt-1 space-y-0.5 text-destructive/80">
              {lossMakingEntities.map((e) => (
                <div key={e.tenantId}>
                  {e.tenantName}: {displayMoney(e.netProfit, e.currency)} net loss this period
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {kpiTiles.map((c) => (
            <div key={c.title} className="min-w-0 rounded-xl border border-border bg-background p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.title}</div>
              <div className={`mt-2 truncate font-semibold ${kpiValueSizeClass}`}>
                {c.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
            </div>
          ))}
        </div>

        {summary && entities.length > 0 && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Most Profitable Branch
                </div>
                <div className="mt-2 break-words text-2xl font-semibold">{mostProfitable?.tenantName}</div>
                <div className="mt-1 break-words text-xs text-muted-foreground">
                  {mostProfitable ? displayMoney(mostProfitable.netProfit, mostProfitable.currency) : "—"} net profit
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Leanest Branch
                </div>
                <div className="mt-2 break-words text-2xl font-semibold">{leanest?.tenantName ?? "N/A"}</div>
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
                      <th className="py-2 pr-4 font-medium">Cash</th>
                      <th className="py-2 font-medium">Est. Tax Owed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entities.map((e) => {
                      const isLoss = e.netProfit < 0;
                      return (
                        <tr key={e.tenantId} className={isLoss ? "bg-destructive/5" : undefined}>
                          <td className="py-2 pr-4 font-medium">
                            {e.tenantName}
                            {isLoss && (
                              <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                                Loss
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{e.currency}</td>
                          <td className="py-2 pr-4">{displayMoney(e.revenue, e.currency)}</td>
                          <td className={`py-2 pr-4 ${isLoss ? "font-medium text-destructive" : ""}`}>
                            {displayMoney(e.netProfit, e.currency)}
                          </td>
                          <td className="py-2 pr-4">{formatPercent(e.netMargin)}</td>
                          <td className="py-2 pr-4">{formatPercent(e.grossMargin)}</td>
                          <td className="py-2 pr-4">{e.cash === null ? "N/A" : displayMoney(e.cash, e.currency)}</td>
                          <td className="py-2">{displayMoney(e.estimatedTaxOwed, e.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {totalRevenueConverted > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-background p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Revenue Split by Entity
                </div>
                <div className="mt-4 space-y-3">
                  {[...entities]
                    .sort((a, b) => convert(b.revenue, b.currency) - convert(a.revenue, a.currency))
                    .map((e) => {
                      const pct = (convert(e.revenue, e.currency) / totalRevenueConverted) * 100;
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
                  Percentages computed after converting each entity to {displayCurrency}.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
