import { Department, OperatingRoom, SlotAllocation, Surgery, ReleasedSlot, SlotRequest } from './types';
import { buildDemoDataset } from './demoData';

const SCHEMA_VERSION = '6'; // 型変更・デモデータ更新のたびにインクリメント
const VERSION_KEY = 'or_schema_version';

const KEYS = {
  departments: 'or_departments',
  rooms: 'or_rooms',
  allocations: 'or_allocations',
  surgeries: 'or_surgeries',
  releasedSlots: 'or_released_slots',
  slotRequests: 'or_slot_requests',
};

// ページ側（page.tsx / eventLog.ts）が直接扱うキー
const ABSENCES_KEY = 'or_absences';
const EVENT_LOG_KEY = 'or_event_log';
const NOTIFICATIONS_KEY = 'or_dept_notifications';

// デモデータ一式を書き込む（初回・スキーマ更新時・「デモデータに戻す」）
export function writeDemoDataset() {
  if (typeof window === 'undefined') return;
  const demo = buildDemoDataset();
  localStorage.setItem(KEYS.departments, JSON.stringify(demo.departments));
  localStorage.setItem(KEYS.rooms, JSON.stringify(demo.rooms));
  localStorage.setItem(KEYS.allocations, JSON.stringify(demo.allocations));
  localStorage.setItem(KEYS.surgeries, JSON.stringify(demo.surgeries));
  localStorage.setItem(KEYS.releasedSlots, JSON.stringify(demo.releasedSlots));
  localStorage.setItem(KEYS.slotRequests, JSON.stringify(demo.slotRequests));
  localStorage.setItem(ABSENCES_KEY, JSON.stringify(demo.absences));
  localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(demo.events));
  localStorage.setItem(NOTIFICATIONS_KEY, '[]');
  localStorage.setItem(VERSION_KEY, SCHEMA_VERSION);
}

// スキーマバージョンが変わった場合はデモデータで初期化
function migrateIfNeeded() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(VERSION_KEY) !== SCHEMA_VERSION) {
    writeDemoDataset();
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
  getDepartments: (): Department[] => load<Department[]>(KEYS.departments, []),
  saveDepartments: (d: Department[]) => save(KEYS.departments, d),

  getRooms: (): OperatingRoom[] => load<OperatingRoom[]>(KEYS.rooms, []),
  saveRooms: (r: OperatingRoom[]) => save(KEYS.rooms, r),

  getAllocations: (): SlotAllocation[] => load<SlotAllocation[]>(KEYS.allocations, []),
  saveAllocations: (a: SlotAllocation[]) => save(KEYS.allocations, a),

  getSurgeries: (): Surgery[] => load<Surgery[]>(KEYS.surgeries, []),
  saveSurgeries: (s: Surgery[]) => save(KEYS.surgeries, s),

  getReleasedSlots: (): ReleasedSlot[] => load(KEYS.releasedSlots, []),
  saveReleasedSlots: (r: ReleasedSlot[]) => save(KEYS.releasedSlots, r),

  getSlotRequests: (): SlotRequest[] => load(KEYS.slotRequests, []),
  saveSlotRequests: (r: SlotRequest[]) => save(KEYS.slotRequests, r),
};
