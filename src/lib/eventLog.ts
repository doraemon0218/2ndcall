// 分析用イベントログ
// 画面に表示しない操作履歴も含めて追記専用で蓄積する（取消・却下されたデータも残す）。
// スキーマ移行（storage.ts）でリセットされないよう、独立したキーで保存する。

export type EventType =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'dept_switch'
  | 'dept_switch_failed'
  | 'slot_released'
  | 'release_cancelled'
  | 'request_submitted'
  | 'request_approved'
  | 'request_rejected'
  | 'request_cancelled'
  | 'slot_assigned'
  | 'surgery_added'
  | 'surgery_updated'
  | 'surgery_deleted'
  | 'allocations_updated'
  | 'absence_registered'
  | 'absence_deleted';

export const EVENT_LABELS: Record<EventType, string> = {
  login: 'ログイン',
  logout: 'ログアウト',
  login_failed: 'ログイン失敗',
  dept_switch: '診療科切替',
  dept_switch_failed: '診療科切替失敗',
  slot_released: '枠を共有',
  release_cancelled: '共有を取消',
  request_submitted: '引き受け申請',
  request_approved: '申請を承認',
  request_rejected: '申請を却下',
  request_cancelled: '申請を取消',
  slot_assigned: '管理者が割当',
  surgery_added: '手術を登録',
  surgery_updated: '手術を更新',
  surgery_deleted: '手術を削除',
  allocations_updated: '枠マスタ更新',
  absence_registered: '不在を登録',
  absence_deleted: '不在を削除',
};

export interface Actor {
  role: 'manager' | 'dept' | 'unknown';
  deptId?: string;
  deptName?: string;
}

export interface AppEvent {
  id: string;
  type: EventType;
  at: string; // ISO
  actor: Actor;
  data: Record<string, string | number | boolean | null | undefined>;
}

const LOG_KEY = 'or_event_log';
const MAX_EVENTS = 20000;

let currentActor: Actor = { role: 'unknown' };

export function setActor(actor: Actor) {
  currentActor = actor;
}

export function getEvents(): AppEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as AppEvent[]) : [];
  } catch {
    return [];
  }
}

export function logEvent(type: EventType, data: AppEvent['data'] = {}) {
  if (typeof window === 'undefined') return;
  const event: AppEvent = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type,
    at: new Date().toISOString(),
    actor: { ...currentActor },
    data,
  };
  try {
    const events = getEvents();
    events.push(event);
    localStorage.setItem(LOG_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // 容量超過などで保存できなくてもアプリ操作は止めない
  }
  window.dispatchEvent(new CustomEvent('or-event-logged'));
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function eventsToCsv(events: AppEvent[]): string {
  const dataKeys = Array.from(new Set(events.flatMap(e => Object.keys(e.data)))).sort();
  const header = ['日時', 'イベント', 'イベント種別', '立場', '診療科', ...dataKeys];
  const rows = events.map(e => [
    e.at,
    EVENT_LABELS[e.type] ?? e.type,
    e.type,
    e.actor.role === 'manager' ? '手術室管理者' : e.actor.role === 'dept' ? '診療科部長' : '',
    e.actor.deptName ?? '',
    ...dataKeys.map(k => e.data[k]),
  ]);
  return '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}
