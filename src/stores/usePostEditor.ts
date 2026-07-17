import { create } from "zustand";
import type { Post } from "../lib/types";

type PostEditorMode = "view" | "edit";

interface PostEditorState {
  open: boolean;
  mode: PostEditorMode;
  post: Post | null;
  prefillDate: string;
  show: (post: Post | null, prefillDate: string) => void;
  edit: () => void;
  close: () => void;
}

export const usePostEditor = create<PostEditorState>((set) => ({
  open: false,
  mode: "view",
  post: null,
  prefillDate: "",
  // Existing post -> view first (see openPostEditor's doc comment for why);
  // no post (creating new) -> nothing to view yet, straight to edit.
  show: (post, prefillDate) => set({ open: true, mode: post ? "view" : "edit", post, prefillDate }),
  edit: () => set({ mode: "edit" }),
  close: () => set({ open: false }),
}));

/**
 * Open the shared post editor in place, wherever it's called from — Monthly
 * Plan, Feed Preview, Dashboard, Idea Bank, Calendar, anywhere a post is
 * shown — without navigating away to the Scheduler route. Pass `post: null`
 * to create a new one (optionally prefilled with a date), which opens
 * straight into the edit form.
 *
 * An EXISTING post opens read-only first, not the edit form — confirmed
 * live 2026-07-17: jumping straight into an editable form on every click
 * made it awkward to just glance at what was already written, or proofread
 * a hook/caption/CTA for typos, and risked an accidental edit on a tap that
 * was only ever meant to look. See PostViewSheet.tsx (the read-only surface,
 * with an "Edit" button that switches this same open post to the real
 * PostSheet form) and PostEditorHost.tsx (the single mounted instance that
 * renders whichever one `mode` currently says — same pattern as
 * useConfirm/ConfirmHost).
 *
 * Also confirmed live the same day: `navigate("scheduler", { post: id })`
 * from every screen except Calendar (which already rendered its own local
 * `<PostSheet>`) read as a bug in its own right — "why does clicking a post
 * jump back to Scheduler." `PostSheet` was already documented as
 * screen-agnostic ("one editor, every entry point"); this store is what
 * actually makes that true everywhere, not just on Calendar.
 */
export function openPostEditor(post: Post | null, prefillDate = ""): void {
  usePostEditor.getState().show(post, prefillDate);
}

/** Switch the currently-open post from the read-only view to the edit form,
 *  without closing/reopening (used by PostViewSheet's "Edit" button). */
export function switchPostEditorToEdit(): void {
  usePostEditor.getState().edit();
}
