// supabase/functions/xero-data/index.ts
//
// Deploy via Supabase Dashboard: Edge Functions -> xero-data -> paste this
// in, replacing the old version entirely.
//
// Secrets required (same ones xero-oauth-callback already uses, no new
// secrets need adding):
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Called from the browser as:
//   supabase.functions.invoke("xero-data", { body: { resource: "summary" } })
//
// This runs server-side, so calling api.xero.com from here never hits the
// browser's CORS restrictions (those only apply to fetches made from JS
// running in a tab). The browser only ever talks to this function, using
// its own Supabase session -- never a Xero token directly.
//
// NOTE on scopes: Xero deprecated the broad "accounting.reports.read" scope
// in favour of granular per-report ones. Reports/ProfitAndLoss needs
// "accounting.reports.profitandloss.read" and Reports/BalanceSheet needs
// "accounting.reports.balancesheet.read" -- both requested in the connect
// flow's authorize URL (see auth_.connect.tsx). Invoices/Contacts need
// "accounting.invoices.read" / "accounting.contacts.read", and the
// Organisation endpoint needs "accounting.settings.read".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // tighten to your frontend origin in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface XeroConnection {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

interface XeroInvoice {
  Total: number;
  CurrencyCode: string;
  Status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED";
  Type: "ACCREC" | "ACCPAY";
}

interface XeroReportCell {
  Value?: string;
}

interface XeroReportRow {
  RowType: "Header" | "Section" | "Row" | "SummaryRow";
  Title?: string;
  Cells?: XeroReportCell[];
  Rows?: XeroReportRow[];
}

interface XeroReport {
  Reports: { ReportName: string; Rows: XeroReportRow[] }[];
}

interface EntityBreakdown {
  tenantId: string;
  tenantName: string;
  currency: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  grossProfit: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  cash: number;
}

interface CurrencyTotal {
  currency: string;
  total: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    const callerJwt = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(callerJwt);
    if (callerError || !callerData.user) {
      return jsonResponse({ error: "Could not verify signed-in user" }, 401);
    }
    const userId = callerData.user.id;

    const { resource } = await req.json();
    if (!resource) {
      return jsonResponse({ error: "Missing resource" }, 400);
    }

    const { data: connection, error: connError } = await supabaseAdmin
      .from("xero_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", userId)
      .single();

    if (connError || !connection) {
      return jsonResponse({ error: "No Xero organisation connected" }, 404);
    }

    let accessToken = connection.access_token as string;

    // Refresh if expired or about to expire in the next 60s.
    const expiresAt = new Date(connection.expires_at as string).getTime();
    if (Date.now() > expiresAt - 60_000) {
      const refreshed = await refreshXeroToken(connection.refresh_token as string);
      if (!refreshed) {
        return jsonResponse({ error: "Failed to refresh Xero token" }, 502);
      }
      accessToken = refreshed.access_token;

      await supabaseAdmin
        .from("xero_connections")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }

    // Xero requires a tenant id per request. There's no column for it in
    // xero_connections, so it's looked up fresh via /connections each call.
    const connectionsRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!connectionsRes.ok) {
      console.error("Xero /connections failed:", await connectionsRes.text());
      return jsonResponse({ error: "Failed to list Xero connections" }, 502);
    }
    const orgConnections = await connectionsRes.json() as XeroConnection[];
    if (orgConnections.length === 0) {
      return jsonResponse({ error: "No Xero organisation connected" }, 404);
    }

    const data = await fetchResource(resource, accessToken, orgConnections);
    return jsonResponse(data);
  } catch (err) {
    console.error("Unhandled error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected server error" }, 500);
  }
});

async function refreshXeroToken(refreshToken: string) {
  const clientId = Deno.env.get("XERO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;

  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    console.error("Xero token refresh failed:", await res.text());
    return null;
  }

  return await res.json() as { access_token: string; refresh_token: string; expires_in: number };
}

async function fetchResource(resource: string, accessToken: string, connections: XeroConnection[]) {
  switch (resource) {
    case "organisation":
      return xeroGet(connections[0].tenantId, accessToken, "Organisation");
    case "invoices":
      return xeroGet(connections[0].tenantId, accessToken, "Invoices");
    case "contacts":
      return xeroGet(connections[0].tenantId, accessToken, "Contacts");
    case "revenue":
      return getConsolidatedRevenue(connections, accessToken);
    case "summary":
      return getSummary(connections, accessToken);
    default:
      throw new Error(`Unknown resource: ${resource}`);
  }
}

