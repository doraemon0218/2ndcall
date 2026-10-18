'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Department, ReleasedSlot, SlotRequest, getPeriodLabel } from '@/lib/types';
import { getDeptBgStyle } from '@/lib/utils';

interface Props {
  releasedSlots: ReleasedSlot[];
  slotRequests: SlotRequest[];
  departments: Department[];
  onAssign: (releaseId: string, deptId: string, deptName: string) => void;
  onCancel: (releaseId: string) => void;
}

// ② 移譲依頼：まだ使う科が決まっていない共有枠（募集中）の一覧
export default function OpenReleasesList({ releasedSlots, slotRequests, departments, onAssign, onCancel }: Props) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const open = releasedSlots
    .filter(r => !r.claimedByDeptId && r.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.roomId.localeCompare(b.roomId, undefined, { numeric: true }));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-gray-900">募集中の枠 {open.length}件</h3>
      <p className="text-sm text-gray-500 mt-0.5 mb-3">共有されたが、まだ使う科が決まっていない枠です。申請を待つか、ここで科を選んで割り当てられます。</p>
      {open.length === 0 ? (
        <p className="text-sm text-gray-500">募集中の枠はありません。</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {open.map(r => {
            const owner = departments.find(d => d.id === r.ownerDeptId);
            const pending = slotRequests.filter(q => q.releaseId === r.id && q.status === 'pending');
            const chosen = pick[r.id] ?? '';
            return (
              <li key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="w-24 flex-shrink-0">
                  <p className="text-base font-bold text-gray-900">{format(new Date(`${r.date}T00:00:00`), 'M/d(E)', { locale: ja })}</p>
                  <p className="text-xs text-gray-500">手術室{r.roomId.replace('or', '')}・{getPeriodLabel(r.period)}</p>
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-bold text-gray-800">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: getDeptBgStyle(owner?.color ?? '') }} />
                    {r.ownerDeptName} の枠
                    {r.reasonLabel && <span className="ml-2 text-xs font-normal text-gray-500">理由：{r.reasonLabel}</span>}
                  </p>
                  <p className={`text-xs mt-0.5 ${pending.length ? 'font-bold text-[#C2610F]' : 'text-gray-500'}`}>
                    {pending.length ? `申請あり：${pending.map(q => q.requestingDeptName).join('、')}（上の一覧で承認）` : 'まだ申請はありません'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
                    value={chosen}
                    onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))}
                    aria-label="割り当てる診療科"
                  >
                    <option value="">科を選んで割当…</option>
                    {departments.filter(d => d.id !== r.ownerDeptId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={!chosen}
                    onClick={() => {
                      const d = departments.find(x => x.id === chosen);
                      if (d) onAssign(r.id, d.id, d.name);
                    }}
                    className="rounded-lg bg-[#1B3A5C] px-3 py-2 text-sm font-bold text-white disabled:opacity-30"
                  >
                    割り当てる
                  </button>
                  <button type="button" onClick={() => onCancel(r.id)} className="px-2 py-2 text-xs text-gray-400 hover:text-red-500">
                    共有を取消
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
