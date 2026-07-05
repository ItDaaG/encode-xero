// Client for the fx-history edge function, plus the same favorability
// classification agents/tools/fx_tools.py uses server-side (mirrored here
// so the trends page can show current status without a round trip per
// entity) -- keep the threshold/lookback logic in sync with that file if
// either changes.
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/xero";

export interface RatePoint {
  rate: number;
  recordedAt: string;
}

export type FxStatus = "favorable" | "unfavorable" | "neutral" | "insufficient_history";

export interface FxFavorability {
  status: FxStatus;
  currentRate: number;
  baselineRate: number | null;
  percentChange: number | null;
}

const FAVORABLE_THRESHOLD_PERCENT = 2;
const LOOKBACK_DAYS = 7;

export async function getFxHistory(currencies: string[]): Promise<Record<string, RatePoint[]>> {
  if (currencies.length === 0) return {};
  const { data, error } = await supabase.functions.invoke("fx-history", { body: { currencies } });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return (data?.history as Record<string, RatePoint[]>) ?? {};
}

export function evaluateFavorability(history: RatePoint[]): FxFavorability {
  if (history.length === 0) {
    return { status: "insufficient_history", currentRate: 0, baselineRate: null, percentChange: null };
  }

  const current = history[history.length - 1];
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const withinWindow = history.find((p) => new Date(p.recordedAt).getTime() >= cutoff);
  const baseline = withinWindow ?? history[0];

  if (baseline.recordedAt === current.recordedAt) {
    return { status: "insufficient_history", currentRate: current.rate, baselineRate: null, percentChange: null };
  }

  const percentChange = ((current.rate - baseline.rate) / baseline.rate) * 100;
  const status: FxStatus =
    percentChange >= FAVORABLE_THRESHOLD_PERCENT
      ? "favorable"
      : percentChange <= -FAVORABLE_THRESHOLD_PERCENT
        ? "unfavorable"
        : "neutral";

  return { status, currentRate: current.rate, baselineRate: baseline.rate, percentChange };
}
