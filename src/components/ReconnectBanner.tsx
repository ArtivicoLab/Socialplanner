// A slim, always-visible bar shown whenever the Google connection has lapsed
// (needsReauth) — persistent across every screen, unlike a toast, which only
// helps if you happen to be looking at the exact moment it fires. That's the
// scenario this exists for: you closed the tab or left it idle long enough
// for the token to expire, come back later, and start typing before ever
// noticing "tap to reconnect" quietly changed in a corner pill. Local edits
// are always safe (IndexedDB never depends on this), but they won't reach
// the Sheet until reconnected, so this stays up until that happens instead
// of auto-dismissing. Ported from TrackerA 2026-07-15.
import { useSync } from "../stores/useSync";

export function ReconnectBanner() {
  const connected = useSync((s) => s.connected);
  const needsReauth = useSync((s) => s.needsReauth);
  const busy = useSync((s) => s.busy);
  const tapToRetry = useSync((s) => s.tapToRetry);
  if (!connected || !needsReauth) return null;
  return (
    <div className="reconnectbar" role="status">
      <span className="reconnectbar__text">
        Your Google connection lapsed while this was closed or idle for a while.
        New changes are saved on this device, but won't reach your Sheet until you reconnect.
      </span>
      <button className="reconnectbar__btn" onClick={() => void tapToRetry()} disabled={busy}>
        {busy ? "Reconnecting…" : "Reconnect"}
      </button>
    </div>
  );
}
