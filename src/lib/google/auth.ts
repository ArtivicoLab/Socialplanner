// Google Identity Services (GIS) token client (spec §8). No gapi — we load the
// tiny GIS script and call REST endpoints with fetch ourselves.

const GIS_SRC = "https://accounts.google.com/gsi/client";
export const SCOPE_SHEETS = "https://www.googleapis.com/auth/drive.file";
export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.events";

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const hasClientId = CLIENT_ID.length > 0;

interface TokenState {
  token: string;
  expiresAt: number; // epoch ms
  scopes: Set<string>;
}
let state: TokenState | null = null;

// This in-memory `state` used to be ALL that backed the token — meaning a
// page reload for ANY reason (a new deploy's service-worker auto-update, a
// manual refresh, a backgrounded tab getting reclaimed) threw away a token
// that might still have had real minutes of validity left, forcing a fresh
// sign-in from zero every time even though the actual ~1hr Google token
// wasn't expiring anywhere near that fast. Mirrored into sessionStorage
// (survives a reload, scoped to this tab/session, gone when the tab closes —
// same practical exposure as keeping it in a JS variable) so a reload can
// revive a still-valid token instead of discarding it. Ported 2026-07-15
// from TrackerA, where this was found and fixed the same way.
const SESSION_KEY = "sp.token";

function persistToken(entry: TokenState) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token: entry.token, expiresAt: entry.expiresAt, scopes: [...entry.scopes] })
    );
  } catch {
    /* sessionStorage unavailable (private mode, quota) — in-memory state still covers this page load */
  }
}

function forgetPersistedToken() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** In-memory cache miss doesn't necessarily mean "no valid token" anymore —
    check sessionStorage before concluding a fresh sign-in is needed. */
function getCached(): TokenState | undefined {
  if (state) return state;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number; scopes: string[] };
    if (parsed.expiresAt - Date.now() <= 60_000) {
      forgetPersistedToken(); // expired (or near enough) — don't keep reviving a dead token
      return undefined;
    }
    const revived: TokenState = { token: parsed.token, expiresAt: parsed.expiresAt, scopes: new Set(parsed.scopes) };
    state = revived;
    return revived;
  } catch {
    return undefined;
  }
}

// GIS global (loaded from the script tag).
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisReady: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  return gisReady;
}

/**
 * Fetch the Google sign-in script ahead of time (fire-and-forget), so it's
 * already loaded by the time the user clicks Connect. Without this, the first
 * click has to wait on a real network round-trip before it can call
 * requestAccessToken() — which happens outside the click's synchronous call
 * stack and can make browsers treat the resulting popup as not user-initiated
 * (opens, then gets closed immediately).
 */
export function preloadGis(): void {
  if (hasClientId) void loadGis();
}

function tokenValid(scope: string): boolean {
  const entry = getCached();
  return (
    !!entry &&
    entry.expiresAt - Date.now() > 60_000 &&
    scope.split(" ").every((s) => entry.scopes.has(s))
  );
}

/** Milliseconds left before the cached token expires (0 if there is none
    cached at all). Lets background code decide "is this worth quietly
    refreshing now" without forcing a request. */
export function tokenTimeLeftMs(): number {
  const entry = getCached();
  return entry ? Math.max(0, entry.expiresAt - Date.now()) : 0;
}

// GIS's callback is not always guaranteed to fire — e.g. with strict
// third-party cookie/storage blocking, a silent (prompt:"none") request can
// just never call back at all instead of cleanly erroring. With no bound on
// that, every caller awaiting requestToken() hangs forever with no error —
// stuck on "Syncing…" with no way to recover short of a full page reload.
// Ported 2026-07-15 from TrackerA, where this was found and fixed the same
// way (confirmed real, 2026-07-13/14: both a silently-stuck request AND a
// genuinely blocked interactive popup are confirmed production causes, not
// hypothetical). Silent requests are normally near-instant, so a short bound
// is safe; interactive needs more room for a real human to read/click
// through Google's consent screen (widened from an initial 45s to 100s on
// TrackerA after a real attempt legitimately ran past 45s while carefully
// reading an "unverified app" warning and still completed successfully).
const SILENT_TOKEN_TIMEOUT_MS = 10_000;
const INTERACTIVE_TOKEN_TIMEOUT_MS = 100_000;

/**
 * Request (or silently refresh) an access token for `scope`.
 * @param interactive false = try silent (prompt: ''); true = allow the popup.
 *   No default — every caller must consciously decide. See sheets.ts's
 *   `allowInteractive` threading for why a default here is dangerous: it's
 *   the root-level function underneath the whole Sheets/Calendar call chain.
 */
export function requestToken(
  scope: string,
  interactive: boolean
): Promise<string> {
  if (!hasClientId) {
    return Promise.reject(
      new Error("No Google client ID configured. Add VITE_GOOGLE_CLIENT_ID to your .env.")
    );
  }
  if (tokenValid(scope)) return Promise.resolve(getCached()!.token);

  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeoutMs = interactive ? INTERACTIVE_TOKEN_TIMEOUT_MS : SILENT_TOKEN_TIMEOUT_MS;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(interactive
            ? "Google sign-in didn't complete. If a popup was blocked, look for a blocked-popup icon in your address bar and allow it for this site. If the popup opened but showed a Google error page, that's a temporary issue on Google's end — just try again."
            : "Could not silently refresh your Google connection."));
        }, timeoutMs);

        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope,
          callback: (resp) => {
            if (settled) return; // already timed out — ignore a very late callback
            settled = true;
            clearTimeout(timeout);
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Authorization was cancelled."));
              return;
            }
            const entry: TokenState = {
              token: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
              scopes: new Set((resp.scope ?? scope).split(" ")),
            };
            state = entry;
            persistToken(entry);
            resolve(resp.access_token);
          },
        });
        // '' attempts silent; 'consent' forces the account chooser.
        client.requestAccessToken({ prompt: interactive ? "" : "none" });
      })
  );
}

export function currentToken(): string | null {
  return tokenValid(SCOPE_SHEETS) ? getCached()!.token : null;
}

export function forgetToken() {
  if (state?.token) {
    try {
      window.google?.accounts.oauth2.revoke(state.token);
    } catch {
      /* ignore */
    }
  }
  state = null;
  // Clear the persisted copy too — getCached() only loads from sessionStorage
  // lazily on first use, so a stale entry could otherwise sit there and get
  // revived on the next call even though we just explicitly forgot it.
  forgetPersistedToken();
}
