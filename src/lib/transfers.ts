// 枠の移譲（どの科 → どの科）と、移った枠の稼働を集計する
import { Department, ReleasedSlot, SlotAllocation, Surgery } from './types';
import { toTimeMinutes } from './utils';

const AM_ENTRY_MINUTES = 8 * 60 + 45;

export interface TransferRow {
  release: ReleasedSlot;
  date: string;
  roomId: string;
  period: ReleasedSlot['period'];
  fromDeptName: string;
  toDeptId: string;
  toDeptName: string;
  windowStart: number; // 分
  windowEnd: number;
  slotMinutes: number;
  usedMinutes: number;  // 使った科の手術が枠内に占める時間
  caseCount: number;
  rate: number;         // usedMinutes / slotMinutes（%）
  status: 'done' | 'planned' | 'unused'; // 実施済 / 予定あり / 手術なし
}

export function computeTransfers(
  releasedSlots: ReleasedSlot[],
  surgeries: Surgery[],
  allocations: SlotAllocation[],
  todayStr: string,
): TransferRow[] {
  return releasedSlots
    .filter(r => r.claimedByDeptId)
    .map(r => {
      const alloc = allocations.find(a => a.id === r.allocationId);
      // 午前は入室開始の 8:45 から数える（空きの定義と同じ）
      const rawStart = alloc ? alloc.startHour * 60 + (alloc.startMin ?? 0) : r.startHour * 60;
      const windowStart = r.period === 'am' ? Math.max(rawStart, AM_ENTRY_MINUTES) : rawStart;
      const windowEnd = alloc ? alloc.endHour * 60 + (alloc.endMin ?? 0) : r.endHour * 60;
      const slotMinutes = Math.max(1, windowEnd - windowStart);
      const cases = surgeries.filter(s =>
        s.date === r.date && s.roomId === r.roomId && s.deptId === r.claimedByDeptId && s.status !== 'cancelled' &&
        toTimeMinutes(s.endTime) > windowStart && toTimeMinutes(s.startTime) < windowEnd,
      );
      const usedMinutes = cases.reduce((sum, s) =>
        sum + Math.max(0, Math.min(toTimeMinutes(s.endTime), windowEnd) - Math.max(toTimeMinutes(s.startTime), windowStart)), 0);
      const status: TransferRow['status'] = cases.length === 0 ? 'unused' : r.date < todayStr ? 'done' : 'planned';
      return {
        release: r,
        date: r.date,
        roomId: r.roomId,
        period: r.period,
        fromDeptName: r.ownerDeptName,
        toDeptId: r.claimedByDeptId!,
        toDeptName: r.claimedByDeptName ?? '',
        windowStart,
        windowEnd,
        slotMinutes,
        usedMinutes,
        caseCount: cases.length,
        rate: Math.round((usedMinutes / slotMinutes) * 100),
        status,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.roomId.localeCompare(b.roomId, undefined, { numeric: true }));
}

export interface TransferByDept {
  dept: Department;
  received: number;
  given: number;
  slotMinutes: number;
  usedMinutes: number;
  rate: number | null;
}

export function summarizeByDept(rows: TransferRow[], departments: Department[]): TransferByDept[] {
  return departments
    .map(dept => {
      const recv = rows.filter(r => r.toDeptId === dept.id);
      const slotMinutes = recv.reduce((s, r) => s + r.slotMinutes, 0);
      const usedMinutes = recv.reduce((s, r) => s + r.usedMinutes, 0);
      return {
        dept,
        received: recv.length,
        given: rows.filter(r => r.release.ownerDeptId === dept.id).length,
        slotMinutes,
        usedMinutes,
        rate: slotMinutes > 0 ? Math.round((usedMinutes / slotMinutes) * 100) : null,
      };
    })
    .filter(d => d.received > 0 || d.given > 0)
    .sort((a, b) => b.received - a.received || b.usedMinutes - a.usedMinutes);
}
