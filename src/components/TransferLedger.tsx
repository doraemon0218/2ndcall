'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Department, ReleasedSlot, SlotAllocation, Surgery, getPeriodLabel } from '@/lib/types';
import { getDeptBgStyle, minutesToHHMM } from '@/lib/utils';
import { computeTransfers, summarizeByDept, TransferRow } from '@/lib/transfers';

interface Props {
  departments: Department[];
  releasedSlots: ReleasedSlot[];
  surgeries: Surgery[];
  allocations: SlotAllocation[];
}

type Range = 'past' | 'future' | 'all';
const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'past', label: 'これまで（実施済み）' },
  { value: 'future', label: 'これから（予定）' },
  { value: 'all', label: 'すべて' },
];

const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}時間`;

function rateTone(rate: number): { bar: string; text: string } {
  if (rate >= 80) return { bar: '#1B3A5C', text: 'text-[#1B3A5C]' };
  if (rate >= 50) return { bar: '#5B7896', text: 'text-[#1B3A5C]' };
  return { bar: '#C2610F', text: 'text-[#C2610F]' };
}

function download(rows: TransferRow[]) {
  const header = ['手術日', '手術室', '時間帯', '元の科', '使った科', '枠の時間(分)', '使った時間(分)', '手術件数', '稼働率(%)', '状態'];
  const label = { done: '実施済み', planned: '予定あり', unused: '手術なし' } as const;
  const lines = rows.map(r => [
    r.date, `手術室${r.roomId.replace('or', '')}`, getPeriodLabel(r.period), r.fromDeptName, r.toDeptName,
    r.slotMinutes, r.usedMinutes, r.caseCount, r.rate, label[r.status],
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
export default function TransferLedger({ departments, releasedSlots, surgeries, allocations }: Props) {
  const [range, setRange] = useState<Range>('past');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const all = computeTransfers(releasedSlots, surgeries, allocations, todayStr);
  const rows = all.filter(r => range === 'all' || (range === 'past' ? r.date < todayStr : r.date >= todayStr));
  const byDept = summarizeByDept(rows, departments);

  const slotMinutes = rows.reduce((s, r) => s + r.slotMinutes, 0);
  const usedMinutes = rows.reduce((s, r) => s + r.usedMinutes, 0);
  const avgRate = slotMinutes > 0 ? Math.round((usedMinutes / slotMinutes) * 100) : null;
  const deptColor = (id: string) => getDeptBgStyle(departments.find(d => d.id === id)?.color ?? '');

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">🔁 枠の移譲の記録</h2>
            <p className="text-sm text-gray-500 mt-0.5">どの科の枠がどの科に移り、その枠がどれだけ使われたか</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
              {RANGES.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={`px-3 py-1.5 text-sm font-bold rounded-md ${range === r.value ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => download(rows)}
              disabled={rows.length === 0}
              className="px-3 py-2 text-sm font-bold text-white bg-[#1B3A5C] hover:opacity-90 disabled:opacity-40 rounded-lg"
            >
              CSVで書き出し
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        </div>
      </section>

      {byDept.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm overflow-x-auto">
          <h3 className="text-base font-bold text-gray-900 mb-3">診療科ごと</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 font-bold">診療科</th>
                <th className="py-2 font-bold text-right">譲った枠</th>
                <th className="py-2 font-bold text-right">使った枠</th>
                <th className="py-2 font-bold text-right">使った時間 / 受けた時間</th>
                <th className="py-2 font-bold pl-4 w-1/3">受けた枠の稼働率</th>
              </tr>
            </thead>
            <tbody>
              {byDept.map(d => (
                <tr key={d.dept.id} className="border-b border-gray-50">
                  <td className="py-2 font-bold text-gray-800">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: getDeptBgStyle(d.dept.color) }} />
                    {d.dept.name}
                  </td>
                  <td className="py-2 text-right font-mono">{d.given}</td>
                  <td className="py-2 text-right font-mono font-bold">{d.received}</td>
                  <td className="py-2 text-right font-mono">{d.received > 0 ? `${hours(d.usedMinutes)} / ${hours(d.slotMinutes)}` : '—'}</td>
                  <td className="py-2 pl-4">
                    {d.rate === null ? <span className="text-gray-400">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(d.rate, 100)}%`, backgroundColor: rateTone(d.rate).bar }} />
                        </div>
                        <span className={`w-12 text-right font-bold ${rateTone(d.rate).text}`}>{d.rate}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
                <th className="py-2 font-bold">元の科 → 使った科</th>
                <th className="py-2 font-bold text-right">手術</th>
                <th className="py-2 font-bold text-right">使った時間</th>
                <th className="py-2 font-bold pl-4 w-1/4">稼働率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.release.id} className="border-b border-gray-50">
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
                    {r.status === 'unused' ? (
                      <span className="text-xs font-bold text-[#C2610F]">{r.date < todayStr ? '使われず（0%）' : 'まだ予定なし'}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(r.rate, 100)}%`, backgroundColor: rateTone(r.rate).bar }} />
                        </div>
                        <span className={`w-12 text-right font-bold ${rateTone(r.rate).text}`}>{r.rate}%</span>
                        {r.status === 'planned' && <span className="text-[10px] text-gray-400">予定</span>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-gray-500">稼働率 = 使った科の手術が枠の時間に占める割合。予定表や実績を取り込むと自動で更新されます。</p>
      </section>
    </div>
  );
}
