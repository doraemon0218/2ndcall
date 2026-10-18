'use client';

import { useState } from 'react';
import { SlotAllocation, Department, OperatingRoom, PERIOD_HOURS } from '@/lib/types';
import { getDeptBgStyle } from '@/lib/utils';

interface Props {
  allocations: SlotAllocation[];
  departments: Department[];
  rooms: OperatingRoom[];
  confirmed: boolean;
  onSave: (next: SlotAllocation[]) => void;
  onClose: () => void;
  inline?: boolean; // タブ内にそのまま表示（ポップアップにしない）
}

const DAYS = [
  { dow: 1, label: '月' },
  { dow: 2, label: '火' },
  { dow: 3, label: '水' },
  { dow: 4, label: '木' },
  { dow: 5, label: '金' },
];

// 部屋×曜日×午前/午後 → 診療科ID（'' は担当なし）
type Grid = Record<string, { am: string; pm: string }>;
const key = (roomId: string, dow: number) => `${roomId}-${dow}`;

function toGrid(allocations: SlotAllocation[], rooms: OperatingRoom[]): Grid {
  const grid: Grid = {};
  for (const r of rooms) for (const d of DAYS) grid[key(r.id, d.dow)] = { am: '', pm: '' };
  for (const a of allocations) {
    const cell = grid[key(a.roomId, a.dayOfWeek)];
    if (!cell) continue;
    if (a.period === 'am' || a.period === 'full') cell.am = a.deptId;
    if (a.period === 'pm' || a.period === 'full') cell.pm = a.deptId;
  }
  return grid;
}

function fromGrid(grid: Grid, rooms: OperatingRoom[], departments: Department[]): SlotAllocation[] {
  const out: SlotAllocation[] = [];
  for (const r of rooms) for (const d of DAYS) {
    const cell = grid[key(r.id, d.dow)];
    (['am', 'pm'] as const).forEach(period => {
      const deptId = cell?.[period];
      const dept = departments.find(x => x.id === deptId);
      if (!dept) return;
      out.push({ id: `${r.id}-${d.dow}-${period}`, roomId: r.id, dayOfWeek: d.dow, period, ...PERIOD_HOURS[period], deptId: dept.id, deptName: dept.name, notes: '' });
    });
  }
  return out;
}

