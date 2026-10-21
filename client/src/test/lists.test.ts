import { describe, expect, it } from 'vitest';
import { analyzeItems, validateItems } from '@whoami/shared';
import { parseImport, slug, toJson, toText } from '../lib/listIO';
import { SavedListStore, MAX_SAVED_LISTS } from '../lib/savedLists';
import { memoryStorage } from './factory';

describe('analyzeItems', () => {
  it('trims, drops blanks, dedupes ignoring case/accents, and counts what it removed', () => {
    const a = analyzeItems(['  Pikachu ', '', 'pikachu', 'Pokémon', 'pokemon', '   ', 'Shrek']);
    expect(a.items).toEqual(['Pikachu', 'Pokémon', 'Shrek']);
    expect(a.blanks).toBe(2);
    expect(a.duplicates).toBe(2);
  });
  it('flags items over 60 characters', () => {
    expect(analyzeItems(['a'.repeat(61), 'ok']).tooLong).toEqual(['a'.repeat(61)]);
  });
  it('gives helpful size errors, always at least one item per player', () => {
    expect(validateItems(Array(5).fill('x'), 2)).toMatch(/needs at least 10.*Add 5 more/);
    expect(validateItems(Array(10).fill('x'), 2)).toBeNull();
    expect(validateItems(Array(501).fill('x'), 2)).toMatch(/maximum is 500/);
  });
});

describe('import / export', () => {
  it('imports plain text, one item per line', () => {
    expect(parseImport('Pikachu\r\nShrek\n\nBatman')).toEqual({ ok: true, items: ['Pikachu', 'Shrek', '', 'Batman'] });
  });
  it('imports our JSON export, and bare JSON arrays', () => {
    const exported = toJson('My list', ['a', 'b']);
    expect(parseImport(exported)).toEqual({ ok: true, name: 'My list', items: ['a', 'b'] });
    expect(parseImport('["x","y"]')).toEqual({ ok: true, name: undefined, items: ['x', 'y'] });
  });
  it('rejects bad JSON, wrong shapes, empty and oversized files with a helpful message', () => {
    expect(parseImport('{"items": [1,2]}')).toMatchObject({ ok: false });
    expect(parseImport('{"oops"')).toMatchObject({ ok: false, message: expect.stringMatching(/JSON/) });
    expect(parseImport('   ')).toMatchObject({ ok: false });
    expect(parseImport('x'.repeat(300_000))).toMatchObject({ ok: false, message: expect.stringMatching(/too large/) });
  });
  it('round-trips through text export', () => {
    expect(parseImport(toText(['a', 'b']))).toEqual({ ok: true, items: ['a', 'b'] });
  });
  it('makes safe filenames', () => {
    expect(slug('Office Legends!! 2024')).toBe('office-legends-2024');
    expect(slug('???')).toBe('list');
  });
});

describe('SavedListStore (localStorage)', () => {
  it('saves, lists newest first, replaces same-named lists and deletes', () => {
    const store = new SavedListStore(memoryStorage());
    const a = store.save('Alpha', ['a1', 'a2', 'a2']);
    expect(a.ok && a.list.items).toEqual(['a1', 'a2']);
    store.save('Beta', ['b']);
    store.save('  alpha ', ['new']);
    const lists = store.list();
    expect(lists.map((l) => l.name)).toEqual(['alpha', 'Beta']);
    expect(lists[0]!.items).toEqual(['new']);
    store.remove(lists[0]!.id);
    expect(store.list().map((l) => l.name)).toEqual(['Beta']);
  });
  it('requires a name and caps the number of lists', () => {
    const store = new SavedListStore(memoryStorage());
    expect(store.save('  ', ['x'])).toMatchObject({ ok: false });
    for (let i = 0; i < MAX_SAVED_LISTS; i++) expect(store.save(`L${i}`, ['x']).ok).toBe(true);
    expect(store.save('one more', ['x'])).toMatchObject({ ok: false });
    expect(store.save('L0', ['y']).ok).toBe(true);
  });
  it('survives corrupt data and unavailable or full storage', () => {
    const bad = memoryStorage();
    bad.setItem('whoami.lists', '{not json');
    expect(new SavedListStore(bad).list()).toEqual([]);
    bad.setItem('whoami.lists', JSON.stringify([{ id: 1 }, { id: 'ok', name: 'n', items: ['a'], updatedAt: 1 }]));
    expect(new SavedListStore(bad).list()).toHaveLength(1);
    expect(new SavedListStore(null).save('x', ['a'])).toMatchObject({ ok: false });
    const full = { ...memoryStorage(), setItem: () => { throw new Error('quota'); } } as Storage;
    expect(new SavedListStore(full).save('x', ['a'])).toMatchObject({ ok: false, message: expect.stringMatching(/storage/) });
  });
});
