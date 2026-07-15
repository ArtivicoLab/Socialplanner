// Count-up number (spec §6.1: every number animates on mount, 300ms,
// respects prefers-reduced-motion).
import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountUp({ value, duration = 320, format, className }: Props) {
  const [n, setN] = useState(reduced() ? value : 0);
  const raf = useRef<number>();

  useEffect(() => {
    if (reduced()) {
      setN(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const rounded = Math.round(n);
  return <span className={className}>{format ? format(rounded) : rounded}</span>;
}
