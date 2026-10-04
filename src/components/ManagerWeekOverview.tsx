'use client';

import { useState } from 'react';
import { format, addWeeks, getDay } from 'date-fns';
import { ja } from 'date-fns/locale';
import { SlotAllocation, Surgery, ReleasedSlot, SlotRequest, Department, OperatingRoom, PERIOD_HOURS, Period, getPeriodLabel } from '@/lib/types';
import { getWeekDates, getOperatingWeekStart, getActiveRecruitWeek, toTimeMinutes, minutesToHHMM, getDeptBgStyle } from '@/lib/utils';

interface Props {
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots: ReleasedSlot[];
  slotRequests: SlotRequest[];
  departments: Department[];
  rooms: OperatingRoom[];
  onOpenBoard?: () => void;
  freeCutoffMinutes?: number; // この時間以上の空きを「一部空き」とみなす（運用設定）
}

type BandStatus = 'unassigned' | 'unused' | 'partial' | 'full' | 'released' | 'pending' | 'moved';

interface Band {
  period: Exclude<Period, 'full'>;
  status: BandStatus;
  alloc?: SlotAllocation;
  freeRanges: Array<[number, number]>;
  freeMinutes: number;
  release?: ReleasedSlot;
  pendingDeptNames: string[];
}

const WEEK_OPTIONS = [
  { offset: 0, label: '今週' },
  { offset: 1, label: '来週' },
  { offset: 2, label: '再来週' },
];

const AM_ENTRY_MINUTES = 8 * 60 + 45; // 午前の入室開始（8:45）より前は準備時間

const STATUS_STYLE: Record<BandStatus, { box: string; badge: string; label: string }> = {
  unassigned: { box: 'border-dashed border-gray-300 bg-gray-50', badge: 'bg-gray-200 text-gray-700', label: '担当なし' },
  unused:     { box: 'border-orange-300 bg-orange-50', badge: 'bg-orange-500 text-white', label: '空き' },
  partial:    { box: 'border-yellow-300 bg-yellow-50', badge: 'bg-yellow-400 text-yellow-900', label: '一部空き' },
  full:       { box: 'border-green-200 bg-green-50', badge: 'bg-green-100 text-green-700', label: '予定あり' },
  released:   { box: 'border-purple-300 bg-purple-50', badge: 'bg-purple-600 text-white', label: '募集中' },
  pending:    { box: 'border-amber-300 bg-amber-50', badge: 'bg-amber-500 text-white', label: '申請あり' },
  moved:      { box: 'border-blue-200 bg-blue-50', badge: 'bg-blue-100 text-blue-700', label: '他科へ移動' },
};

function subtractRanges(window: [number, number], busy: Array<[number, number]>, minFree: number): Array<[number, number]> {
  const sorted = [...busy].sort((a, b) => a[0] - b[0]);
  const free: Array<[number, number]> = [];
  let cursor = window[0];
  for (const [s, e] of sorted) {
    const start = Math.max(s, window[0]);
    const end = Math.min(e, window[1]);
    if (end <= cursor) continue;
    if (start > cursor) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < window[1]) free.push([cursor, window[1]]);
  return free.filter(([s, e]) => e - s >= minFree);
}

