import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe defaults in development', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({ port: 3001, clientOrigins: ['http://localhost:5173'], trustProxyHops: 0, timerScale: 1, disconnectGraceMs: 60_000 });
  });
  it('parses env vars, trimming trailing slashes and splitting multiple origins', () => {
    const c = loadConfig({ PORT: '8080', CLIENT_ORIGIN: 'https://a.app/, https://b.app', TRUST_PROXY_HOPS: '1', MAX_ROOMS_PER_IP: '2' });
    expect(c).toMatchObject({ port: 8080, clientOrigins: ['https://a.app', 'https://b.app'], trustProxyHops: 1, maxRoomsPerIp: 2 });
  });
  it('refuses to start in production without CLIENT_ORIGIN', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/CLIENT_ORIGIN/);
    expect(loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://x.app' }).clientOrigins).toEqual(['https://x.app']);
  });
  it('ignores junk numbers', () => {
    expect(loadConfig({ PORT: 'abc', MAX_ROOMS: '-4' })).toMatchObject({ port: 3001, maxRooms: 2000 });
  });
});
