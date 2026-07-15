// Shown when a newer deployed build is waiting (see main.tsx service-worker
// wiring). Lets the user jump to the latest version on their own tap instead of
// being stuck on a stale, cached one.
import { useAppUpdate } from "../lib/appUpdate";
import { IconRepeat } from "./icons";

export function UpdatePrompt() {
  const ready = useAppUpdate((s) => s.ready);
  const apply = useAppUpdate((s) => s.apply);
  if (!ready) return null;
  return (
    <div className="updatebar" role="status">
      <span className="updatebar__text">Update available</span>
      <button className="updatebar__btn" onClick={apply}>
        <IconRepeat size={15} />
        Refresh
      </button>
    </div>
  );
}
