import { useCurrency } from "@/lib/currency";

export function CurrencySelector() {
  const { displayCurrency, setDisplayCurrency, availableCurrencies, ratesLoading, ratesError } = useCurrency();

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={displayCurrency}
        onChange={(e) => setDisplayCurrency(e.target.value)}
        disabled={ratesLoading}
        title={ratesError ? `Exchange rates unavailable: ${ratesError}` : "Display currency"}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium disabled:opacity-60"
      >
        {availableCurrencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
