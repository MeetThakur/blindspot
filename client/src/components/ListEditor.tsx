import { useMemo, useRef, useState } from 'react';
import { MAX_ITEM_LENGTH, MAX_LIST_ITEMS, MAX_LIST_NAME_LENGTH, MAX_LIST_PAYLOAD_CHARS, MIN_LIST_ITEMS, analyzeItems, validateItems } from '@whoami/shared';
import { download, parseImport, readFileText, slug, toJson, toText } from '../lib/listIO';
import { type SavedList, type SavedListStore } from '../lib/savedLists';

interface Props {
  store: SavedListStore;
  /** Players in the room (items must be at least this many). Use 2 outside a room. */
  playerCount: number;
  initial?: SavedList | null;
  /** Present in a lobby: lets the host play with this list. */
  onUse?: (name: string, items: string[]) => void;
  onSaved?: () => void;
  onClose?: () => void;
}

export function splitListInput(raw: string): string[] {
  return raw.split('\n').flatMap((line) => (line.includes(',') ? line.split(',') : [line]));
}

export function ListEditor({ store, playerCount, initial, onUse, onSaved, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [text, setText] = useState(initial ? initial.items.join(', ') : '');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rawItems = useMemo(() => splitListInput(text), [text]);
  const analysis = useMemo(() => analyzeItems(rawItems), [rawItems]);
  const totalChars = analysis.items.reduce((n, s) => n + s.length, 0);

  const problems: string[] = [];
  if (analysis.tooLong.length) {
    problems.push(
      `${analysis.tooLong.length} item${analysis.tooLong.length === 1 ? ' is' : 's are'} longer than ${MAX_ITEM_LENGTH} characters, e.g. “${analysis.tooLong[0]!.slice(0, 24)}…”. Shorten or remove ${analysis.tooLong.length === 1 ? 'it' : 'them'}.`,
    );
  }
  const sizeProblem = validateItems(analysis.items, playerCount);
  if (sizeProblem) problems.push(sizeProblem);
  if (totalChars > MAX_LIST_PAYLOAD_CHARS) problems.push('This list is too large. Remove some items.');
  const valid = problems.length === 0;

  const removeItem = (item: string) => {
    const key = item.trim().replace(/\s+/g, ' ');
    const remaining = splitListInput(text).filter((l) => l.trim().replace(/\s+/g, ' ') !== key);
    setText(remaining.join(', '));
  };

  const save = () => {
    const res = store.save(name, analysis.items);
    if (res.ok) {
      setNotice({ kind: 'ok', text: `Saved “${res.list.name}” in this browser.` });
      onSaved?.();
    } else setNotice({ kind: 'error', text: res.message });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const res = parseImport(await readFileText(file));
    if (!res.ok) return setNotice({ kind: 'error', text: res.message });
    if (res.name && !name.trim()) setName(res.name);
    else if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, '').slice(0, MAX_LIST_NAME_LENGTH));
    setText(res.items.join('\n'));
    setNotice({ kind: 'ok', text: `Imported ${res.items.length} line${res.items.length === 1 ? '' : 's'} from ${file.name}.` });
    if (fileRef.current) fileRef.current.value = '';
  };

  const label = name.trim() || 'my-list';

  return (
    <section className="card flex flex-col gap-3" aria-label="List editor">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">{initial ? 'Edit list' : 'Custom list'}</h3>
        {onClose && (
          <button type="button" className="btn-secondary !min-h-9 !px-3" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div>
        <label className="label" htmlFor="list-name">
          List name
        </label>
        <input id="list-name" className="field" value={name} maxLength={MAX_LIST_NAME_LENGTH} placeholder="e.g. Office legends" onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-1.5">
            <label className="label !mb-0" htmlFor="list-items">
              Items, one per line
            </label>
            <span className="text-xs text-ink-soft">(or comma-separated)</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              className="font-bold text-violet transition hover:underline"
              onClick={() => setText(analysis.items.join(', '))}
            >
              Format commas
            </button>
            <span className="text-ink-soft">·</span>
            <button
              type="button"
              className="font-bold text-violet transition hover:underline"
              onClick={() => setText(analysis.items.join('\n'))}
            >
              Format lines
            </button>
          </div>
        </div>
        <textarea
          id="list-items"
          className="field mt-1.5 min-h-40 font-mono text-sm"
          value={text}
          spellCheck={false}
          placeholder={'Pikachu, Shrek, Taylor Swift, Einstein, Batman...'}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="mt-1 text-sm" role="status" data-testid="list-count">
          <strong className={valid ? 'text-ink' : 'text-coral'}>{analysis.items.length} valid item{analysis.items.length === 1 ? '' : 's'}</strong>
          <span className="text-ink-soft">
            {' '}
            (need {Math.max(MIN_LIST_ITEMS, playerCount)}–{MAX_LIST_ITEMS}
            {analysis.duplicates > 0 && `, ${analysis.duplicates} duplicate${analysis.duplicates === 1 ? '' : 's'} ignored`}
            {analysis.blanks > 0 && `, ${analysis.blanks} blank line${analysis.blanks === 1 ? '' : 's'} ignored`})
          </span>
        </p>
        {problems.map((p) => (
          <p key={p} role="alert" className="mt-1 rounded-lg border-2 border-ink bg-blush px-2 py-1 text-sm font-bold">
            {p}
          </p>
        ))}
      </div>

      {analysis.items.length > 0 && analysis.items.length <= 60 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Items">
          {analysis.items.map((item) => (
            <li key={item} className="flex items-center gap-1 rounded-full border-2 border-ink bg-paper py-0.5 pl-3 pr-1 text-sm font-bold">
              <span className="max-w-48 truncate">{item}</span>
              <button type="button" aria-label={`Remove ${item}`} className="rounded-full px-1.5 leading-none hover:bg-blush" onClick={() => removeItem(item)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border-2 border-ink px-2 py-1 text-sm font-bold ${notice.kind === 'error' ? 'bg-blush' : 'bg-lime/60'}`}>
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {onUse && (
          <button type="button" className="btn-primary" disabled={!valid} onClick={() => onUse(name.trim() || 'Custom list', analysis.items)}>
            Use this list
          </button>
        )}
        <button type="button" className="btn-secondary" disabled={!name.trim() || analysis.items.length === 0} onClick={save}>
          Save in this browser
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
          Import file
        </button>
        <input ref={fileRef} type="file" accept=".json,.txt,text/plain,application/json" className="sr-only" aria-label="Import list file" onChange={(e) => void importFile(e.target.files?.[0])} />
        <button type="button" className="btn-secondary" disabled={analysis.items.length === 0} onClick={() => download(`${slug(label)}.json`, toJson(label, analysis.items), 'application/json')}>
          Export JSON
        </button>
        <button type="button" className="btn-secondary" disabled={analysis.items.length === 0} onClick={() => download(`${slug(label)}.txt`, toText(analysis.items), 'text/plain')}>
          Export text
        </button>
      </div>
      <p className="text-xs text-ink-soft">Saved lists live in this browser only. They don't sync to other devices, so export a file to move one.</p>
    </section>
  );
}
