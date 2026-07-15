// iOS-style bottom sheet with scrim, grabber, and Esc/back dismissal.
// Portaled to document.body: screens render this deep inside .app__main,
// which gets its own stacking context from the page-in mount animation —
// without the portal, the sheet's z-index is trapped inside that context and
// loses to the fixed bottom tab bar (z-index 30) in actual paint order, so
// taps near the bottom of a tall sheet land on the tab bar instead.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./icons";

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}

// Stack of currently-open sheets so nested sheets (e.g. a confirm dialog over
// an edit sheet) don't let Escape/unmount from an inner sheet affect an outer one.
let openSheetStack: symbol[] = [];

export function BottomSheet({ open, title, onClose, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [id] = useState(() => Symbol("sheet"));

  useEffect(() => {
    if (!open) return;
    openSheetStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openSheetStack[openSheetStack.length - 1] === id) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      openSheetStack = openSheetStack.filter((s) => s !== id);
      if (openSheetStack.length === 0) document.body.style.overflow = "";
    };
  }, [open, onClose, id]);

  useEffect(() => {
    if (!open) return;
    // Minimal focus management: move focus into the sheet on open so
    // keyboard/screen-reader users land inside it, not on the page behind.
    const el = sheetRef.current;
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? el).focus();
  }, [open]);

  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="sheet__grabber" />
        {title && (
          <div className="spread" style={{ marginBottom: 16 }}>
            <h2 className="sheet__title" style={{ margin: 0 }}>
              {title}
            </h2>
            <button
              className="chip"
              onClick={onClose}
              aria-label="Close"
              style={{ padding: 8, width: 34, height: 34, justifyContent: "center" }}
            >
              <IconClose width={18} height={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </>,
    document.body
  );
}
