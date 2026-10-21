import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@whoami/shared';
import { startHarness, type Harness } from './netHelpers.js';

let h: Harness;
afterEach(async () => {
  await h?.stop();
});

const make = (n: number, prefix = 'item') => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);

describe('custom lists over sockets', () => {
  it('accepts 10-500 unique items, deduping and trimming server-side', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob', 'Cara', 'Dan', 'Eve']);
    const host = clients[0]!;
    host.emit('update_room_settings', { list: { kind: 'custom', name: 'Ten', items: [...make(10), '  ITEM 1 ', '', 'item 2'] } });
    await vi.waitFor(() => expect(host.snapshot.list).toEqual({ name: 'Ten', count: 10 }));
    host.emit('update_room_settings', { list: { kind: 'custom', name: 'Max', items: make(500) } });
    await vi.waitFor(() => expect(host.snapshot.list).toEqual({ name: 'Max', count: 500 }));
  });

  it('rejects too-small, too-large, over-long and oversized-payload lists', async () => {
    h = await startHarness();
    const { clients } = await h.room(['Ann', 'Bob']);
    const host = clients[0]!;
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: make(9) } }, ErrorCode.LIST_INVALID);
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: [...make(9), 'ITEM 1', 'item 2'] } }, ErrorCode.LIST_INVALID); // dupes don't count
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: make(501) } }, ErrorCode.LIST_INVALID);
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: [...make(10), 'z'.repeat(61)] } }, ErrorCode.PAYLOAD_INVALID);
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: make(1001) } }, ErrorCode.PAYLOAD_INVALID);
    await host.expectError('update_room_settings', { list: { kind: 'custom', name: 'x', items: Array(800).fill('y'.repeat(60)) } }, ErrorCode.PAYLOAD_INVALID);
    expect(host.snapshot.list).toBeNull();
  });

  it('drops oversized socket messages entirely', async () => {
    h = await startHarness({ maxPayloadBytes: 2000 });
    const { clients } = await h.room(['Ann', 'Bob']);
    const host = clients[0]!;
    host.emit('update_room_settings', { list: { kind: 'custom', name: 'big', items: make(400) } });
    await new Promise((r) => setTimeout(r, 400));
    expect(host.snapshot.list).toBeNull();
  });
});
