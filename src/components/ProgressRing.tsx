// Signature progress ring — pure CSS conic-gradient (no SVG), animated in JS.
// Respects reduced motion. Used for every key metric.
import { useEffect, useRef, useState } from "react";

interface Props {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  hole?: string; // color of the punched-out center (match the surface it sits on)
  label?: string;
  showPct?: boolean;
  center?: React.ReactNode;
  /** Empty/neutral state: a muted dotted ring, no fill. For 0-progress-with-items —
      absence should read as "fresh start", never as failure. */
  dotted?: boolean;
  /** Screen-reader description of what this ring represents (e.g. "3 of 5 tasks
      done"). Falls back to "<label>: N%" (or just "N%") when omitted — ARIA
      progressbar naming always comes from the author, never from visible
      child content, so this (or the fallback) is the only text AT will hear. */
  ariaLabel?: string;
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  color = "var(--accent)",
  track = "var(--surface-2)",
  hole = "var(--surface)",
  label,
  showPct,
  center,
  dotted,
  ariaLabel,
}: Props) {
  const clamped = Math.max(0, Math.min(1, value || 0));
  const pct = Math.round(clamped * 100);
  const defaultLabel = dotted
    ? label
      ? `${label}: no data yet`
      : "No data yet"
    : label
      ? `${label}: ${pct}%`
      : `${pct}%`;
  const [anim, setAnim] = useState(prefersReduced() ? clamped : 0);
  const raf = useRef<number>();

  useEffect(() => {
    if (prefersReduced()) {
      setAnim(clamped);
      return;
    }
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnim(clamped * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [clamped]);

  const deg = anim * 360;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel ?? defaultLabel}
      aria-valuenow={dotted ? undefined : pct}
      aria-valuemin={dotted ? undefined : 0}
      aria-valuemax={dotted ? undefined : 100}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        ...(dotted
          ? { border: `${Math.max(2, stroke - 4)}px dotted var(--hairline)`, background: "transparent" }
          : { background: `conic-gradient(${color} ${deg}deg, ${track} ${deg}deg 360deg)` }),
      }}
    >
      {/* punched-out center */}
      <div
        style={{
          position: "absolute",
          inset: dotted ? 0 : stroke,
          borderRadius: "50%",
          background: dotted ? "transparent" : hole,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {center ??
          (showPct && (
            <>
              <span style={{ fontSize: size * 0.26, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {Math.round(anim * 100)}%
              </span>
              {label && (
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                  {label}
                </span>
              )}
            </>
          ))}
      </div>
    </div>
  );
}
