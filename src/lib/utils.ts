import { format, startOfWeek, addDays, getDay, isBefore } from 'date-fns';
import { ja } from 'date-fns/locale';
import { SlotAllocation, Surgery, WeeklySlot, ReleasedSlot, PERIOD_HOURS, Period } from './types';

// 土日は今週の手術が終わっているため、翌週を「今週」として扱う
export function getOperatingWeekStart(base: Date = new Date()): Date {
  const day = base.getDay();
  return startOfWeek(day === 0 || day === 6 ? addDays(base, 2) : base, { weekStartsOn: 1 });
}

export function getWeekDates(baseDate: Date): Date[] {
  const monday = startOfWeek(baseDate, { weekStartsOn: 1 });
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i)); // Mon-Sat
}

export function toTimeMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function allocationStartHHMM(alloc: SlotAllocation): string {
  return `${String(alloc.startHour).padStart(2, '0')}:${String(alloc.startMin ?? 0).padStart(2, '0')}`;
}

export function allocationEndHHMM(alloc: SlotAllocation): string {
  return `${String(alloc.endHour).padStart(2, '0')}:${String(alloc.endMin ?? 0).padStart(2, '0')}`;
}

export function allocationTotalMinutes(alloc: SlotAllocation): number {
  const start = alloc.startHour * 60 + (alloc.startMin ?? 0);
  const end = alloc.endHour * 60 + (alloc.endMin ?? 0);
  return Math.max(0, end - start);
}

export function calcUsedMinutes(surgeries: Surgery[]): number {
  return surgeries
    .filter(s => s.status !== 'cancelled')
    .reduce((sum, s) => {
      const start = toTimeMinutes(s.startTime);
      const end = toTimeMinutes(s.endTime);
      return sum + Math.max(0, end - start);
    }, 0);
}

// 申請締め切り: 翌週の空き枠に対する希望申請は「前週金曜 正午」まで
export function getRequestDeadline(targetDate: Date): Date {
  const targetWeekMonday = startOfWeek(targetDate, { weekStartsOn: 1 });
  const deadline = addDays(targetWeekMonday, -3); // 前週金曜
  deadline.setHours(12, 0, 0, 0);
  return deadline;
}

export function isDeadlinePassed(targetDate: Date): boolean {
  return isBefore(getRequestDeadline(targetDate), new Date());
}

export function isRequestOpen(targetDate: Date): boolean {
  const today = new Date();
  const targetWeekMonday = startOfWeek(targetDate, { weekStartsOn: 1 });
  const scheduleFixed = addDays(targetWeekMonday, -5); // 前週水曜（予定確定日）
  scheduleFixed.setHours(18, 0, 0, 0);
  const deadline = getRequestDeadline(targetDate);
  return isBefore(scheduleFixed, today) && isBefore(today, deadline);
}

export function buildWeeklySlots(
  allocations: SlotAllocation[],
  surgeries: Surgery[],
  weekDates: Date[],
  releasedSlots: ReleasedSlot[] = [],
): WeeklySlot[] {
  const slots: WeeklySlot[] = [];

  for (const date of weekDates) {
    const dow = getDay(date) === 0 ? 7 : getDay(date);
    const dateStr = format(date, 'yyyy-MM-dd');

    const dayAllocs = allocations.filter(a => a.dayOfWeek === dow);
    for (const alloc of dayAllocs) {
      const daySurgeries = surgeries.filter(s => {
        if (s.date !== dateStr || s.roomId !== alloc.roomId) return false;
        // 同じ時間帯の手術のみカウント（AM/PM の分離）
        const surgStart = toTimeMinutes(s.startTime);
        const allocStart = alloc.startHour * 60 + (alloc.startMin ?? 0);
        const allocEnd = alloc.endHour * 60 + (alloc.endMin ?? 0);
        return surgStart >= allocStart && surgStart < allocEnd;
      });
      const allocatedMinutes = allocationTotalMinutes(alloc);
      const usedMinutes = calcUsedMinutes(daySurgeries);
      const rate = allocatedMinutes > 0 ? Math.round((usedMinutes / allocatedMinutes) * 100) : 0;
      const released = releasedSlots.find(r => r.allocationId === alloc.id && r.date === dateStr);

      slots.push({
        allocation: alloc,
        surgeries: daySurgeries,
        date: dateStr,
        allocatedMinutes,
        usedMinutes,
        utilizationRate: rate,
        isDeadlinePassed: isDeadlinePassed(date),
        isEmpty: daySurgeries.filter(s => s.status !== 'cancelled').length === 0,
        releasedSlot: released,
      });
    }
  }

  return slots;
}

export function formatDate(date: Date): string {
  return format(date, 'M/d(E)', { locale: ja });
}

export function getDeptBgStyle(color: string): string {
  const map: Record<string, string> = {
    'bg-blue-500':   '#3b82f6',
    'bg-green-500':  '#22c55e',
    'bg-red-500':    '#ef4444',
    'bg-purple-500': '#a855f7',
    'bg-yellow-500': '#eab308',
    'bg-pink-500':   '#ec4899',
    'bg-indigo-500': '#6366f1',
    'bg-teal-500':   '#14b8a6',
  };
  return map[color] ?? '#6b7280';
}

export function getUtilizationColor(rate: number, isEmpty: boolean, isDeadlinePassed: boolean, isReleased: boolean): string {
  if (isReleased && isEmpty) return 'bg-purple-50 border-purple-300';
  if (isEmpty && isDeadlinePassed) return 'bg-red-50 border-red-300';
  if (isEmpty) return 'bg-orange-50 border-orange-200';
  if (rate >= 80) return 'bg-green-50 border-green-200';
  if (rate >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-orange-50 border-orange-200';
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getPeriodDefaultStart(period: Period): string {
  const p = PERIOD_HOURS[period];
  return `${String(p.startHour).padStart(2, '0')}:${String(p.startMin).padStart(2, '0')}`;
}

export function getPeriodDefaultEnd(period: Period): string {
  const p = PERIOD_HOURS[period];
  return `${String(p.endHour).padStart(2, '0')}:${String(p.endMin).padStart(2, '0')}`;
}
