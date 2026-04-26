import { vi } from "vitest";

export interface FsMock {
  existsSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  __store: Map<string, string>;
}

export function createFsMock(): FsMock {
  const store = new Map<string, string>();
  return {
    existsSync: vi.fn((path: string) => store.has(path)),
    readFileSync: vi.fn((path: string) => {
      const v = store.get(path);
      if (v == null) throw new Error("ENOENT");
      return v;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    mkdirSync: vi.fn(),
    __store: store,
  };
}
