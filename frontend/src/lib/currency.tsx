// Live currency conversion, so users can view every figure in whatever
// currency they prefer regardless of which currency each connected Xero
// org actually reports in. Rates come from a free, keyless, CORS-open API
// (exchangerate-api.com's open endpoint) -- fetched once per session,
// client-side, since this has nothing to do with the user's own Xero data
// and doesn't need to go through Supabase/the edge function.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const STORAGE_KEY = "flowsync_display_currency";

// Pinned to the top of the picker since they're the currencies most likely
// to be asked for; the rest of whatever the API returns follows,
// alphabetically -- "it can be anything" per the actual ask.
const PINNED_CURRENCIES = ["USD", "GBP", "EUR", "AED", "SAR", "INR"];

interface CurrencyContextValue {
  displayCurrency: string;
  setDisplayCurrency: (currency: string) => void;
  availableCurrencies: string[];
  convert: (amount: number, fromCurrency: string) => number;
  ratesLoading: boolean;
  ratesError: string | null;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrencyState] = useState("GBP");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored) setDisplayCurrencyState(stored);
  }, []);

  useEffect(() => {
    fetch(RATES_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
        return res.json();
      })
      .then((data: { result: string; rates: Record<string, number> }) => {
        if (data.result !== "success") throw new Error("Exchange rate API reported failure");
        setRates(data.rates);
      })
      .catch((err) => setRatesError(err instanceof Error ? err.message : "Failed to load exchange rates"))
      .finally(() => setRatesLoading(false));
  }, []);

  function setDisplayCurrency(currency: string) {
    setDisplayCurrencyState(currency);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, currency);
  }

  // rates are "units of X per 1 USD" -- convert any currency to any other
  // by pivoting through USD. Falls back to the original amount (no-op) if
  // rates haven't loaded yet or don't cover one of the currencies involved,
  // so the UI shows real numbers rather than blanking out while loading.
  function convert(amount: number, fromCurrency: string): number {
    if (!rates || !rates[fromCurrency] || !rates[displayCurrency]) return amount;
    const amountInUsd = amount / rates[fromCurrency];
    return amountInUsd * rates[displayCurrency];
  }

  const availableCurrencies = useMemo(() => {
    if (!rates) return PINNED_CURRENCIES;
    const rest = Object.keys(rates)
      .filter((c) => !PINNED_CURRENCIES.includes(c))
      .sort();
    return [...PINNED_CURRENCIES, ...rest];
  }, [rates]);

  return (
    <CurrencyContext.Provider
      value={{ displayCurrency, setDisplayCurrency, availableCurrencies, convert, ratesLoading, ratesError }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within a CurrencyProvider");
  return ctx;
}

// Picks a smaller Tailwind text-size class as a formatted money string gets
// longer, so switching to a currency with more digits (e.g. INR, IDR) or a
// letter-code prefix (e.g. "AED 1,234.00") shrinks to fit its box instead of
// overflowing or wrapping. `tiers` is [maxLength, className][], ordered
// largest class first; the first tier the string fits under wins.
export function moneySizeClass(formatted: string, tiers: [number, string][]): string {
  for (const [maxLength, className] of tiers) {
    if (formatted.length <= maxLength) return className;
  }
  return tiers[tiers.length - 1][1];
}

// Same idea, but for a group of values shown side by side (e.g. a row of
// KPI tiles) -- picks whichever tier the *longest* value in the group needs,
// and returns that one class for all of them, so every box in the row uses
// the same font size instead of each shrinking independently.
export function moneySizeClassForGroup(values: string[], tiers: [number, string][]): string {
  let worstTierIndex = 0;
  for (const value of values) {
    const tierIndex = tiers.findIndex(([maxLength]) => value.length <= maxLength);
    worstTierIndex = Math.max(worstTierIndex, tierIndex === -1 ? tiers.length - 1 : tierIndex);
  }
  return tiers[worstTierIndex][1];
}
