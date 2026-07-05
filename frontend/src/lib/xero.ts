// Xero data access for the frontend. All calls go through the "xero-data"
// Supabase Edge Function, not to api.xero.com directly -- the browser can't
// call Xero's API itself (no CORS support on their end), and the real Xero
// tokens live server-side in the xero_connections table, refreshed there
// too. supabase.functions.invoke automatically attaches the current
// Supabase session as the Authorization header, which the edge function
// uses to look up the caller's stored Xero connection.
import { supabase } from "@/integrations/supabase/client";

export interface ConsolidatedRevenue {
  currency: string;
  total: number;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
}

export type TaxJurisdiction = "GB" | "AE" | "DE";

export interface VatProximity {
  registered: boolean;
  salesTaxBasis: string;
  thresholdGbp: number;
  annualisedRevenue: number;
  proximityPercent: number;
  status: "registered" | "well_under" | "approaching" | "over";
}

export interface EntityBreakdown {
  tenantId: string;
  tenantName: string;
  currency: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  grossProfit: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  cash: number | null;
  taxJurisdiction: TaxJurisdiction;
  estimatedTaxOwed: number;
  taxBandLabel: string;
  vat: VatProximity;
}

export interface CountrySubtotal {
  jurisdiction: TaxJurisdiction;
  jurisdictionLabel: string;
  currency: string;
  entityCount: number;
  totalRevenue: number;
  totalNetProfit: number;
  totalEstimatedTaxOwed: number;
}

export interface XeroSummary {
  entities: EntityBreakdown[];
  byCountry: CountrySubtotal[];
  warnings?: string[];
  consolidated: {
    revenue: CurrencyTotal[];
    expenses: CurrencyTotal[];
    netProfit: CurrencyTotal[];
    cash: CurrencyTotal[];
    estimatedTaxOwed: CurrencyTotal[];
  };
}

async function invoke<T>(resource: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("xero-data", {
    body: { resource },
  });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// supabase-js's default error.message for a non-2xx response is just
// "Edge Function returned a non-2xx status code" -- the actual reason
// (e.g. "No Xero organisation connected", a Xero API failure) is on
// error.context, which is the raw Response from the edge function. Exported
// for use by any other caller of supabase.functions.invoke (e.g. the OAuth
// callback route), which hits the same masking issue.
export async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body?.error) return body.error as string;
    } catch {
      // Response body wasn't JSON -- fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : "Xero request failed.";
}

export const xero = {
  getInvoices: () => invoke<{ Invoices: unknown[] }>("invoices"),
  getContacts: () => invoke<{ Contacts: unknown[] }>("contacts"),
  getOrganisation: () => invoke<{ Organisations: unknown[] }>("organisation"),
  getConsolidatedRevenue: () => invoke<ConsolidatedRevenue[]>("revenue"),
  getSummary: () => invoke<XeroSummary>("summary"),
};
