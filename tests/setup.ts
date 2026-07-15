// Store modules touch `localStorage` (see src/lib/sync.ts) as soon as they're
// imported (useSync reads connection state at store-creation time), even for
// tests that only exercise pure functions from the same module. The test
// environment is plain Node, so give it a minimal in-memory stand-in.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as Storage;
}
