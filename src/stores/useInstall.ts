// Tracks PWA installability: captures the browser's deferred install prompt
// (Chrome/Edge/Android) so a normal in-app button can trigger it, and detects
// standalone/iOS so the tab bar's brand icon can guide users who don't get a
// native prompt (iOS Safari never fires beforeinstallprompt at all).
import { create } from "zustand";

export type InstallPlatform = "ios" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

interface InstallState {
  platform: InstallPlatform;
  installed: boolean;
  canPrompt: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** Triggers the native install prompt if the browser handed us one. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export const useInstall = create<InstallState>((set, get) => ({
  platform: detectPlatform(),
  installed: isStandalone(),
  canPrompt: false,
  deferredPrompt: null,

  promptInstall: async () => {
    const { deferredPrompt } = get();
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    set({ deferredPrompt: null, canPrompt: false, installed: outcome === "accepted" ? true : get().installed });
    return outcome;
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    useInstall.setState({ deferredPrompt: e as BeforeInstallPromptEvent, canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    useInstall.setState({ installed: true, deferredPrompt: null, canPrompt: false });
  });
}
