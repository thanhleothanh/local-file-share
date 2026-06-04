const DEVICE_KIND_KEYS = ['mobile', 'tablet', 'desktop'] as const;
export type DeviceKind = (typeof DEVICE_KIND_KEYS)[number];

const COUNTER_KEY_PREFIX = 'lfs:namerCounter:';
const DEVICE_KIND_KEY = 'lfs:deviceKind';

export interface DeviceKindResult {
  kind: DeviceKind;
  ordinal: number;
  name: string;
}

function detectKindFromUserAgent(userAgent: string): DeviceKind {
  const lower = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(lower)) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android(?!.*tablet)|blackberry|iemobile|opera mini/.test(lower)) {
    return 'mobile';
  }
  return 'desktop';
}

export function detectKind(userAgent: string): DeviceKind {
  return detectKindFromUserAgent(userAgent);
}

export function getOrdinal(kind: DeviceKind, storage: Storage = localStorage): number {
  const key = `${COUNTER_KEY_PREFIX}${kind}`;
  const raw = storage.getItem(key);
  const current = raw === null ? 0 : Number.parseInt(raw, 10);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  storage.setItem(key, String(next));
  return next;
}

export function setKind(kind: DeviceKind, storage: Storage = localStorage): void {
  storage.setItem(DEVICE_KIND_KEY, kind);
}

export function getStoredKind(storage: Storage = localStorage): DeviceKind | null {
  const raw = storage.getItem(DEVICE_KIND_KEY);
  if (raw === null) return null;
  if ((DEVICE_KIND_KEYS as readonly string[]).includes(raw)) {
    return raw as DeviceKind;
  }
  return null;
}

export interface DeviceNamerOptions {
  userAgent?: string;
  storage?: Storage;
}

export class DeviceNamer {
  private readonly userAgent: string;
  private readonly storage: Storage;

  constructor(options: DeviceNamerOptions = {}) {
    this.userAgent = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    this.storage =
      options.storage ??
      (typeof localStorage !== 'undefined' ? localStorage : (undefined as unknown as Storage));
  }

  detect(): DeviceKind {
    return detectKind(this.userAgent);
  }

  generate(): DeviceNamerResult {
    const stored = getStoredKind(this.storage);
    const kind = stored ?? this.detect();
    if (stored === null) {
      setKind(kind, this.storage);
    }
    const ordinal = getOrdinal(kind, this.storage);
    const name = `${capitalize(kind)} #${ordinal}`;
    return { kind, ordinal, name };
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]?.toUpperCase() + value.slice(1);
}

export interface DeviceNamerResult extends DeviceKindResult {}
