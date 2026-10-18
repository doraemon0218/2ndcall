// 枠の移譲（どの科 → どの科）と、移った枠の稼働を集計する
import { Department, ReleasedSlot, SlotAllocation, Surgery } from './types';
import { toTimeMinutes } from './utils';

const AM_ENTRY_MINUTES = 8 * 60 + 45;

// 共有枠の使える時間帯（分）。午前は 8:45 から
export function getReleaseWindow(r: ReleasedSlot, allocations: SlotAllocation[]): { start: number; end: number } {
  const alloc = allocations.find(a => a.id === r.allocationId);
  const rawStart = r.availStartTime ? toTimeMinutes(r.availStartTime) : alloc ? alloc.startHour * 60 + (alloc.startMin ?? 0) : r.startHour * 60;
  const end = r.availEndTime ? toTimeMinutes(r.availEndTime) : alloc ? alloc.endHour * 60 + (alloc.endMin ?? 0) : r.endHour * 60;
  return { start: r.period === 'am' ? Math.max(rawStart, AM_ENTRY_MINUTES) : rawStart, end };
}

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
  status: 'recorded' | 'awaiting' | 'planned' | 'unused';
  // recorded = 実績入力済み（実績で計算） / awaiting = 終了したが実績未入力（予定で計算）
  // planned = これから（予定で計算） / unused = 手術なし
  cases: Surgery[];
  overrunMinutes: number; // 実績で枠の終了時刻を超えた分（スタッフ負担の指標）
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
      const recorded = !!r.actualRecordedAt;
      const startOf = (x: Surgery) => toTimeMinutes(recorded && x.actualStartTime ? x.actualStartTime : x.startTime);
      const endOf = (x: Surgery) => toTimeMinutes(recorded && x.actualEndTime ? x.actualEndTime : x.endTime);
      const cases = surgeries.filter(s =>
        s.date === r.date && s.roomId === r.roomId && s.deptId === r.claimedByDeptId && s.status !== 'cancelled' &&
        endOf(s) > windowStart && startOf(s) < windowEnd,
      );
      const usedMinutes = cases.reduce((sum, s) =>
        sum + Math.max(0, Math.min(endOf(s), windowEnd) - Math.max(startOf(s), windowStart)), 0);
      const status: TransferRow['status'] = recorded
        ? (cases.length === 0 ? 'unused' : 'recorded')
        : r.date <= todayStr ? 'awaiting' : cases.length === 0 ? 'unused' : 'planned';
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
        cases,
        overrunMinutes: recorded && cases.length
          ? Math.max(0, Math.max(...cases.map(c => endOf(c))) - windowEnd)
          : 0,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.roomId.localeCompare(b.roomId, undefined, { numeric: true }));
}

export interface TransferByDept {
  dept: Department;
  received: number;
  given: number;
  slotMinutes: number;        // 受けた枠の時間
  usedMinutes: number;        // 受けた枠で使った時間
  rate: number | null;        // 受けた枠の稼働率
  givenMinutes: number;       // 譲った枠の時間
  givenUsedMinutes: number;   // 譲った枠が他科に使われた時間
  givenRate: number | null;   // 譲った枠の稼働率（貢献の度合い）
  overrunCount: number;       // 受けた枠で終了時刻を超えた回数
  overrunMinutes: number;
}

export function summarizeByDept(rows: TransferRow[], departments: Department[]): TransferByDept[] {
  return departments
    .map(dept => {
      const recv = rows.filter(r => r.toDeptId === dept.id);
      const slotMinutes = recv.reduce((s, r) => s + r.slotMinutes, 0);
      const usedMinutes = recv.reduce((s, r) => s + r.usedMinutes, 0);
      const gave = rows.filter(r => r.release.ownerDeptId === dept.id);
      const givenMinutes = gave.reduce((s, r) => s + r.slotMinutes, 0);
      const givenUsedMinutes = gave.reduce((s, r) => s + r.usedMinutes, 0);
      return {
        dept,
        received: recv.length,
        given: gave.length,
        slotMinutes,
        usedMinutes,
        rate: slotMinutes > 0 ? Math.round((usedMinutes / slotMinutes) * 100) : null,
        givenMinutes,
        givenUsedMinutes,
        givenRate: givenMinutes > 0 ? Math.round((givenUsedMinutes / givenMinutes) * 100) : null,
        overrunCount: recv.filter(r => r.overrunMinutes > 0).length,
        overrunMinutes: recv.reduce((s, r) => s + r.overrunMinutes, 0),
      };
    })
    .filter(d => d.received > 0 || d.given > 0)
    .sort((a, b) => b.received - a.received || b.usedMinutes - a.usedMinutes);
}

// 実績入力が必要な移譲枠（終了済み・未入力）
export function needsActual(rows: TransferRow[], deptId?: string): TransferRow[] {
  return rows.filter(r => r.status === 'awaiting' && (!deptId || r.toDeptId === deptId));
}
