// A small "(?)" affordance that explains what the thing next to it is for —
// tap to reveal, tap outside/Escape to dismiss. The bubble is portaled to
// document.body and positioned in viewport coordinates measured on open, so it
// never runs off the left/right/bottom edge and is never clipped or
// mis-positioned by a transformed ancestor (e.g. BottomSheet).
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconHelp } from "./icons";

const EDGE_MARGIN = 12;

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const anchor = wrapRef.current?.getBoundingClientRect();
      const bubble = bubbleRef.current?.getBoundingClientRect();
      if (!anchor || !bubble) return;

      let left = anchor.left + anchor.width / 2 - bubble.width / 2;
      const maxLeft = window.innerWidth - bubble.width - EDGE_MARGIN;
      left = Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, maxLeft));

      const fitsBelow = anchor.bottom + 8 + bubble.height <= window.innerHeight;
      setPos(
        fitsBelow
          ? { left, top: anchor.bottom + 8 }
          : { left, bottom: window.innerHeight - anchor.top + 8 }
      );
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="helptip" ref={wrapRef}>
      <button
        type="button"
        className="helptip__btn"
        aria-label="What's this?"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <IconHelp />
      </button>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            className="helptip__bubble"
            role="tooltip"
            style={
              pos
                ? { left: pos.left, top: pos.top, bottom: pos.bottom, visibility: "visible" }
                : { left: 0, top: 0, visibility: "hidden" }
            }
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