async function xeroGet(
  tenantId: string,
  accessToken: string,
  path: string,
  params?: Record<string, string>,
) {
  const url = new URL(`${XERO_API_BASE}/${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    // Include the path in the error -- with several Xero calls chained
    // together in "summary", a bare status code doesn't say which one failed.
    throw new Error(`Xero API request failed for ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// Sums ACCREC invoices (posted, not draft/voided/deleted) per currency across
// every connected org. Only reads the first page (up to 100 invoices) per
// org -- fine for a demo, a real version would page through `Invoices?page=2`.
// Kept as a standalone resource for backward compat; "summary" derives
// revenue from the Profit & Loss report instead, for consistency with the
// other P&L-derived figures (net profit, expenses, margins).
async function getConsolidatedRevenue(connections: XeroConnection[], accessToken: string) {
  const totalsByCurrency = new Map<string, number>();

  for (const connection of connections) {
    const { Invoices } = await xeroGet(connection.tenantId, accessToken, "Invoices", {
      where: 'Type=="ACCREC"',
    }) as { Invoices: XeroInvoice[] };

    for (const invoice of Invoices) {
      if (invoice.Status === "DRAFT" || invoice.Status === "VOIDED" || invoice.Status === "DELETED") continue;
      const current = totalsByCurrency.get(invoice.CurrencyCode) ?? 0;
      totalsByCurrency.set(invoice.CurrencyCode, current + invoice.Total);
    }
  }

  return Array.from(totalsByCurrency, ([currency, total]) => ({ currency, total }));
}

function parseNumber(value?: string): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// Walks a report's row tree (Sections nest Rows) looking for a row whose
// first cell matches one of the given labels, and returns its last cell as
// a number. Report layouts vary slightly by org (chart of accounts, whether
// Cost of Sales is broken out), so this matches on label text rather than
// position.
function findRowValue(rows: XeroReportRow[] | undefined, labels: string[]): number | null {
  if (!rows) return null;
  for (const row of rows) {
    const label = row.Cells?.[0]?.Value?.trim().toLowerCase();
    if (label && labels.includes(label) && row.Cells && row.Cells.length > 1) {
      return parseNumber(row.Cells[row.Cells.length - 1].Value);
    }
    const nested = findRowValue(row.Rows, labels);
    if (nested !== null) return nested;
  }
  return null;
}

function parseProfitAndLoss(report: XeroReport) {
  const rows = report.Reports?.[0]?.Rows;
  const revenue = findRowValue(rows, ["total income", "total trading income"]) ?? 0;
  const netProfit = findRowValue(rows, ["net profit", "net profit/(loss)", "profit for the year"]) ?? 0;
  const cogs = findRowValue(rows, ["total cost of sales"]);
  const grossProfitRow = findRowValue(rows, ["gross profit"]);
  // Prefer the report's own Gross Profit line; fall back to revenue - COGS
  // if the org tracks Cost of Sales but the report doesn't summarise it;
  // otherwise there's no meaningful gross margin to show (service orgs with
  // no Cost of Sales section at all).
  const grossProfit = grossProfitRow ?? (cogs !== null ? revenue - cogs : null);
  return { revenue, netProfit, grossProfit };
}

// Cash position from the Balance Sheet's Bank section. Tries the report's
// own "Total Bank" summary line first (standard in Xero's default BS
// layout); falls back to summing individual account rows nested under a
// Section titled "Bank" if that summary line isn't present.
function parseCashPosition(report: XeroReport): number {
  const rows = report.Reports?.[0]?.Rows;

  const total = findRowValue(rows, ["total bank", "total cash and bank", "total cash"]);
  if (total !== null) return total;

  let sum = 0;
  function walk(list: XeroReportRow[] | undefined, inBankSection: boolean) {
    if (!list) return;
    for (const row of list) {
      const isBankSection = row.RowType === "Section" && row.Title?.trim().toLowerCase() === "bank";
      if (row.RowType === "Row" && inBankSection && row.Cells && row.Cells.length >= 2) {
        sum += parseNumber(row.Cells[row.Cells.length - 1].Value);
      }
      walk(row.Rows, inBankSection || isBankSection);
    }
  }
  walk(rows, false);
  return sum;
}

async function getBaseCurrency(tenantId: string, accessToken: string): Promise<string> {
  const org = await xeroGet(tenantId, accessToken, "Organisation") as {
    Organisations: { BaseCurrency: string }[];
  };
  return org.Organisations?.[0]?.BaseCurrency ?? "USD";
}

// One entry per connected org: revenue/expenses/netProfit come from the
// Profit & Loss report (Xero's default reporting period for that endpoint),
// cash is read from the Balance Sheet's Bank section (as of today).
// Consolidated totals are grouped by currency rather than summed blindly
// across entities, since connected orgs can report in different currencies
// and this doesn't do FX conversion.
async function getSummary(connections: XeroConnection[], accessToken: string) {
  const entities: EntityBreakdown[] = [];

  for (const connection of connections) {
    const [pnlReport, balanceSheetReport, currency] = await Promise.all([
      xeroGet(connection.tenantId, accessToken, "Reports/ProfitAndLoss") as Promise<XeroReport>,
      xeroGet(connection.tenantId, accessToken, "Reports/BalanceSheet") as Promise<XeroReport>,
      getBaseCurrency(connection.tenantId, accessToken),
    ]);

    const { revenue, netProfit, grossProfit } = parseProfitAndLoss(pnlReport);
    const cash = parseCashPosition(balanceSheetReport);
    // Derived rather than read off a "Total Expenses" row, since orgs split
    // Cost of Sales / Operating Expenses differently -- this is always true
    // by definition regardless of how the P&L breaks it down.
    const expenses = revenue - netProfit;

    entities.push({
      tenantId: connection.tenantId,
      tenantName: connection.tenantName,
      currency,
      revenue,
      expenses,
      netProfit,
      grossProfit,
      grossMargin: grossProfit !== null && revenue !== 0 ? grossProfit / revenue : null,
      netMargin: revenue !== 0 ? netProfit / revenue : null,
      cash,
    });
  }

  const sumByCurrency = (pick: (e: EntityBreakdown) => number): CurrencyTotal[] => {
    const totals = new Map<string, number>();
    for (const entity of entities) {
      totals.set(entity.currency, (totals.get(entity.currency) ?? 0) + pick(entity));
    }
    return Array.from(totals, ([currency, total]) => ({ currency, total }));
  };

  return {
    entities,
    consolidated: {
      revenue: sumByCurrency((e) => e.revenue),
      expenses: sumByCurrency((e) => e.expenses),
      netProfit: sumByCurrency((e) => e.netProfit),
      cash: sumByCurrency((e) => e.cash),
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
