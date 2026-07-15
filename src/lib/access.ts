// Etsy purchase-code gate. Static app, no backend (per CLAUDE.md) — so this is
// a soft, client-side check against a list baked in at build time, not real
// license enforcement. It exists to keep casual visitors on the demo data and
// point genuine buyers at the real (blank, Sheets-connected) experience.

const RAW = import.meta.env.VITE_ACCESS_CODES ?? "";

export const ACCESS_CODES: string[] = RAW.split(",")
  .map((c: string) => c.trim().toUpperCase())
  .filter(Boolean);

export function isValidAccessCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  return c.length > 0 && ACCESS_CODES.includes(c);
}
