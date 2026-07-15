import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button red — use for destructive/hard-to-reverse actions. */
  danger?: boolean;
}
interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  current: PendingConfirm | null;
  request: (opts: ConfirmRequest) => Promise<boolean>;
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  current: null,
  request: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ current: { ...opts, resolve } });
    }),
  resolve: (ok) => {
    get().current?.resolve(ok);
    set({ current: null });
  },
}));

/** Drop-in, app-themed replacement for window.confirm() — never use the raw
    browser confirm()/alert() in this app; they can't be styled and look like
    a broken site on an installed PWA. Usage: `if (!(await confirmDialog({...
    }))) return;` */
export function confirmDialog(opts: ConfirmRequest): Promise<boolean> {
  return useConfirm.getState().request(opts);
}
