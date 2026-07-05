import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
import { xero, type EntityBreakdown, type XeroSummary } from "@/lib/xero";
import { getFxHistory, evaluateFavorability, type RatePoint, type FxFavorability } from "@/lib/fx";
import { AppShell } from "@/components/AppShell";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export const Route = createFileRoute("/fx-trends")({
  head: () => ({
    meta: [
      { title: "Currency Trends — FlowSync" },
      { name: "description", content: "Exchange rate history and funding-timing signals for foreign-currency branches." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AppShell>
      <FxTrendsPage />
    </AppShell>
  ),
});

const chartConfig: ChartConfig = {
  rate: { label: "GBP →", color: "var(--chart-1)" },
};

function favorabilityLabel(status: FxFavorability["status"]): string {
  switch (status) {
    case "favorable":
      return "Favorable time to send funds";
    case "unfavorable":
      return "Less favorable than usual";
    case "insufficient_history":
      return "Not enough history yet";
    default:
      return "No significant change";
  }
}

function favorabilityClasses(status: FxFavorability["status"]): string {
  switch (status) {
    case "favorable":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "unfavorable":
      return "bg-destructive/15 text-destructive";
    case "insufficient_history":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CurrencyTrendCard({
  currency,
  entities,
  history,
}: {
  currency: string;
  entities: EntityBreakdown[];
  history: RatePoint[];
}) {
  const favorability = evaluateFavorability(history);
  const needingFunding = entities.filter((e) => e.netProfit < 0);
  const chartData = history.map((p) => ({ date: formatDate(p.recordedAt), rate: p.rate }));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">GBP → {currency}</div>
          <div className="text-xs text-muted-foreground">
            {entities.map((e) => e.tenantName).join(", ")}
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${favorabilityClasses(favorability.status)}`}>
          {favorabilityLabel(favorability.status)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Current rate: <span className="font-medium">1 GBP = {favorability.currentRate.toFixed(2)} {currency}</span>
        </span>
        {favorability.percentChange !== null && (
          <span className={favorability.percentChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
            {favorability.percentChange >= 0 ? "+" : ""}
            {favorability.percentChange.toFixed(1)}% vs ~7 days ago
          </span>
        )}
      </div>

      {needingFunding.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          {needingFunding.map((e) => e.tenantName).join(", ")} currently {needingFunding.length === 1 ? "needs" : "need"} funding.
        </div>
      )}

      {chartData.length > 1 ? (
        <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-48 w-full">
          <LineChart data={chartData} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} fontSize={11} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="rate" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">
          Not enough recorded history yet to chart a trend — check back after a few more scheduled checks.
        </div>
      )}
    </div>
  );
}

function FxTrendsPage() {
  const [summary, setSummary] = useState<XeroSummary | null>(null);
  const [history, setHistory] = useState<Record<string, RatePoint[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    xero
      .getSummary()
      .then(async (s) => {
        setSummary(s);
        const foreignCurrencies = Array.from(new Set(s.entities.filter((e) => e.currency !== "GBP").map((e) => e.currency)));
        if (foreignCurrencies.length > 0) {
          const h = await getFxHistory(foreignCurrencies);
          setHistory(h);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data."));
  }, []);

  const entities = summary?.entities ?? [];
  const foreignEntities = entities.filter((e) => e.currency !== "GBP");
  const byCurrency = new Map<string, EntityBreakdown[]>();
  for (const e of foreignEntities) {
    byCurrency.set(e.currency, [...(byCurrency.get(e.currency) ?? []), e]);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Currency Trends</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Funding timing</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Exchange rate history for every foreign-currency branch, and whether now is a favorable time to send
        it money — the same signal that drives the automated funding-timing alerts.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!summary && !error && (
        <div className="mt-6 text-sm text-muted-foreground">Loading…</div>
      )}

      {summary && byCurrency.size === 0 && (
        <div className="mt-10 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          None of your connected businesses report in a currency other than GBP, so there's no funding-timing
          question to show yet — this only applies to branches with real cross-currency exposure.
        </div>
      )}

      {byCurrency.size > 0 && (
        <div className="mt-8 space-y-6">
          {Array.from(byCurrency.entries()).map(([currency, ents]) => (
            <CurrencyTrendCard key={currency} currency={currency} entities={ents} history={history[currency] ?? []} />
          ))}
        </div>
      )}
    </main>
  );
}
