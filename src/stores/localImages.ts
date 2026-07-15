// In-memory cache of every device-picked post photo, mirroring the
// `postImages` IndexedDB store (see lib/db.ts) so components read it
// synchronously — the same pattern the CRUD stores use for every other
// collection, just keyed by post id -> Blob instead of id -> record. Never
// synced to Google Sheets; see LocalImageRow in db.ts for why.
import { create } from "zustand";
import * as db from "../lib/db";

interface LocalImagesState {
  map: Record<string, Blob>;
  load: () => Promise<void>;
  set: (postId: string, blob: Blob) => Promise<void>;
  remove: (postId: string) => Promise<void>;
}

export const useLocalImages = create<LocalImagesState>((set, get) => ({
  map: {},
  load: async () => {
    const rows = await db.allPostImages();
    const map: Record<string, Blob> = {};
    for (const row of rows) map[row.id] = row.blob;
    set({ map });
  },
  set: async (postId, blob) => {
    await db.putPostImage(postId, blob);
    set({ map: { ...get().map, [postId]: blob } });
  },
  remove: async (postId) => {
    await db.deletePostImage(postId);
    const next = { ...get().map };
    delete next[postId];
    set({ map: next });
  },
}));
