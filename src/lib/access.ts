// Etsy purchase-code gate. Static app, no backend (per CLAUDE.md) — so this is
// a soft, client-side check against a list baked in at build time, not real
// license enforcement. It exists to keep casual visitors on the demo data and
// point genuine buyers at the real (blank, Sheets-connected) experience.
//
// isValidAccessCode() alone has zero memory of past attempts — anyone with
// devtools open can call it directly, unlimited times, with no network
// round-trip to slow them down, so this can never be made truly brute-force-
// proof from a static site (that ceiling is inherent to "no backend of ours,"
// see CLAUDE.md, and isn't fixable without a server to own the rate limit).
// tryUnlock() below is an honest, not bulletproof, speed bump: an escalating
// lockout after repeated wrong guesses through the real UI, persisted to BOTH
// localStorage and IndexedDB (see db.ts's kv store) so a plain refresh, or
// clearing just one of the two storages, doesn't hand back a free reset —
// whichever storage shows the more restrictive state wins. UI code should
// always go through tryUnlock(), never call isValidAccessCode() directly.

import { getKV, setKV } from "./db";

const RAW = import.meta.env.VITE_ACCESS_CODES ?? "";

export const ACCESS_CODES: string[] = RAW.split(",")
  .map((c: string) => c.trim().toUpperCase())
  .filter(Boolean);

export function isValidAccessCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  return c.length > 0 && ACCESS_CODES.includes(c);
}

// ---- brute-force throttle ----

const LS_THROTTLE = "sp.unlockThrottle";
const FREE_ATTEMPTS = 5; // no lockout for the first few — real buyers mistype
const FIRST_LOCK_MS = 30_000; // 30s, just the 6th attempt
const HOUR_MS = 60 * 60_000;
const MAX_LOCK_MS = 24 * HOUR_MS; // cap at 24h so a genuine buyer isn't locked out for good

interface ThrottleState {
  failCount: number;
  lockedUntil: number; // epoch ms, 0 = not locked
}

const EMPTY_THROTTLE: ThrottleState = { failCount: 0, lockedUntil: 0 };

function readLocalStorage(): ThrottleState {
  try {
    const raw = localStorage.getItem(LS_THROTTLE);
    if (!raw) return EMPTY_THROTTLE;
    const parsed = JSON.parse(raw);
    return { failCount: Number(parsed.failCount) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
  } catch {
    return EMPTY_THROTTLE;
  }
}

function writeLocalStorage(state: ThrottleState): void {
  try {
    localStorage.setItem(LS_THROTTLE, JSON.stringify(state));
  } catch {
    // Private mode / quota exceeded — the IndexedDB copy still applies.
  }
}

async function readIndexedDb(): Promise<ThrottleState> {
  try {
    const stored = await getKV<ThrottleState>(LS_THROTTLE);
    if (!stored) return EMPTY_THROTTLE;
    return { failCount: Number(stored.failCount) || 0, lockedUntil: Number(stored.lockedUntil) || 0 };
  } catch {
    return EMPTY_THROTTLE;
  }
}

async function writeBoth(state: ThrottleState): Promise<void> {
  writeLocalStorage(state);
  await setKV(LS_THROTTLE, state).catch(() => {});
}

// Reconciles localStorage + IndexedDB, keeping whichever is more restrictive
// (higher fail count / later lockout) so clearing just one of the two
// storages doesn't hand back a free reset, then re-syncs both to match.
async function reconciledThrottle(): Promise<ThrottleState> {
  const [local, idb] = await Promise.all([readLocalStorage(), readIndexedDb()]);
  const merged: ThrottleState = {
    failCount: Math.max(local.failCount, idb.failCount),
    lockedUntil: Math.max(local.lockedUntil, idb.lockedUntil),
  };
  if (merged.failCount !== local.failCount || merged.lockedUntil !== local.lockedUntil ||
      merged.failCount !== idb.failCount || merged.lockedUntil !== idb.lockedUntil) {
    await writeBoth(merged);
  }
  return merged;
}

function lockDurationMs(failCount: number): number {
  if (failCount <= FREE_ATTEMPTS) return 0;
  const over = failCount - FREE_ATTEMPTS;
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (over - 1));
}

export interface UnlockResult {
  ok: boolean;
  /** Set only when ok is false because of an active lockout, not a wrong code. */
  retryAfterMs?: number;
}

/**
 * The one entry point real UI should call to attempt an unlock. Wraps
 * isValidAccessCode() with the escalating-lockout throttle above.
 */
export async function tryUnlock(code: string): Promise<UnlockResult> {
  const state = await reconciledThrottle();
  const now = Date.now();
  if (state.lockedUntil > now) {
    return { ok: false, retryAfterMs: state.lockedUntil - now };
  }

  if (isValidAccessCode(code)) {
    await writeBoth(EMPTY_THROTTLE);
    return { ok: true };
  }

  const failCount = state.failCount + 1;
  const lockMs = lockDurationMs(failCount);
  await writeBoth({ failCount, lockedUntil: lockMs > 0 ? now + lockMs : 0 });
  return { ok: false, retryAfterMs: lockMs > 0 ? lockMs : undefined };
}

/** Ms remaining on an active lockout, or 0 if none — for a mount-time check
    so a reload mid-lockout shows the wait immediately instead of only after
    the next failed submit. */
export async function currentLockoutMs(): Promise<number> {
  const state = await reconciledThrottle();
  return Math.max(0, state.lockedUntil - Date.now());
}