export default function ManagerWeekOverview({ allocations, surgeries, releasedSlots, slotRequests, departments, rooms, onOpenBoard, freeCutoffMinutes = 60 }: Props) {
  // 募集期間（木曜午後〜金曜）は来週を最初に表示
  const [weekOffset, setWeekOffset] = useState(() => (getActiveRecruitWeek() ? 1 : 0));
  const weekDates = getWeekDates(addWeeks(getOperatingWeekStart(), weekOffset));

  function buildBand(roomId: string, date: Date, period: Exclude<Period, 'full'>): Band {
    const dow = getDay(date) === 0 ? 7 : getDay(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    const hours = PERIOD_HOURS[period];
    const bandWindow: [number, number] = [
      Math.max(hours.startHour * 60 + hours.startMin, period === 'am' ? AM_ENTRY_MINUTES : 0),
      hours.endHour * 60 + hours.endMin,
    ];

    const alloc = allocations.find(a => a.roomId === roomId && a.dayOfWeek === dow && (a.period === period || a.period === 'full'));
    const window: [number, number] = alloc
      ? [
          Math.max(bandWindow[0], alloc.startHour * 60 + (alloc.startMin ?? 0)),
          Math.min(bandWindow[1], alloc.endHour * 60 + (alloc.endMin ?? 0)),
        ]
      : bandWindow;

    const busy = surgeries
      .filter(s => s.date === dateStr && s.roomId === roomId && s.status !== 'cancelled')
      .map(s => [toTimeMinutes(s.startTime), toTimeMinutes(s.endTime)] as [number, number]);
    const freeRanges = subtractRanges(window, busy, freeCutoffMinutes);
    const hasSurgery = busy.some(([s, e]) => e > window[0] && s < window[1]);
    const freeMinutes = freeRanges.reduce((sum, [s, e]) => sum + (e - s), 0);

    if (!alloc) {
      return { period, status: 'unassigned', freeRanges, freeMinutes, pendingDeptNames: [] };
    }

    const release = releasedSlots.find(r => r.allocationId === alloc.id && r.date === dateStr);
    const pendingDeptNames = release
      ? slotRequests.filter(r => r.releaseId === release.id && r.status === 'pending').map(r => r.requestingDeptName)
      : [];

    let status: BandStatus;
    if (release?.claimedByDeptId) status = 'moved';
    else if (release && pendingDeptNames.length > 0) status = 'pending';
    else if (release) status = 'released';
    else if (!hasSurgery) status = 'unused'; // 予定が1件も入っていない
    else if (freeMinutes > 0) status = 'partial';
    else status = 'full';

    return { period, status, alloc, freeRanges, freeMinutes, release, pendingDeptNames };
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const grid = rooms.map(room => ({
    room,
    days: weekDates.map(date => ({
      date,
      isPast: format(date, 'yyyy-MM-dd') < todayStr,
      bands: (['am', 'pm'] as const).map(period => buildBand(room.id, date, period)),
    })),
  }));

  // 集計は今日以降のみ（過去の空きは対応できないため）
  const allBands = grid.flatMap(r => r.days.filter(d => !d.isPast).flatMap(d => d.bands));
  const toHours = (bands: Band[]) => Math.round((bands.reduce((sum, b) => sum + b.freeMinutes, 0) / 60) * 10) / 10;
  const allocatedFreeHours = toHours(allBands.filter(b => b.alloc && b.status !== 'full' && b.status !== 'moved'));
  const unassignedHours = toHours(allBands.filter(b => b.status === 'unassigned'));
  const countOf = (status: BandStatus) => allBands.filter(b => b.status === status).length;

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600">空き状況</p>
          <h3 className="text-lg font-bold text-gray-900 mt-0.5">
            {format(weekDates[0], 'M/d', { locale: ja })}〜{format(weekDates[weekDates.length - 1], 'M/d', { locale: ja })} の手術室・時間帯別の空き
          </h3>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {WEEK_OPTIONS.map(opt => (
            <button
              key={opt.offset}
              type="button"
              onClick={() => setWeekOffset(opt.offset)}
              className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${weekOffset === opt.offset ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5">
          <div className="text-[10px] font-bold text-blue-600">保有枠の空き時間</div>
          <div className="text-lg font-bold text-blue-700">{allocatedFreeHours}h</div>
          <div className="text-[10px] text-gray-400">担当科なしの部屋 {unassignedHours}h は別</div>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-2.5">
          <div className="text-[10px] font-bold text-orange-600">まるごと空いている枠</div>
          <div className="text-lg font-bold text-orange-700">{countOf('unused')}</div>
        </div>
        <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-2.5">
          <div className="text-[10px] font-bold text-yellow-700">一部空き</div>
          <div className="text-lg font-bold text-yellow-700">{countOf('partial')}</div>
        </div>
        <div className="rounded-xl border border-purple-100 bg-purple-50 p-2.5">
          <div className="text-[10px] font-bold text-purple-600">他科に募集中</div>
          <div className="text-lg font-bold text-purple-700">{countOf('released')}</div>
        </div>
        <button
          type="button"
          onClick={onOpenBoard}
          className="text-left rounded-xl border border-amber-200 bg-amber-50 p-2.5 hover:bg-amber-100 transition-colors"
        >
          <div className="text-[10px] font-bold text-amber-600">申請あり（承認待ち）</div>
          <div className="text-lg font-bold text-amber-700">{countOf('pending')}</div>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 border-b border-r border-gray-200 w-20">手術室</th>
              {weekDates.map(date => {
                const past = format(date, 'yyyy-MM-dd') < todayStr;
                return (
                  <th key={date.toISOString()} className={`px-2 py-2 text-center font-bold border-b border-r border-gray-200 min-w-36 ${past ? 'bg-gray-100 text-gray-400' : getDay(date) === 6 ? 'bg-blue-50/50 text-gray-800' : 'bg-gray-50 text-gray-800'}`}>
                    {format(date, 'M/d(E)', { locale: ja })}{past && <span className="ml-1 text-[10px] font-medium">終了</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.map(({ room, days }) => (
              <tr key={room.id}>
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-gray-700 border-b border-r border-gray-200 whitespace-nowrap">{room.name}</td>
                {days.map(({ date, bands, isPast }) => (
                  <td key={date.toISOString()} className={`p-1.5 border-b border-r border-gray-100 align-top ${isPast ? 'opacity-40' : ''}`}>
                    <div className="space-y-1">
                      {bands.every(b => b.status === 'unassigned') ? (
                        <div className="rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-[11px] text-gray-400">
                          担当科なし（終日空き）
                        </div>
                      ) : bands.map(band => {
                        const style = STATUS_STYLE[band.status];
                        const dept = departments.find(d => d.id === band.alloc?.deptId);
                        return (
                          <div key={band.period} className={`rounded-lg border px-2 py-1.5 ${style.box}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1 min-w-0">
                                <span className="text-[10px] font-bold text-gray-500">{getPeriodLabel(band.period)}</span>
                                {dept && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getDeptBgStyle(dept.color) }} />}
                                <span className="truncate font-bold text-gray-700">{band.alloc?.deptName ?? '—'}</span>
                              </span>
                              <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>{style.label}</span>
                            </div>
                            {band.status === 'unassigned' ? null : band.status === 'moved' ? (
                              <div className="mt-0.5 text-[11px] text-blue-700">→ {band.release?.claimedByDeptName}</div>
                            ) : band.status === 'full' ? null : band.freeRanges.length > 0 ? (
                              <div className="mt-0.5 font-mono text-[11px] text-gray-700">
                                {band.freeRanges.map(([s, e]) => `${minutesToHHMM(s)}–${minutesToHHMM(e)}`).join(', ')}
                              </div>
                            ) : null}
                            {band.status === 'pending' && (
                              <div className="mt-0.5 text-[10px] text-amber-700">申請: {band.pendingDeptNames.join('、')}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-2.5 border-t border-gray-100 flex flex-wrap gap-2 text-[10px] text-gray-500">
        {(Object.keys(STATUS_STYLE) as BandStatus[]).map(status => (
          <span key={status} className="flex items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS_STYLE[status].badge}`}>{STATUS_STYLE[status].label}</span>
          </span>
        ))}
        <span className="ml-auto">「一部空き」は予定のない時間が{freeCutoffMinutes / 60}時間以上ある枠（集計タブで変更可）</span>
      </div>
    </section>
  );
}
