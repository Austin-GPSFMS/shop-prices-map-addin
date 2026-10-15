const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en-US");

export function money(v: number | null | undefined, cents = false): string {
  if (v == null || !isFinite(v)) return "—";
  return cents ? usd2.format(v) : usd0.format(v);
}

export function formatInt(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return int.format(Math.round(v));
}

export function pct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !isFinite(ratio)) return "—";
  const p = (ratio - 1) * 100;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return `${sign}${Math.abs(p).toFixed(digits)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function miles(v: number): string {
  return v < 10 ? `${v.toFixed(1)} mi` : `${Math.round(v)} mi`;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
