import { AppState, Platform } from 'react-native';

type Entry = {
  key: string;
  resources: unknown;
  bytes: number;
  destroy: () => void;
};
type Pool = { entries: Entry[]; bytes: number; lost: boolean };
const pools = new WeakMap<GPUDevice, Pool>();
const MAX_IDLE_SETS = 16;
const MAX_IDLE_BYTES = 64 * 1024 * 1024;
const livePools = new Set<WeakRef<Pool>>();
let background = AppState.currentState === 'background';
let observingAppState = false;

const clearPool = (pool: Pool) => {
  const entries = pool.entries;
  pool.entries = [];
  pool.bytes = 0;
  for (const entry of entries) entry.destroy();
};

const observeAppState = () => {
  if (observingAppState) return;
  observingAppState = true;
  background = AppState.currentState === 'background';
  AppState.addEventListener('change', (state) => {
    background = state === 'background';
    for (const reference of livePools) {
      const pool = reference.deref();
      if (!pool) livePools.delete(reference);
      else if (background) clearPool(pool);
    }
  });
};

const getPool = (device: GPUDevice) => {
  let pool = pools.get(device);
  if (pool) return pool;
  pool = { entries: [], bytes: 0, lost: false };
  pools.set(device, pool);
  observeAppState();
  // The process listener must not keep injected devices or their pools alive.
  for (const reference of livePools) {
    if (!reference.deref()) livePools.delete(reference);
  }
  const reference = new WeakRef(pool);
  livePools.add(reference);
  const ownedPool = pool;
  void device.lost.then(() => {
    ownedPool.lost = true;
    clearPool(ownedPool);
    livePools.delete(reference);
  });
  return pool;
};

export const acquireIdleGPUResources = <Resources>(
  device: GPUDevice,
  key: string
): Resources | undefined => {
  if (Platform.OS !== 'android') return undefined;
  const pool = getPool(device);
  const index = pool.entries.findIndex((entry) => entry.key === key);
  if (index < 0 || pool.lost) return undefined;
  const [entry] = pool.entries.splice(index, 1);
  if (!entry) return undefined;
  pool.bytes -= entry.bytes;
  return entry.resources as Resources;
};

/** Borrowers must use the same device queue after the owner's FIFO barrier. */
export const releaseIdleGPUResources = (
  device: GPUDevice,
  key: string,
  resources: unknown,
  bytes: number,
  destroy: () => void
) => {
  if (Platform.OS !== 'android' || bytes > MAX_IDLE_BYTES) return false;
  const pool = getPool(device);
  if (background || pool.lost) return false;
  while (
    pool.entries.length >= MAX_IDLE_SETS ||
    pool.bytes + bytes > MAX_IDLE_BYTES
  ) {
    const oldest = pool.entries.shift();
    if (!oldest) break;
    pool.bytes -= oldest.bytes;
    oldest.destroy();
  }
  pool.entries.push({ key, resources, bytes, destroy });
  pool.bytes += bytes;
  return true;
};
