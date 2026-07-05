import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { xero, type EntityBreakdown, type XeroSummary } from "@/lib/xero";
import { useCurrency, moneySizeClassForGroup } from "@/lib/currency";
import { AppShell } from "@/components/AppShell";
import { MessageCircleQuestion } from "lucide-react";

export const Route = createFileRoute("/tax")({
  head: () => ({
    meta: [
      { title: "Tax Breakdown — FlowSync" },
      { name: "description", content: "Estimated tax owed per business and per country." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AppShell>
      <TaxPage />
    </AppShell>
  ),
});

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function vatStatusLabel(vat: EntityBreakdown["vat"]): string {
  switch (vat.status) {
    case "registered":
      return `Registered (basis: ${vat.salesTaxBasis})`;
    case "over":
      return "Over threshold — registration likely required";
    case "approaching":
      return "Approaching threshold";
    default:
      return "Well under threshold";
  }
}

function vatStatusClasses(status: EntityBreakdown["vat"]["status"]): string {
  switch (status) {
    case "registered":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "over":
      return "bg-destructive/15 text-destructive";
    case "approaching":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  }
}

function TaxPage() {
  const { convert, displayCurrency } = useCurrency();
  const [summary, setSummary] = useState<XeroSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function displayMoney(amount: number, fromCurrency: string): string {
    return formatMoney(convert(amount, fromCurrency), displayCurrency);
  }

  useEffect(() => {
    xero
      .getSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Xero data."));
  }, []);

  const entities = summary?.entities ?? [];
  const byCountry = summary?.byCountry ?? [];

  const countryTaxSizeClass = moneySizeClassForGroup(
    byCountry.map((c) => displayMoney(c.totalEstimatedTaxOwed, c.currency)),
    [[9, "text-2xl"], [13, "text-xl"], [17, "text-lg"], [Infinity, "text-base"]],
  );
  const businessValueSizeClass = moneySizeClassForGroup(
    entities.flatMap((e) => [displayMoney(e.netProfit, e.currency), displayMoney(e.estimatedTaxOwed, e.currency)]),
    [[9, "text-xl"], [13, "text-lg"], [17, "text-base"], [Infinity, "text-sm"]],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tax</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Tax breakdown</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Estimated tax owed per business and per country, computed from your connected Xero
        figures. These are rough estimates for awareness, not filings — use the Legislation
        Assistant for a detailed, cited answer on any specific business.
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {summary === null && !error && (
        <div className="mt-6 text-sm text-muted-foreground">Loading from Xero…</div>
      )}

      {byCountry.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            By country
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byCountry.map((c) => (
              <div key={`${c.jurisdiction}-${c.currency}`} className="min-w-0 rounded-xl border border-border bg-card p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.jurisdictionLabel}
                </div>
                <div className={`mt-2 truncate font-semibold ${countryTaxSizeClass}`}>
                  {displayMoney(c.totalEstimatedTaxOwed, c.currency)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Estimated tax across {c.entityCount} {c.entityCount === 1 ? "business" : "businesses"}
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="break-words">Revenue: {displayMoney(c.totalRevenue, c.currency)}</span>
                  <span className="break-words">Net profit: {displayMoney(c.totalNetProfit, c.currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entities.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            By business
          </h2>
          <div className="mt-4 space-y-4">
            {entities.map((e) => (
              <div key={e.tenantId} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{e.tenantName}</div>
                    <div className="text-xs text-muted-foreground">{JURISDICTION_NAMES[e.taxJurisdiction]}</div>
                  </div>
                  <Link
                    to="/legislation"
                    search={{ q: `What tax do I owe for ${e.tenantName}, and why?` }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <MessageCircleQuestion className="h-3.5 w-3.5" />
                    Ask about this branch
                  </Link>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Net profit this period
                    </div>
                    <div
                      className={`mt-1 truncate font-semibold ${e.netProfit < 0 ? "text-destructive" : ""} ${businessValueSizeClass}`}
                    >
                      {displayMoney(e.netProfit, e.currency)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Estimated tax owed
                    </div>
                    <div className={`mt-1 truncate font-semibold ${businessValueSizeClass}`}>
                      {displayMoney(e.estimatedTaxOwed, e.currency)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{e.taxBandLabel}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      VAT / sales-tax registration
                    </div>
                    <div
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${vatStatusClasses(e.vat.status)}`}
                    >
                      {vatStatusLabel(e.vat)}
                    </div>
                    {e.vat.status === "registered" ? (
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        Already registered in Xero — threshold check doesn't apply.
                      </div>
                    ) : (
                      <>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-1.5 rounded-full ${e.vat.status === "over" ? "bg-destructive" : e.vat.status === "approaching" ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.min(e.vat.proximityPercent, 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 break-words text-xs text-muted-foreground">
                          ~{displayMoney(e.vat.annualisedRevenue, e.currency)} annualised vs {displayMoney(e.vat.thresholdGbp, "GBP")} threshold
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && entities.length === 0 && (
        <div className="mt-10 rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No connected organisations yet.{" "}
          <Link to="/auth/connect" className="underline underline-offset-2">
            Connect a Xero organisation
          </Link>{" "}
          to see its tax breakdown here.
        </div>
      )}
    </main>
  );
}

const JURISDICTION_NAMES: Record<EntityBreakdown["taxJurisdiction"], string> = {
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  DE: "Germany",
};
