import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { ListEditor } from '../components/ListEditor';
import { SavedListsManager } from '../components/SavedLists';
import { GameProvider } from '../lib/store';
import { readFileText } from '../lib/listIO';
import { SavedListStore, setDefaultStore } from '../lib/savedLists';
import { makeClient, memoryStorage, player, snapshot } from './factory';

const ten = Array.from({ length: 10 }, (_, i) => `Thing ${i + 1}`);
const paste = async (user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) => {
  await user.click(el);
  await user.paste(text);
};

afterEach(() => setDefaultStore(null));

describe('ListEditor', () => {
  it('shows a live valid count, ignoring blanks and duplicates, and a helpful too-small error', async () => {
    const user = userEvent.setup();
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={2} onUse={() => undefined} />);
    await paste(user, screen.getByLabelText('Items, one per line'), 'Pikachu\n\npikachu\nShrek\n');
    expect(screen.getByTestId('list-count')).toHaveTextContent('2 valid items');
    expect(screen.getByTestId('list-count')).toHaveTextContent('1 duplicate ignored');
    expect(screen.getByTestId('list-count')).toHaveTextContent('2 blank lines ignored');
    expect(screen.getByRole('alert')).toHaveTextContent(/needs at least 10.*Add 8 more/);
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeDisabled();
  });

  it('uses a valid list and sends cleaned items', async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={3} onUse={onUse} />);
    await user.type(screen.getByLabelText('List name'), 'Mine');
    await paste(user, screen.getByLabelText('Items, one per line'), ten.join('\n') + '\n  thing 1  ');
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Use this list' }));
    expect(onUse).toHaveBeenCalledWith('Mine', ten);
  });

  it('requires at least one item per player', async () => {
    const user = userEvent.setup();
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={5} onUse={() => undefined} initial={{ id: '1', name: 'x', items: ten, updatedAt: 0 }} />);
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove Thing 1' }));
    expect(screen.getByTestId('list-count')).toHaveTextContent('9 valid items');
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeDisabled();
  });

  it('blocks items longer than 60 characters', async () => {
    const user = userEvent.setup();
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={2} onUse={() => undefined} initial={{ id: '1', name: 'x', items: [...ten, 'z'.repeat(61)], updatedAt: 0 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/longer than 60/);
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Items, one per line'));
    await paste(user, screen.getByLabelText('Items, one per line'), ten.join('\n'));
    expect(screen.getByRole('button', { name: 'Use this list' })).toBeEnabled();
  });

  it('saves to the browser store and explains saved lists do not sync', async () => {
    const user = userEvent.setup();
    const store = new SavedListStore(memoryStorage());
    const onSaved = vi.fn();
    render(<ListEditor store={store} playerCount={2} onSaved={onSaved} />);
    expect(screen.getByText(/don't sync to other devices/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save in this browser' })).toBeDisabled();
    await user.type(screen.getByLabelText('List name'), 'Office');
    await paste(user, screen.getByLabelText('Items, one per line'), ten.join('\n'));
    await user.click(screen.getByRole('button', { name: 'Save in this browser' }));
    expect(store.list()[0]).toMatchObject({ name: 'Office', items: ten });
    expect(onSaved).toHaveBeenCalled();
  });

  it('imports a JSON file and a text file', async () => {
    const user = userEvent.setup();
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={2} onUse={() => undefined} />);
    const input = screen.getByLabelText('Import list file');
    await user.upload(input, new File([JSON.stringify({ name: 'From file', items: ten })], 'x.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByTestId('list-count')).toHaveTextContent('10 valid items'));
    expect(screen.getByLabelText('List name')).toHaveValue('From file');
    await user.upload(input, new File(['{"bad'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
    await user.upload(input, new File(['a\nb\nc'], 'plain.txt', { type: 'text/plain' }));
    await waitFor(() => expect(screen.getByTestId('list-count')).toHaveTextContent('3 valid items'));
  });

  it('exports JSON and text downloads', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={2} initial={{ id: '1', name: 'My Set', items: ten, updatedAt: 0 }} />);
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    await user.click(screen.getByRole('button', { name: 'Export text' }));
    expect(click).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFileText(created[0]!))).toMatchObject({ name: 'My Set', items: ten });
    expect((await readFileText(created[1]!)).trim().split('\n')).toEqual(ten);
    click.mockRestore();
  });

  it('shows hostile item text as plain text', async () => {
    render(<ListEditor store={new SavedListStore(memoryStorage())} playerCount={2} initial={{ id: '1', name: 'x', items: ['<img src=x onerror=alert(1)>'], updatedAt: 0 }} />);
    expect(within(screen.getByRole('list', { name: 'Items' })).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('SavedListsManager', () => {
  it('lists, edits, exports and deletes saved lists', async () => {
    const user = userEvent.setup();
    const store = new SavedListStore(memoryStorage());
    store.save('Alpha', ten);
    render(<SavedListsManager store={store} />);
    expect(screen.getByText('10 items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('List name')).toHaveValue('Alpha');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(store.list()).toHaveLength(0);
  });

  it('creates a new list from scratch', async () => {
    const user = userEvent.setup();
    const store = new SavedListStore(memoryStorage());
    render(<SavedListsManager store={store} />);
    await user.click(screen.getByRole('button', { name: 'New list' }));
    await user.type(screen.getByLabelText('List name'), 'Fresh');
    await paste(user, screen.getByLabelText('Items, one per line'), ten.join('\n'));
    await user.click(screen.getByRole('button', { name: 'Save in this browser' }));
    expect(await screen.findByText('Fresh')).toBeInTheDocument();
  });
});

describe('Lobby integration', () => {
  function lobby(extra = {}) {
    const ctx = makeClient();
    act(() => ctx.socket.trigger('connect'));
    act(() => ctx.socket.trigger('room_updated', snapshot(extra)));
    render(
      <GameProvider client={ctx.client}>
        <App />
      </GameProvider>,
    );
    return ctx;
  }

  it('host can pick a saved list directly', async () => {
    const store = new SavedListStore(memoryStorage());
    store.save('Office', ten);
    setDefaultStore(store);
    const { socket } = lobby();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Office (10)' }));
    expect(socket.last('update_room_settings')).toMatchObject({ list: { kind: 'custom', name: 'Office', items: ten } });
  });

  it('host can paste a list in the editor and use it; the server receives cleaned items', async () => {
    setDefaultStore(new SavedListStore(memoryStorage()));
    const { socket } = lobby();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Paste or import a list' }));
    await user.type(screen.getByLabelText('List name'), 'Pasted');
    await paste(user, screen.getByLabelText('Items, one per line'), [...ten, 'thing 2', ''].join('\n'));
    await user.click(screen.getByRole('button', { name: 'Use this list' }));
    expect(socket.last('update_room_settings')).toMatchObject({ list: { kind: 'custom', name: 'Pasted', items: ten } });
  });

  it('non-hosts do not get list tools; the editor needs one item per player', async () => {
    setDefaultStore(new SavedListStore(memoryStorage()));
    lobby({ youId: 'b' });
    expect(screen.queryByRole('button', { name: '+ Paste or import a list' })).not.toBeInTheDocument();
  });

  it('lists the current custom list for everyone', () => {
    lobby({ youId: 'b', list: { name: 'Pasted', count: 12 }, players: [player({ id: 'a', name: 'Ann', isHost: true }), player({ id: 'b', name: 'Bob' })] });
    expect(screen.getByText(/Custom list:/)).toHaveTextContent('Pasted');
  });
});
