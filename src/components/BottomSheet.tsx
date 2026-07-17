// iOS-style modal sheet: slides up from the bottom on phones (grabber, frosted
// sticky nav header), presents as a centered form-sheet card on desktop.
// Header follows the native pattern — "Cancel" left, centered title, bold
// accent action right (pass `action`); sheets without an action get a gray
// circular ✕ instead. Portaled to document.body: screens render this deep
// inside .app__main, which gets its own stacking context from the page-in
// mount animation — without the portal, the sheet's z-index is trapped inside
// that context and loses to the fixed bottom tab bar (z-index 30) in actual
// paint order, so taps near the bottom of a tall sheet land on the tab bar.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./icons";

export interface SheetAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface Props {
  open: boolean;
  title?: string;
  onClose: () => void;
  /** Primary commit rendered iOS-style in the header (bold, accent, right).
   *  When present the left slot becomes a "Cancel" text button. */
  action?: SheetAction;
  children: React.ReactNode;
}

// Stack of currently-open sheets so nested sheets (e.g. a confirm dialog over
// an edit sheet) don't let Escape/unmount from an inner sheet affect an outer one.
let openSheetStack: symbol[] = [];

export function BottomSheet({ open, title, onClose, action, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [id] = useState(() => Symbol("sheet"));
  // The header's hairline + frost only fade in once content actually scrolls
  // beneath it — flat at rest, elevated in motion, exactly like a native bar.
  const [scrolled, setScrolled] = useState(false);

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
    setScrolled(false);
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

  const hasHeader = !!title || !!action;

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
        {hasHeader ? (
          <div className={`sheet__head${scrolled ? " sheet__head--scrolled" : ""}`}>
            <div className="sheet__grabber" aria-hidden />
            <div className="sheet__nav">
              {action ? (
                <button className="sheet__cancel" onClick={onClose}>
                  Cancel
                </button>
              ) : (
                <span className="sheet__navspacer" aria-hidden />
              )}
              <h2 className="sheet__title">{title}</h2>
              {action ? (
                <button
                  className={`sheet__action${action.danger ? " sheet__action--danger" : ""}`}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.label}
                </button>
              ) : (
                <button className="sheet__x" onClick={onClose} aria-label="Close">
                  <IconClose size={15} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="sheet__head sheet__head--bare">
            <div className="sheet__grabber" aria-hidden />
          </div>
        )}
        <div
          className="sheet__body"
          ref={bodyRef}
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
        >
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
