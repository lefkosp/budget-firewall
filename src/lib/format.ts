export function formatCurrency(
  cents: number,
  currency: string = "EUR",
  signDisplay: "auto" | "exceptZero" = "auto"
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: 2,
    signDisplay,
  }).format(cents / 100);
}