const roomNo = (roomId: string) => Number(roomId.replace('or', ''));
const fmtUnits = (n: number) => (n === 0 ? '' : Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function SlotSetupWizard({ allocations, departments, rooms, confirmed, onSave, onClose, inline = false }: Props) {
  const [grid, setGrid] = useState<Grid>(() => toGrid(allocations, rooms));
  const [dow, setDow] = useState(1);
  const [summaryTab, setSummaryTab] = useState<'day' | 'dept' | 'table'>('table');

  const deptName = (id: string) => departments.find(d => d.id === id)?.name ?? '';
  const deptShort = (id: string) => departments.find(d => d.id === id)?.shortName ?? '';
  const deptColor = (id: string) => getDeptBgStyle(departments.find(d => d.id === id)?.color ?? '');

  function setCell(roomId: string, value: string) {
    // value: 'full:<id>' | 'am:<id>' | 'pm:<id>' | '' （担当なし）
    setGrid(prev => {
      const next = { ...prev };
      const cur = { ...next[key(roomId, dow)] };
      if (value === '') { cur.am = ''; cur.pm = ''; }
      else {
        const [part, id] = value.split(':');
        if (part === 'full') { cur.am = id; cur.pm = id; }
        if (part === 'am') cur.am = id;
        if (part === 'pm') cur.pm = id;
      }
      next[key(roomId, dow)] = cur;
      return next;
    });
  }

  function setHalf(roomId: string, period: 'am' | 'pm', id: string) {
    setGrid(prev => ({ ...prev, [key(roomId, dow)]: { ...prev[key(roomId, dow)], [period]: id } }));
  }

  // 診療科×曜日の枠数（終日=1、半日=0.5）
  const units = (deptId: string, d: number) => rooms.reduce((sum, r) => {
    const c = grid[key(r.id, d)];
    return sum + (c?.am === deptId ? 0.5 : 0) + (c?.pm === deptId ? 0.5 : 0);
  }, 0);
  const dayTotal = (d: number) => departments.reduce((s, dep) => s + units(dep.id, d), 0);
  const weekTotal = (deptId: string) => DAYS.reduce((s, d) => s + units(deptId, d.dow), 0);

  // 言語化：曜日ごと
  function describeDay(d: number): string[] {
    const lines: string[] = [];
    for (const dep of departments) {
      const full = rooms.filter(r => grid[key(r.id, d)]?.am === dep.id && grid[key(r.id, d)]?.pm === dep.id).map(r => roomNo(r.id));
      const am = rooms.filter(r => grid[key(r.id, d)]?.am === dep.id && grid[key(r.id, d)]?.pm !== dep.id).map(r => roomNo(r.id));
      const pm = rooms.filter(r => grid[key(r.id, d)]?.pm === dep.id && grid[key(r.id, d)]?.am !== dep.id).map(r => roomNo(r.id));
      const parts = [
        full.length ? `手術室${full.join('・')}（終日）` : '',
        am.length ? `手術室${am.join('・')}（午前）` : '',
        pm.length ? `手術室${pm.join('・')}（午後）` : '',
      ].filter(Boolean);
      if (parts.length) lines.push(`${dep.name}：${parts.join('、')}`);
    }
    const empty = rooms.filter(r => !grid[key(r.id, d)]?.am && !grid[key(r.id, d)]?.pm).map(r => roomNo(r.id));
    if (empty.length) lines.push(`担当なし：手術室${empty.join('・')}`);
    return lines;
  }

  // 言語化：診療科ごと
  function describeDept(deptId: string): string {
    const parts = DAYS.map(d => {
      const u = units(deptId, d.dow);
      if (u === 0) return '';
      const rs = rooms.filter(r => grid[key(r.id, d.dow)]?.am === deptId || grid[key(r.id, d.dow)]?.pm === deptId).map(r => roomNo(r.id));
      return `${d.label}${fmtUnits(u)}枠（手術室${rs.join('・')}）`;
    }).filter(Boolean);
    return parts.length ? parts.join('、') : '枠なし';
  }

  const dayLabel = DAYS.find(d => d.dow === dow)?.label;

  return (
    <div className={inline ? '' : 'fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center p-4'}>
      <div className={inline ? 'bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden' : 'w-full max-w-7xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden'}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">① 枠の所有者</h2>
            <p className="text-sm text-gray-500 mt-0.5">どの診療科が、どの曜日の、どの部屋・時間帯の枠を持っているかを登録します</p>
          </div>
          {inline ? (
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${confirmed ? 'bg-[#E9EDF2] text-[#1B3A5C]' : 'bg-[#FDF3EA] text-[#C2610F]'}`}>
              {confirmed ? '確定済み' : '未確定'}
            </span>
          ) : (
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">閉じる ✕</button>
          )}
        </div>

        <div className={`grid lg:grid-cols-[1.1fr_1fr] ${inline ? '' : 'flex-1 overflow-hidden'}`}>
          {/* ── 入力 ── */}
          <div className="overflow-y-auto p-6 border-r border-gray-100">
            <p className="text-sm font-bold text-gray-800 mb-2">① 曜日を選んで、部屋ごとに診療科を選ぶ</p>
            <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1 mb-4">
              {DAYS.map(d => (
                <button
                  key={d.dow}
                  type="button"
                  onClick={() => setDow(d.dow)}
                  className={`px-4 py-2 text-base font-bold rounded-md ${dow === d.dow ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-gray-500'}`}
                >
                  {d.label}<span className="ml-1 text-xs font-normal text-gray-400">{fmtUnits(dayTotal(d.dow)) || 0}枠</span>
                </button>
              ))}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 w-24">手術室</th>
                  <th className="py-2">{dayLabel}曜の担当</th>
                  <th className="py-2 w-40">午前</th>
                  <th className="py-2 w-40">午後</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(r => {
                  const c = grid[key(r.id, dow)] ?? { am: '', pm: '' };
                  const isFull = c.am && c.am === c.pm;
                  const mainValue = !c.am && !c.pm ? '' : isFull ? `full:${c.am}` : 'split';
                  return (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="py-2 font-bold text-gray-700">{r.name}</td>
                      <td className="py-2 pr-2">
                        <select
                          className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm font-bold"
                          value={mainValue}
                          onChange={e => { if (e.target.value !== 'split') setCell(r.id, e.target.value); }}
                          style={{ borderLeft: `6px solid ${c.am || c.pm ? deptColor(c.am || c.pm) : '#e5e7eb'}` }}
                        >
                          <option value="">担当なし</option>
                          {departments.map(d => <option key={d.id} value={`full:${d.id}`}>{d.name}（終日）</option>)}
                          <option value="split">午前と午後で分ける →</option>
                        </select>
                      </td>
                      {(['am', 'pm'] as const).map(period => (
                        <td key={period} className="py-2 pr-2">
                          <select
                            className={`w-full rounded-lg border px-2 py-2 text-xs ${isFull || (!c.am && !c.pm) ? 'border-gray-100 text-gray-400' : 'border-gray-200'}`}
                            value={c[period]}
                            onChange={e => setHalf(r.id, period, e.target.value)}
                          >
                            <option value="">なし</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.shortName}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── 言語化・確認 ── */}
          <div className="overflow-y-auto p-6 bg-gray-50">
            <p className="text-sm font-bold text-gray-800 mb-2">② 入力した内容を確認する</p>
            <div className="inline-flex bg-white rounded-lg p-1 gap-1 mb-4 border border-gray-200">
              {([['table', '枠数の表'], ['dept', '診療科ごと'], ['day', '曜日ごと']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setSummaryTab(v)}
                  className={`px-3 py-1.5 text-sm font-bold rounded-md ${summaryTab === v ? 'bg-[#1B3A5C] text-white' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>

            {summaryTab === 'table' && (
              <table className="w-full text-sm bg-white rounded-xl overflow-hidden">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100">
                    <th className="py-2 px-3 text-left">診療科</th>
                    {DAYS.map(d => <th key={d.dow} className="py-2 text-center w-12">{d.label}</th>)}
                    <th className="py-2 px-3 text-right w-16">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map(dep => (
                    <tr key={dep.id} className="border-b border-gray-50">
                      <td className="py-1.5 px-3 font-bold text-gray-800">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: getDeptBgStyle(dep.color) }} />
                        {dep.shortName}
                      </td>
                      {DAYS.map(d => <td key={d.dow} className="py-1.5 text-center font-mono">{fmtUnits(units(dep.id, d.dow))}</td>)}
                      <td className="py-1.5 px-3 text-right font-mono font-bold">{fmtUnits(weekTotal(dep.id)) || 0}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="py-2 px-3">合計</td>
                    {DAYS.map(d => <td key={d.dow} className="py-2 text-center font-mono">{fmtUnits(dayTotal(d.dow)) || 0}</td>)}
                    <td className="py-2 px-3 text-right font-mono">{fmtUnits(DAYS.reduce((s, d) => s + dayTotal(d.dow), 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {summaryTab === 'dept' && (
              <ul className="space-y-2">
                {departments.map(dep => (
                  <li key={dep.id} className="rounded-xl bg-white px-4 py-3 text-sm">
                    <span className="font-bold text-gray-900">{dep.name}</span>
                    <span className="ml-2 text-gray-500">週{fmtUnits(weekTotal(dep.id)) || 0}枠</span>
                    <p className="mt-1 text-gray-700">{describeDept(dep.id)}</p>
                  </li>
                ))}
              </ul>
            )}

            {summaryTab === 'day' && (
              <div className="space-y-3">
                {DAYS.map(d => (
                  <div key={d.dow} className="rounded-xl bg-white px-4 py-3">
                    <p className="font-bold text-gray-900 mb-1">{d.label}曜日（{fmtUnits(dayTotal(d.dow)) || 0}枠）</p>
                    <ul className="space-y-0.5 text-sm text-gray-700">
                      {describeDay(d.dow).map(line => <li key={line}>{line}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">終日 = 1枠、午前または午後のみ = 0.5枠。院内の手術枠表と同じ数になっているか確かめてください。</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          <p className="flex-1 text-sm text-gray-500">{confirmed ? 'この枠表は確定済みです。変更すると、今後の空き状況の判定に使われます。' : '確定すると、この枠表をもとに空き状況を判定します。'}</p>
          {!inline && (
            <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-3 text-base text-gray-600 hover:bg-gray-50">
              あとで
            </button>
          )}
          <button
            type="button"
            onClick={() => { onSave(fromGrid(grid, rooms, departments)); onClose(); }}
            className="rounded-xl bg-[#1B3A5C] px-6 py-3 text-base font-bold text-white hover:opacity-90"
          >
            ③ この枠表で確定する
          </button>
        </div>
      </div>
    </div>
  );
}
