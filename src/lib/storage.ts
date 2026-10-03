import { Department, OperatingRoom, SlotAllocation, Surgery, ReleasedSlot, SlotRequest } from './types';
import { DEFAULT_DEPARTMENTS, DEFAULT_ROOMS, DEFAULT_ALLOCATIONS, getDemoSurgeries } from './initialData';

const SCHEMA_VERSION = '5'; // 型変更のたびにインクリメント
const VERSION_KEY = 'or_schema_version';

const KEYS = {
  departments: 'or_departments',
  rooms: 'or_rooms',
  allocations: 'or_allocations',
  surgeries: 'or_surgeries',
  releasedSlots: 'or_released_slots',
  slotRequests: 'or_slot_requests',
};

// スキーマバージョンが変わった場合は全データリセット
function migrateIfNeeded() {
  if (typeof window === 'undefined') return;
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== SCHEMA_VERSION) {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    localStorage.setItem(VERSION_KEY, SCHEMA_VERSION);
  }
}

function load<T>(key: string, defaults: T): T {
  if (typeof window === 'undefined') return defaults;
  migrateIfNeeded();
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaults;
  } catch {
    return defaults;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

export const storage = {
  getDepartments: (): Department[] => load(KEYS.departments, DEFAULT_DEPARTMENTS),
  saveDepartments: (d: Department[]) => save(KEYS.departments, d),

  getRooms: (): OperatingRoom[] => load(KEYS.rooms, DEFAULT_ROOMS),
  saveRooms: (r: OperatingRoom[]) => save(KEYS.rooms, r),

  getAllocations: (): SlotAllocation[] => load(KEYS.allocations, DEFAULT_ALLOCATIONS),
  saveAllocations: (a: SlotAllocation[]) => save(KEYS.allocations, a),

  getSurgeries: (): Surgery[] => load(KEYS.surgeries, getDemoSurgeries()),
  saveSurgeries: (s: Surgery[]) => save(KEYS.surgeries, s),

  getReleasedSlots: (): ReleasedSlot[] => load(KEYS.releasedSlots, []),
  saveReleasedSlots: (r: ReleasedSlot[]) => save(KEYS.releasedSlots, r),

  getSlotRequests: (): SlotRequest[] => load(KEYS.slotRequests, []),
  saveSlotRequests: (r: SlotRequest[]) => save(KEYS.slotRequests, r),
};
