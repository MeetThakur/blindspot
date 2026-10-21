import { MAX_LIST_NAME_LENGTH, cleanItems } from '@whoami/shared';
import { useCallback, useState } from 'react';

const KEY = 'whoami.lists';
export const MAX_SAVED_LISTS = 30;

export interface SavedList {
  id: string;
  name: string;
  items: string[];
  updatedAt: number;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Named lists kept in this browser's localStorage only (they do not sync across devices). */
export class SavedListStore {
  constructor(private readonly storage: Storage | null) {}

  list(): SavedList[] {
    try {
      const raw = this.storage?.getItem(KEY);
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(data)) return [];
      return data
        .filter((l): l is SavedList => !!l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.items) && l.items.every((i: unknown) => typeof i === 'string'))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  private write(lists: SavedList[]): boolean {
    try {
      this.storage?.setItem(KEY, JSON.stringify(lists));
      return this.storage !== null;
    } catch {
      return false; // quota exceeded or storage blocked
    }
  }

  /** Saves under `name`; an existing list with the same name (any case) is replaced. */
  save(name: string, items: readonly string[]): { ok: true; list: SavedList } | { ok: false; message: string } {
    const clean = name.trim().slice(0, MAX_LIST_NAME_LENGTH);
    if (!clean) return { ok: false, message: 'Give your list a name first.' };
    const lists = this.list();
    const existing = lists.find((l) => l.name.toLowerCase() === clean.toLowerCase());
    if (!existing && lists.length >= MAX_SAVED_LISTS) {
      return { ok: false, message: `You can save up to ${MAX_SAVED_LISTS} lists. Delete one first.` };
    }
    const list: SavedList = { id: existing?.id ?? newId(), name: clean, items: cleanItems(items), updatedAt: Date.now() };
    const next = [list, ...lists.filter((l) => l.id !== list.id)];
    if (!this.write(next)) return { ok: false, message: "Couldn't save in this browser (storage is full or blocked)." };
    return { ok: true, list };
  }

  remove(id: string): void {
    this.write(this.list().filter((l) => l.id !== id));
  }
}

let shared: SavedListStore | null = null;
export const defaultStore = (): SavedListStore => {
  if (!shared) {
    let storage: Storage | null = null;
    try {
      storage = localStorage;
    } catch {
      storage = null;
    }
    shared = new SavedListStore(storage);
  }
  return shared;
};

/** Test hook: swap the shared store. */
export const setDefaultStore = (store: SavedListStore | null): void => {
  shared = store;
};

export function useSavedLists(store: SavedListStore = defaultStore()) {
  const [lists, setLists] = useState(() => store.list());
  const refresh = useCallback(() => setLists(store.list()), [store]);
  return { lists, refresh, store };
}
