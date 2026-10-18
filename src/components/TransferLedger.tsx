'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Department, ReleasedSlot, SlotAllocation, Surgery, getPeriodLabel } from '@/lib/types';
import { getDeptBgStyle, minutesToHHMM } from '@/lib/utils';
import { computeTransfers, summarizeByDept, TransferRow, TransferByDept } from '@/lib/transfers';
import TransferActualForm, { ActualEntry } from './TransferActualForm';

interface Props {
  departments: Department[];
  releasedSlots: ReleasedSlot[];
  surgeries: Surgery[];
  allocations: SlotAllocation[];
  onRecordActuals: (releaseId: string, entries: ActualEntry[]) => void;
}

type Range = 'past' | 'future' | 'all';
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'past', label: 'これまで（終了分）' },
  { value: 'future', label: 'これから（予定）' },
  { value: 'all', label: 'すべて' },
];

const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}時間`;
const STATUS_LABEL = { recorded: '実績', awaiting: '実績未入力', planned: '予定', unused: '手術なし' } as const;

function rateTone(rate: number): string {
  if (rate >= 80) return '#1B3A5C';
  if (rate >= 50) return '#5B7896';
  return '#C2610F';
}

function RateBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: rateTone(rate) }} />
      </div>
      <span className="w-12 text-right font-bold" style={{ color: rateTone(rate) }}>{rate}%</span>
    </div>
  );
}

function download(rows: TransferRow[]) {
  const header = ['手術日', '手術室', '時間帯', '譲った科', '使った科', '枠の時間(分)', '使った時間(分)', '手術件数', '稼働率(%)', '終了超過(分)', '状態'];
  const lines = rows.map(r => [
    r.date, `手術室${r.roomId.replace('or', '')}`, getPeriodLabel(r.period), r.fromDeptName, r.toDeptName,
    r.slotMinutes, r.usedMinutes, r.caseCount, r.rate, r.overrunMinutes, STATUS_LABEL[r.status],
  ].join(','));
  const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `枠の移譲_${format(new Date(), 'yyyyMMdd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// 中央（手術室管理者）向け：どの科からどの科へ枠が移り、その枠がどれだけ使われたか
export default function TransferLedger({ departments, releasedSlots, surgeries, allocations, onRecordActuals }: Props) {
  const [range, setRange] = useState<Range>('past');
  const [editing, setEditing] = useState<string | null>(null);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const all = computeTransfers(releasedSlots, surgeries, allocations, todayStr);
  const rows = all.filter(r => range === 'all' || (range === 'past' ? r.date <= todayStr : r.date > todayStr));
  const byDept = summarizeByDept(rows, departments);
  const givers = byDept.filter(d => d.given > 0).sort((a, b) => b.givenUsedMinutes - a.givenUsedMinutes);
  const receivers = byDept.filter(d => d.received > 0);
  const awaiting = rows.filter(r => r.status === 'awaiting').length;

  const slotMinutes = rows.reduce((s, r) => s + r.slotMinutes, 0);
  const usedMinutes = rows.reduce((s, r) => s + r.usedMinutes, 0);
  const avgRate = slotMinutes > 0 ? Math.round((usedMinutes / slotMinutes) * 100) : null;
  const overrunRows = rows.filter(r => r.overrunMinutes > 0);
  const deptColor = (id: string) => getDeptBgStyle(departments.find(d => d.id === id)?.color ?? '');
  const dot = (d: Department) => <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: getDeptBgStyle(d.color) }} />;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">🔁 枠の移譲の実績</h2>
            <p className="text-sm text-gray-500 mt-0.5">どの科の枠がどの科に移り、その枠がどれだけ使われたか</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
              {RANGES.map(r => (
                <button key={r.value} type="button" onClick={() => setRange(r.value)}
                  className={`px-3 py-1.5 text-sm font-bold rounded-md ${range === r.value ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => download(rows)} disabled={rows.length === 0}
              className="px-3 py-2 text-sm font-bold text-white bg-[#1B3A5C] hover:opacity-90 disabled:opacity-40 rounded-lg">
              CSVで書き出し
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm font-bold text-gray-500">移譲された枠</div>
            <div className="text-3xl font-bold text-[#1B3A5C]">{rows.length}<span className="text-base ml-1">件</span></div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm font-bold text-gray-500">移譲された時間</div>
            <div className="text-3xl font-bold text-[#1B3A5C]">{hours(slotMinutes)}</div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm font-bold text-gray-500">実際に使った時間</div>
            <div className="text-3xl font-bold text-[#1B3A5C]">{hours(usedMinutes)}</div>
          </div>
          <div className="rounded-xl bg-[#FDF3EA] p-4">
            <div className="text-sm font-bold text-[#C2610F]">移譲枠の稼働率</div>
            <div className="text-3xl font-bold text-[#C2610F]">{avgRate === null ? '—' : `${avgRate}%`}</div>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="text-sm font-bold text-gray-500">終了時刻を超えた</div>
            <div className="text-3xl font-bold text-[#1B3A5C]">{overrunRows.length}<span className="text-base ml-1">件</span></div>
            <div className="text-xs text-gray-500">計 {overrunRows.reduce((s, r) => s + r.overrunMinutes, 0)}分</div>
          </div>
        </div>
        {awaiting > 0 && (
          <p className="mt-3 rounded-lg bg-[#FDF3EA] px-3 py-2 text-sm font-bold text-[#C2610F]">
            📝 終了したのに実績が未入力の移譲枠が {awaiting}件 あります（下の一覧の「実績を入力」から）
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <DeptTable
          title="🤝 枠を譲った科（貢献）"
          note="譲った枠が、他の科にどれだけ使われたか"
          rows={givers}
          dot={dot}
          cells={d => [String(d.given), `${hours(d.givenUsedMinutes)} / ${hours(d.givenMinutes)}`]}
          heads={['譲った枠', '使われた時間 / 譲った時間']}
          rate={d => d.givenRate}
        />
        <DeptTable
          title="🏥 枠を使った科"
          note="受けた枠でどれだけ手術をしたか・終了時刻を超えたか"
          rows={receivers}
          dot={dot}
          cells={d => [String(d.received), `${hours(d.usedMinutes)} / ${hours(d.slotMinutes)}`, d.overrunCount ? `${d.overrunCount}回・${d.overrunMinutes}分` : '—']}
          heads={['使った枠', '使った時間 / 受けた時間', '超過']}
          rate={d => d.rate}
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm overflow-x-auto">
        <h3 className="text-base font-bold text-gray-900 mb-3">移譲の一覧（{rows.length}件）</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">この期間に移譲された枠はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 font-bold">日付</th>
                <th className="py-2 font-bold">部屋・時間帯</th>
                <th className="py-2 font-bold">譲った科 → 使った科</th>
                <th className="py-2 font-bold text-right">手術</th>
                <th className="py-2 font-bold text-right">使った時間</th>
                <th className="py-2 font-bold pl-4 w-1/4">稼働率</th>
                <th className="py-2 font-bold text-right">実績</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <FragmentRow key={r.release.id} r={r} todayStr={todayStr} deptColor={deptColor}
                  editing={editing === r.release.id}
                  onEdit={() => setEditing(r.release.id)}
                  onCancel={() => setEditing(null)}
                  onSave={(id, entries) => { onRecordActuals(id, entries); setEditing(null); }} />
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">稼働率 = 使った科の手術が枠の時間に占める割合（午前は8:45から）。実績を入力した枠は実績で、未入力の枠は予定で計算します。</p>
      </section>
    </div>
  );
}

function DeptTable({ title, note, rows, dot, cells, heads, rate }: {
  title: string; note: string; rows: TransferByDept[]; dot: (d: Department) => React.ReactNode;
  cells: (d: TransferByDept) => string[]; heads: string[]; rate: (d: TransferByDept) => number | null;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm overflow-x-auto">
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-500 mb-3">{note}</p>
      {rows.length === 0 ? <p className="text-sm text-gray-500">記録はありません。</p> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 font-bold">診療科</th>
              {heads.map(h => <th key={h} className="py-2 font-bold text-right">{h}</th>)}
              <th className="py-2 font-bold pl-3 w-1/3">稼働率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.dept.id} className="border-b border-gray-50">
                <td className="py-2 font-bold text-gray-800 whitespace-nowrap">{dot(d.dept)}{d.dept.name}</td>
                {cells(d).map((c, i) => <td key={i} className="py-2 text-right font-mono whitespace-nowrap">{c}</td>)}
                <td className="py-2 pl-3"><RateBar rate={rate(d)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FragmentRow({ r, todayStr, deptColor, editing, onEdit, onCancel, onSave }: {
  r: TransferRow; todayStr: string; deptColor: (id: string) => string; editing: boolean;
  onEdit: () => void; onCancel: () => void; onSave: (id: string, entries: ActualEntry[]) => void;
}) {
  const ended = r.date <= todayStr;
  return (
    <>
      <tr className={`border-b border-gray-50 ${r.status === 'awaiting' ? 'bg-[#FDF3EA]/50' : ''}`}>
        <td className="py-2 whitespace-nowrap text-gray-700">{format(new Date(`${r.date}T00:00:00`), 'M/d(E)', { locale: ja })}</td>
        <td className="py-2 whitespace-nowrap text-gray-700">
          手術室{r.roomId.replace('or', '')}・{getPeriodLabel(r.period)}
          <span className="ml-1 text-xs text-gray-400">{minutesToHHMM(r.windowStart)}–{minutesToHHMM(r.windowEnd)}</span>
        </td>
        <td className="py-2">
          <span className="text-gray-500">{r.fromDeptName}</span>
          <span className="mx-1.5 text-gray-400">→</span>
          <span className="font-bold text-gray-900">
            <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: deptColor(r.toDeptId) }} />
            {r.toDeptName}
          </span>
        </td>
        <td className="py-2 text-right font-mono">{r.caseCount}件</td>
        <td className="py-2 text-right font-mono whitespace-nowrap">{hours(r.usedMinutes)} / {hours(r.slotMinutes)}</td>
        <td className="py-2 pl-4">
          {r.status === 'unused' && !r.release.actualRecordedAt && !ended ? (
            <span className="text-xs font-bold text-gray-500">まだ予定なし</span>
          ) : (
            <div>
              <RateBar rate={r.rate} />
              {r.overrunMinutes > 0 && <p className="text-xs font-bold text-[#C2610F] mt-0.5">⚠ 終了時刻を{r.overrunMinutes}分超過</p>}
            </div>
          )}
        </td>
        <td className="py-2 text-right whitespace-nowrap">
          {r.release.actualRecordedAt ? (
            <button type="button" onClick={onEdit} className="text-xs font-bold text-[#1B3A5C] underline">実績 ✓ 修正</button>
          ) : ended ? (
            <button type="button" onClick={onEdit} className="rounded-lg bg-[#C2610F] px-3 py-1.5 text-xs font-bold text-white">実績を入力</button>
          ) : (
            <span className="text-xs text-gray-400">予定</span>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} className="py-3">
            <TransferActualForm row={r} onSave={onSave} onCancel={onCancel} />
          </td>
        </tr>
      )}
    </>
  );
}
