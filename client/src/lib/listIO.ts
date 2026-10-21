import { MAX_LIST_NAME_LENGTH, MAX_RAW_LIST_LINES } from '@whoami/shared';

export const MAX_IMPORT_BYTES = 200_000;

export type ImportResult = { ok: true; name?: string; items: string[] } | { ok: false; message: string };

/** Accepts a JSON export (`{name, items}` or a plain string array) or one item per line. */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: 'That file is too large to import.' };
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: 'That file is empty.' };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { ok: false, message: 'That looks like JSON but could not be read. Check for typos or use one item per line.' };
    }
    const rawItems = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
    if (!Array.isArray(rawItems) || !rawItems.every((i) => typeof i === 'string')) {
      return { ok: false, message: 'Expected a JSON list of text items, like ["Pikachu", "Shrek"].' };
    }
    const name = !Array.isArray(data) && typeof (data as { name?: unknown }).name === 'string' ? (data as { name: string }).name : undefined;
    return { ok: true, name: name?.trim().slice(0, MAX_LIST_NAME_LENGTH) || undefined, items: (rawItems as string[]).slice(0, MAX_RAW_LIST_LINES) };
  }
  return { ok: true, items: trimmed.split(/\r?\n/).slice(0, MAX_RAW_LIST_LINES) };
}

export const toJson = (name: string, items: readonly string[]): string =>
  JSON.stringify({ app: 'blindspot', version: 1, name, items }, null, 2) + '\n';

export const toText = (items: readonly string[]): string => items.join('\n') + '\n';

export const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'list';

export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a picked file as text (FileReader fallback for older browsers). */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
