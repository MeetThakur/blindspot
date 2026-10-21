import { MAX_ITEM_LENGTH, MAX_LIST_ITEMS, MAX_LIST_PAYLOAD_CHARS, cleanItems, validateItems, type ListSelection } from '@whoami/shared';
import { findCategory } from './categories.js';

export interface IdentityList {
  name: string;
  items: string[];
}

export type ListResult = { ok: true; list: IdentityList } | { ok: false; message: string };

export { cleanItems, validateItems };

/** Resolves a selection into a cleaned list. Size-vs-players is checked by `validateItems`. */
export function resolveSelection(sel: ListSelection): ListResult {
  if (sel.kind === 'category') {
    const cat = findCategory(sel.id);
    if (!cat) return { ok: false, message: 'Unknown category.' };
    return { ok: true, list: { name: cat.name, items: cleanItems(cat.items) } };
  }
  const total = sel.items.reduce((n, s) => n + s.length, 0);
  if (total > MAX_LIST_PAYLOAD_CHARS) return { ok: false, message: 'That list is too large.' };
  const tooLong = sel.items.find((s) => s.trim().length > MAX_ITEM_LENGTH);
  if (tooLong !== undefined) {
    return { ok: false, message: `Items can be at most ${MAX_ITEM_LENGTH} characters: "${tooLong.trim().slice(0, 20)}…"` };
  }
  const items = cleanItems(sel.items);
  if (items.length > MAX_LIST_ITEMS) {
    return { ok: false, message: `Your list has ${items.length} items; the maximum is ${MAX_LIST_ITEMS}.` };
  }
  return { ok: true, list: { name: sel.name.trim(), items } };
}
