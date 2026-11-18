/** Format micro-USD without rounding small real costs to $0.00. */
export function formatUsageUsd(microusd?: number | null): string {
  if (microusd == null || !Number.isFinite(microusd)) return "Not priced";
  if (microusd === 0) return "$0.00";
  const usd = microusd / 1_000_000;
  if (usd > 0 && usd < 0.000001) return "< $0.000001";
  const maximumFractionDigits = usd < 0.01 ? 6 : usd < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits }).format(usd);
}

export function usageHasUnpricedCosts(totals?: { unpricedEvents?: number } | null): boolean {
  return (totals?.unpricedEvents ?? 0) > 0;
}
