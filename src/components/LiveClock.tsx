// A beautiful live clock — updates every second in its own component so the rest
// of the dashboard doesn't re-render. Respects reduced motion (colon stops blinking).
import { useEffect, useState } from "react";

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Align the first tick to the next second boundary, then tick every second.
    let interval: ReturnType<typeof setInterval>;
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(now.getMinutes()).padStart(2, "0");

  return (
    <div className="clock" aria-label={`${h}:${mm} ${ampm}`}>
      <span className="clock__hm">
        {h}
        <span className="clock__colon">:</span>
        {mm}
      </span>
      <span className="clock__ampm">{ampm}</span>
    </div>
  );
}
