// Typed Google Sheets REST wrapper (spec §8). Raw fetch + bearer token, with a
// single transparent retry on 401 (token expiry).

import { requestToken, SCOPE_SHEETS } from "./auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// No bound on the raw fetch() meant a dropped connection or unresponsive
// server hung forever with nothing to catch it — same class of bug as
// requestToken()'s missing timeout (see auth.ts). Ported 2026-07-15 from
// TrackerA.
const FETCH_TIMEOUT_MS = 20_000;

/**
 * `allowInteractive` has NO default on purpose — every caller must consciously
 * decide. This used to silently fall back to an INTERACTIVE (popup) token
 * request whenever a silent refresh failed, with no regard for whether the
 * call was inside a real user click or a background timer — a debounced
 * background push could try to pop a Google sign-in with no user gesture
 * behind it, which browsers block silently, hanging the caller forever with
 * no error (confirmed as a real production cause on TrackerA, 2026-07-13;
 * ported the fix 2026-07-15 since TrackerC had the identical unguarded
 * fallback). Pass `true` only from a genuine, current click handler; `false`
 * from anything automatic (a debounced flush, a timer, an `online` listener).
 */
async function authedFetch(
  url: string,
  init: RequestInit = {},
  allowInteractive: boolean,
  retry = true
): Promise<Response> {
  let token: string;
  try {
    token = await requestToken(SCOPE_SHEETS, false); // always try silent first
  } catch {
    if (!allowInteractive) {
      throw new ReauthRequiredError(
        "Your Google connection needs a quick refresh — tap to reconnect."
      );
    }
    token = await requestToken(SCOPE_SHEETS, true); // popup — only ever reached from a real click
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("The request to Google timed out. Check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && retry) {
    // The cached token looked valid locally but the server just rejected it —
    // force a fresh one and retry exactly once.
    if (!allowInteractive) {
      throw new ReauthRequiredError(
        "Your Google connection needs a quick refresh — tap to reconnect."
      );
    }
    await requestToken(SCOPE_SHEETS, true);
    return authedFetch(url, init, allowInteractive, false);
  }
  return res;
}

/** Thrown when a background/unattended call needed a fresh token but
    couldn't get one silently — the caller must surface a "tap to reconnect"
    affordance rather than retry automatically forever. */
export class ReauthRequiredError extends Error {}
export class SheetNotFoundError extends Error {}
export class SheetPermissionDeniedError extends Error {}

async function ok(res: Response): Promise<unknown> {
  if (res.status === 404) throw new SheetNotFoundError("Spreadsheet not found");
  if (res.status === 403) throw new SheetPermissionDeniedError("No access to this spreadsheet");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Create a spreadsheet with the given tab titles. Returns its id. */
export async function createSpreadsheet(
  title: string,
  tabTitles: string[],
  allowInteractive: boolean
): Promise<string> {
  const body = {
    properties: { title },
    sheets: tabTitles.map((t) => ({ properties: { title: t } })),
  };
  const res = await authedFetch(BASE, { method: "POST", body: JSON.stringify(body) }, allowInteractive);
  const json = (await ok(res)) as { spreadsheetId: string };
  return json.spreadsheetId;
}

export interface SpreadsheetMeta {
  title: string;
  tabTitles: string[];
}

export async function getMeta(spreadsheetId: string, allowInteractive: boolean): Promise<SpreadsheetMeta> {
  const res = await authedFetch(
    `${BASE}/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    {},
    allowInteractive
  );
  const json = (await ok(res)) as {
    properties: { title: string };
    sheets: { properties: { title: string } }[];
  };
  return {
    title: json.properties.title,
    tabTitles: json.sheets.map((s) => s.properties.title),
  };
}

/** Add any missing tabs (used to migrate an older sheet forward). */
export async function ensureTabs(
  spreadsheetId: string,
  wantTabs: string[],
  allowInteractive: boolean
): Promise<void> {
  const meta = await getMeta(spreadsheetId, allowInteractive);
  const missing = wantTabs.filter((t) => !meta.tabTitles.includes(t));
  if (missing.length === 0) return;
  const requests = missing.map((title) => ({ addSheet: { properties: { title } } }));
  const res = await authedFetch(`${BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  }, allowInteractive);
  await ok(res);
}

/** Read several tab ranges in one call. Returns tab -> 2D string values. */
export async function batchGet(
  spreadsheetId: string,
  tabs: string[],
  allowInteractive: boolean
): Promise<Record<string, string[][]>> {
  const params = tabs.map((t) => `ranges=${encodeURIComponent(t)}`).join("&");
  const res = await authedFetch(`${BASE}/${spreadsheetId}/values:batchGet?${params}`, {}, allowInteractive);
  const json = (await ok(res)) as {
    valueRanges: { range: string; values?: string[][] }[];
  };
  const out: Record<string, string[][]> = {};
  json.valueRanges.forEach((vr, i) => {
    out[tabs[i]] = vr.values ?? [];
  });
  return out;
}

/** Overwrite a whole tab with `values` (header row + data). Clears stale rows first. */
export async function writeTab(
  spreadsheetId: string,
  tab: string,
  values: string[][],
  allowInteractive: boolean
): Promise<void> {
  const clearRes = await authedFetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`,
    { method: "POST", body: "{}" },
    allowInteractive
  );
  await ok(clearRes);
  const res = await authedFetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) },
    allowInteractive
  );
  await ok(res);
}

export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
