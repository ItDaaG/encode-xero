import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { xero, type EntityBreakdown, type XeroSummary } from "@/lib/xero";
import { useCurrency } from "@/lib/currency";
import { AppShell } from "@/components/AppShell";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Custom Reports — FlowSync" },
      { name: "description", content: "Build and download a PDF report with the data you choose." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});

interface SectionOption {
  key: keyof SectionState;
  label: string;
  description: string;
}

interface SectionState {
  revenueExpenses: boolean;
  netProfitMargins: boolean;
  cashPosition: boolean;
  estimatedTax: boolean;
  vatStatus: boolean;
  countryBreakdown: boolean;
  chart: boolean;
}

const SECTION_OPTIONS: SectionOption[] = [
  { key: "revenueExpenses", label: "Revenue & Expenses", description: "Top-line revenue and total expenses per business." },
  { key: "netProfitMargins", label: "Net Profit & Margins", description: "Net profit, net margin, and gross margin per business." },
  { key: "cashPosition", label: "Cash Position", description: "Real bank balance per business, from Bank Summary." },
  { key: "estimatedTax", label: "Estimated Tax Owed", description: "Rough corporate tax estimate and the rate band applied." },
  { key: "vatStatus", label: "VAT / Sales Tax Status", description: "Registration status or threshold proximity per business." },
  { key: "countryBreakdown", label: "Country Breakdown", description: "Subtotals grouped by tax jurisdiction." },
  { key: "chart", label: "Revenue Chart", description: "A bar chart comparing revenue, expenses, and net profit across businesses." },
];

function vatStatusLabel(vat: EntityBreakdown["vat"]): string {
  switch (vat.status) {
    case "registered":
      return `Registered (${vat.salesTaxBasis})`;
    case "over":
      return "Over threshold";
    case "approaching":
      return "Approaching threshold";
    default:
      return "Well under threshold";
  }
}

function ReportsPage() {
  const { convert, displayCurrency } = useCurrency();
  const [summary, setSummary] = useState<XeroSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("Financial Report");
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<SectionState>({
    revenueExpenses: true,
    netProfitMargins: true,
    cashPosition: true,
    estimatedTax: true,
    vatStatus: true,
    countryBreakdown: true,
    chart: true,
  });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    xero
      .getSummary()
      .then((s) => {
        setSummary(s);
        setSelectedTenants(new Set(s.entities.map((e) => e.tenantId)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Xero data."));
  }, []);

  function toggleTenant(tenantId: string) {
    setSelectedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }

  function toggleSection(key: keyof SectionState) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleGenerate() {
    if (!summary) return;
    const entities = summary.entities.filter((e) => selectedTenants.has(e.tenantId));
    if (entities.length === 0) {
      setGenError("Select at least one business.");
      return;
    }

    setGenerating(true);
    setGenError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not signed in.");

      const selectedTenantIds = new Set(entities.map((e) => e.tenantId));
      const body = {
        title,
        currency: displayCurrency,
        entities: entities.map((e) => ({
          tenantName: e.tenantName,
          revenue: convert(e.revenue, e.currency),
          expenses: convert(e.expenses, e.currency),
          netProfit: convert(e.netProfit, e.currency),
          netMargin: e.netMargin,
          grossMargin: e.grossMargin,
          cash: e.cash === null ? null : convert(e.cash, e.currency),
          estimatedTaxOwed: convert(e.estimatedTaxOwed, e.currency),
          taxBandLabel: e.taxBandLabel,
          jurisdictionLabel: e.taxJurisdiction,
          vatStatusLabel: vatStatusLabel(e.vat),
        })),
        byCountry: summary.byCountry
          .filter((c) => entities.some((e) => e.taxJurisdiction === c.jurisdiction))
          .map((c) => ({
            jurisdictionLabel: c.jurisdictionLabel,
            entityCount: summary.entities.filter((e) => selectedTenantIds.has(e.tenantId) && e.taxJurisdiction === c.jurisdiction).length,
            totalRevenue: convert(c.totalRevenue, c.currency),
            totalNetProfit: convert(c.totalNetProfit, c.currency),
            totalEstimatedTaxOwed: convert(c.totalEstimatedTaxOwed, c.currency),
          })),
        sections,
      };

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Report generation failed: ${res.status} ${text}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/\s+/g, "_") || "report"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Something went wrong generating the report.");
    } finally {
      setGenerating(false);
    }
  }

  const entities = summary?.entities ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reports</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Build a custom report</h1>
      <p className="mt-3 text-muted-foreground">
        Pick what to include, and download a PDF with exactly that — right now, in whatever currency you're
        currently viewing ({displayCurrency}).
      </p>

      {error && (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!summary && !error && (
        <div className="mt-6 text-sm text-muted-foreground">Loading from Xero…</div>
      )}

      {summary && (
        <div className="mt-8 space-y-8">
          <div>
            <label className="text-sm font-medium">Report title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <div className="text-sm font-medium">Businesses to include</div>
            <div className="mt-2 space-y-2">
              {entities.map((e) => (
                <label key={e.tenantId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTenants.has(e.tenantId)}
                    onChange={() => toggleTenant(e.tenantId)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {e.tenantName}
                </label>
              ))}
              {entities.length === 0 && (
                <div className="text-sm text-muted-foreground">No connected businesses yet.</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">Data to include</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {SECTION_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={sections[opt.key]}
                    onChange={() => toggleSection(opt.key)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                  />
                  <span>
                    <span className="font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {genError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {genError}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || entities.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <FileDown className="h-4 w-4" />
            {generating ? "Generating…" : "Generate & Download PDF"}
          </button>
        </div>
      )}
    </main>
  );
}
