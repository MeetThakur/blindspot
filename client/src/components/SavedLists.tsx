import { useState } from 'react';
import { download, slug, toJson, toText } from '../lib/listIO';
import { useSavedLists, type SavedList, type SavedListStore } from '../lib/savedLists';
import { ConfirmButton } from './ui';
import { ListEditor } from './ListEditor';

/** Home-screen manager: create, edit, import, export and delete saved lists. */
export function SavedListsManager({ store }: { store?: SavedListStore }) {
  const { lists, refresh, store: s } = useSavedLists(store);
  const [editing, setEditing] = useState<SavedList | 'new' | null>(null);

  return (
    <section className="card" aria-labelledby="saved-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="saved-h" className="text-xl font-extrabold">
          Your saved lists
        </h2>
        <button type="button" className="btn-secondary !min-h-9" onClick={() => setEditing('new')}>
          New list
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Custom lists you save stay in this browser. They don't sync to other devices.</p>

      {lists.length === 0 ? (
        <p className="mt-3 text-ink-soft">Nothing saved yet. Make a list of your own characters, inside jokes or anything else, and the host can play with it.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {lists.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-ink px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{l.name}</span>
                <span className="text-sm text-ink-soft">{l.items.length} items</span>
              </span>
              <button type="button" className="btn-secondary !min-h-9 !px-3 text-sm" onClick={() => setEditing(l)}>
                Edit
              </button>
              <button type="button" className="btn-secondary !min-h-9 !px-3 text-sm" aria-label={`Export ${l.name} as JSON`} onClick={() => download(`${slug(l.name)}.json`, toJson(l.name, l.items), 'application/json')}>
                JSON
              </button>
              <button type="button" className="btn-secondary !min-h-9 !px-3 text-sm" aria-label={`Export ${l.name} as text`} onClick={() => download(`${slug(l.name)}.txt`, toText(l.items), 'text/plain')}>
                Text
              </button>
              <ConfirmButton
                label="Delete"
                className="btn-danger !min-h-9 !px-3 text-sm"
                title={`Delete “${l.name}”?`}
                body="This removes it from this browser. Export it first if you want a copy."
                confirmLabel="Delete"
                onConfirm={() => {
                  s.remove(l.id);
                  refresh();
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mt-4">
          <ListEditor
            key={editing === 'new' ? 'new' : editing.id}
            store={s}
            playerCount={2}
            initial={editing === 'new' ? null : editing}
            onSaved={refresh}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
    </section>
  );
}
