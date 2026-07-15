// A destructive/high-friction action gated behind two tap-to-unlock latches,
// one flanking each side of the button — "unlock two latches before the
// hatch opens." Not real security, just deliberate friction so a scary
// action (start a new sheet, erase everything) isn't a single misplaced tap.
// Tapping the button while still locked shakes it and gives a haptic buzz on
// devices that support it, instead of silently doing nothing. Unlocking a
// latch bursts a little confetti — CSS-only, no library, matching the app's
// existing "no chart/animation libraries" discipline.
//
// While still locked, each latch's background strobes red/blue like a
// police light — deliberately driven by JS setTimeout with a RANDOMIZED
// delay each tick (not a CSS @keyframes loop), so the flash sequence never
// settles into an exact repeating rhythm the way a fixed-duration CSS
// animation always eventually does. Stops the instant that latch opens.
// Ported from TrackerA 2026-07-15, same file there for the reference copy.
import { useEffect, useState, type CSSProperties } from "react";
import { IconLock, IconUnlock } from "./icons";

interface ConfettiPiece {
  id: number;
  dx: number;
  dy: number;
  rotate: number;
  color: string;
}

const CONFETTI_COLORS = [
  "var(--success)",
  "var(--accent)",
  "var(--accent-2)",
  "var(--cat-butter)",
  "var(--cat-pink)",
  "var(--cat-teal)",
];
const CONFETTI_COUNT = 10;
const CONFETTI_MS = 650;

// Fixed (non-theme) colors on purpose — a warning strobe should read the
// same in light/dark/gallery mode, like a real siren. Slowed 2026-07-15 (was
// 90-320ms, reported "too fast") to something you can actually read as
// alternating red/blue instead of a blur.
const FLASH_MIN_MS = 280;
const FLASH_MAX_MS = 650;

function burstConfetti(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (Math.PI * 2 * i) / CONFETTI_COUNT + (Math.random() - 0.5) * 0.7;
    const dist = 24 + Math.random() * 20;
    return {
      id: i,
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist),
      rotate: Math.round(Math.random() * 360),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    };
  });
}

function Lock({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);
  const [flashColor, setFlashColor] = useState<"red" | "blue">("red");

  useEffect(() => {
    if (open) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setFlashColor((c) => (c === "red" ? "blue" : "red"));
      timer = setTimeout(tick, FLASH_MIN_MS + Math.random() * (FLASH_MAX_MS - FLASH_MIN_MS));
    };
    timer = setTimeout(tick, FLASH_MIN_MS + Math.random() * (FLASH_MAX_MS - FLASH_MIN_MS));
    return () => clearTimeout(timer);
  }, [open]);

  function handleClick() {
    const opening = !open;
    onToggle();
    if (opening) {
      const pieces = burstConfetti();
      setConfetti(pieces);
      window.setTimeout(() => setConfetti([]), CONFETTI_MS);
    }
  }

  return (
    <span className="lockgate__lockwrap">
      <button
        type="button"
        className={[
          "lockgate__lock",
          open ? "lockgate__lock--open" : `lockgate__lock--flash${flashColor}`,
        ].join(" ")}
        aria-pressed={open}
        aria-label={label}
        onClick={handleClick}
      >
        {open ? <IconUnlock size={18} /> : <IconLock size={18} />}
      </button>
      {confetti.map((c) => (
        <span
          key={c.id}
          className="lockgate__confetti"
          style={
            {
              "--dx": `${c.dx}px`,
              "--dy": `${c.dy}px`,
              "--rot": `${c.rotate}deg`,
              background: c.color,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

export function LockGatedButton({
  label,
  busyLabel,
  busy,
  danger = true,
  onConfirm,
}: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const [lock1Open, setLock1Open] = useState(false);
  const [lock2Open, setLock2Open] = useState(false);
  const [shake, setShake] = useState(false);
  const unlocked = lock1Open && lock2Open;

  function handleClick() {
    if (!unlocked || busy) {
      setShake(true);
      if (navigator.vibrate) navigator.vibrate(200);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    onConfirm();
    setLock1Open(false);
    setLock2Open(false);
  }

  return (
    <div className="lockgate">
      <Lock
        open={lock1Open}
        label={lock1Open ? "Latch 1 unlocked" : "Unlock latch 1"}
        onToggle={() => setLock1Open((v) => !v)}
      />
      <button
        type="button"
        className={[
          "btn",
          danger ? "btn--danger" : "btn--primary",
          "lockgate__btn",
          unlocked ? "lockgate__btn--unlocked" : "",
          shake ? "lockgate__btn--shake" : "",
        ].filter(Boolean).join(" ")}
        onClick={handleClick}
        onAnimationEnd={() => setShake(false)}
      >
        {busy ? (busyLabel ?? "Working…") : label}
      </button>
      <Lock
        open={lock2Open}
        label={lock2Open ? "Latch 2 unlocked" : "Unlock latch 2"}
        onToggle={() => setLock2Open((v) => !v)}
      />
    </div>
  );
}
