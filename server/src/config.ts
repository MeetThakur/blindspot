export interface ServerConfig {
  port: number;
  /** Exact origins allowed to open a WebSocket / make CORS requests. */
  clientOrigins: string[];
  /** Number of trusted reverse-proxy hops in front of the server (0 = use the socket address). */
  trustProxyHops: number;
  maxRoomsPerIp: number;
  maxRooms: number;
  createLimit: { max: number; windowMs: number };
  joinLimit: { max: number; windowMs: number };
  /** Failed actions tolerated per socket per window before it is throttled. */
  invalidLimit: { max: number; windowMs: number };
  roomEmptyTtlMs: number;
  /** How long revealed answers stay on screen before the turn auto-advances. */
  revealDurationMs: number;
  maxPayloadBytes: number;
  /** Disconnect grace period before the game moves on without a player. */
  disconnectGraceMs: number;
  /** Multiplier for configurable timers. Leave at 1; integration tests shrink it. */
  timerScale: number;
}

export function defaultConfig(): ServerConfig {
  return {
    port: 3001,
    clientOrigins: ['http://localhost:5173'],
    trustProxyHops: 0,
    maxRoomsPerIp: 3,
    maxRooms: 2000,
    createLimit: { max: 5, windowMs: 10 * 60_000 },
    joinLimit: { max: 30, windowMs: 60_000 },
    invalidLimit: { max: 25, windowMs: 10_000 },
    roomEmptyTtlMs: 30 * 60_000,
    revealDurationMs: 6_000,
    maxPayloadBytes: 64 * 1024,
    disconnectGraceMs: 60_000,
    timerScale: 1,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const cfg = defaultConfig();
  const int = (v: string | undefined, fallback: number) => {
    const n = v === undefined ? NaN : Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  cfg.port = int(env.PORT, cfg.port);
  if (env.CLIENT_ORIGIN) {
    cfg.clientOrigins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  } else if (env.NODE_ENV === 'production') {
    throw new Error('CLIENT_ORIGIN must be set in production');
  }
  cfg.trustProxyHops = Number.parseInt(env.TRUST_PROXY_HOPS ?? '0', 10) || 0;
  cfg.maxRoomsPerIp = int(env.MAX_ROOMS_PER_IP, cfg.maxRoomsPerIp);
  cfg.maxRooms = int(env.MAX_ROOMS, cfg.maxRooms);
  cfg.createLimit.max = int(env.CREATE_ROOM_LIMIT, cfg.createLimit.max);
  cfg.joinLimit.max = int(env.JOIN_LIMIT_PER_MIN, cfg.joinLimit.max);
  return cfg;
}
