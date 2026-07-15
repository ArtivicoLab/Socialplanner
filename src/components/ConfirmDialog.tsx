import { BottomSheet } from "./BottomSheet";
import { useConfirm } from "../stores/useConfirm";

// Renders whatever confirmDialog() is currently waiting on. Mounted once at
// the app shell (see App.tsx) — this is the ONLY confirm UI in the app; never
// call window.confirm()/alert() directly, see the comment on confirmDialog().
export function ConfirmHost() {
  const current = useConfirm((s) => s.current);
  const resolve = useConfirm((s) => s.resolve);

  if (!current) return null;
  return (
    <BottomSheet open title={current.title} onClose={() => resolve(false)}>
      <p className="muted" style={{ marginTop: 0 }}>{current.message}</p>
      <div className="spread spread--gap8" style={{ marginTop: 16 }}>
        <button className="btn btn--ghost btn--auto" onClick={() => resolve(false)}>
          {current.cancelLabel ?? "Cancel"}
        </button>
        <button
          className={`btn btn--auto ${current.danger ? "btn--danger" : "btn--primary"}`}
          onClick={() => resolve(true)}
        >
          {current.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </BottomSheet>
  );
}
