'use client';

import { useState } from 'react';
import { format, addDays, startOfWeek, parseISO, isWithinInterval } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ReleasedSlot, Department, SlotAllocation, Surgery } from '@/lib/types';
import { getDeptBgStyle } from '@/lib/utils';
import { Absence } from './AbsenceModal';

interface Props {
  releasedSlots: ReleasedSlot[];
  absences: Absence[];
  departments: Department[];
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  onClaim: (releaseId: string, deptId: string, deptName: string) => void;
  onCancelRelease: (releaseId: string) => void;
}

export default function OpenSlotBoard({
  releasedSlots, absences, departments, allocations, surgeries, onClaim, onCancelRelease
}: Props) {
  const [tab, setTab] = useState<'advance' | 'urgent'>('urgent');
  const [claimDept, setClaimDept] = useState<Record<string, string>>({});

  const today = new Date();
  const nextWeekMonday = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });

  // 事前告知: 学会などで先に分かっている空き枠 (1週間超先)
  const advanceReleased = releasedSlots.filter(r => {
    const d = parseISO(r.date);
    return d >= addDays(today, 8);
  });

  // 今週〜来週の空き枠（緊急共有）
  const urgentReleased = releasedSlots.filter(r => {
    const d = parseISO(r.date);
    return d <= addDays(today, 7);
  });

  // 学会不在から影響を受けるOR枠
  const absenceAffected = absences.flatMap(absence => {
    const start = parseISO(absence.startDate);
    const end = parseISO(absence.endDate);
    return allocations
      .filter(a => a.deptId === absence.deptId)
      .map(alloc => {
        const dates: string[] = [];
        let cur = new Date(start);
        while (cur <= end) {
          const dow = cur.getDay() === 0 ? 7 : cur.getDay();
          if (dow === alloc.dayOfWeek) {
            const dateStr = format(cur, 'yyyy-MM-dd');
            const hasSurgery = surgeries.some(s => s.date === dateStr && s.roomId === alloc.roomId);
            const isAlreadyReleased = releasedSlots.some(r => r.allocationId === alloc.id && r.date === dateStr);
            if (!hasSurgery && !isAlreadyReleased && cur > addDays(today, 7)) {
              dates.push(dateStr);
            }
          }
          cur = addDays(cur, 1);
        }
        return dates.map(date => ({ absence, alloc, date }));
      })
      .flat();
  });

  function handleClaim(releaseId: string) {
    const deptId = claimDept[releaseId];
    if (!deptId) return;
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    onClaim(releaseId, deptId, dept.name);
    setClaimDept(prev => ({ ...prev, [releaseId]: '' }));
  }

  const urgentCount = urgentReleased.filter(r => !r.claimedByDeptId).length;
  const advanceCount = advanceReleased.length + absenceAffected.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          空き枠情報ボード
          {urgentCount > 0 && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">{urgentCount}件</span>}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">解放中の枠と事前告知された不在情報</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setTab('urgent')}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'urgent' ? 'text-red-700 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-700'}`}
        >
          ⚡ 今週・来週の空き枠
          {urgentReleased.length > 0 && <span className="w-4 h-4 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">{urgentReleased.length}</span>}
        </button>
        <button
          onClick={() => setTab('advance')}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${tab === 'advance' ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
        >
          📅 事前告知（学会・不在）
          {advanceCount > 0 && <span className="w-4 h-4 flex items-center justify-center bg-blue-500 text-white text-xs rounded-full">{Math.min(advanceCount, 9)}</span>}
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        {tab === 'urgent' && (
          <>
            {urgentReleased.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">今週・来週の解放中の枠はありません</div>
            ) : (
              urgentReleased.map(r => {
                const dept = departments.find(d => d.id === r.ownerDeptId);
                const deptColor = dept ? getDeptBgStyle(dept.color) : '#9ca3af';
                return (
                  <div key={r.id} className={`rounded-xl border p-3 ${r.claimedByDeptId ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}`}>
                    <div className="flex items-start gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: deptColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-800">{r.ownerDeptName}</span>
                          <span className="text-xs text-gray-500">{r.date} · 手術室{r.roomId.replace('or', '')}</span>
                          <span className="text-xs text-gray-500">{r.startHour}:00–{r.endHour}:00</span>
                        </div>
                        {r.message && <p className="text-xs text-gray-600 mt-0.5">{r.message}</p>}
                        {r.releasedBy && <p className="text-xs text-gray-400 mt-0.5">解放: {r.releasedBy}</p>}
                        {r.claimedByDeptId ? (
                          <p className="text-xs text-blue-700 font-bold mt-1">✓ {r.claimedByDeptName} が引き受け済み</p>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <select
                              className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={claimDept[r.id] ?? ''}
                              onChange={e => setClaimDept(prev => ({ ...prev, [r.id]: e.target.value }))}
                            >
                              <option value="">診療科を選択...</option>
                              {departments.filter(d => d.id !== r.ownerDeptId).map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleClaim(r.id)}
                              disabled={!claimDept[r.id]}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
                            >
                              引き受ける
                            </button>
                            <button
                              onClick={() => onCancelRelease(r.id)}
                              className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 rounded-lg"
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'advance' && (
          <>
            {advanceReleased.length === 0 && absenceAffected.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                <div className="text-2xl mb-2">📅</div>
                事前告知された不在・学会はありません
                <p className="text-xs mt-1">不在登録ボタンから学会等を事前登録できます</p>
              </div>
            ) : (
              <>
                {/* 学会由来の予告空き枠 */}
                {absenceAffected.map(({ absence, alloc, date }, i) => {
                  const dept = departments.find(d => d.id === absence.deptId);
                  const deptColor = dept ? getDeptBgStyle(dept.color) : '#9ca3af';
                  return (
                    <div key={`${absence.id}-${date}`} className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                      <div className="flex items-start gap-2">
                        <span className="text-base">📅</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-gray-800">{absence.deptName}</span>
                            <span className="px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-xs font-bold rounded">{absence.reason}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {date} · 手術室{alloc.roomId.replace('or', '')} · {alloc.startHour}:00–{alloc.endHour}:00
                          </p>
                          {absence.personName && <p className="text-xs text-gray-400">{absence.personName}</p>}
                          {absence.notes && <p className="text-xs text-gray-500 mt-0.5">{absence.notes}</p>}
                          <p className="text-xs text-yellow-700 mt-1 font-medium">▶ この枠は空きになる可能性があります</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 解放済みの将来枠 */}
                {advanceReleased.map(r => {
                  const dept = departments.find(d => d.id === r.ownerDeptId);
                  const deptColor = dept ? getDeptBgStyle(dept.color) : '#9ca3af';
                  return (
                    <div key={r.id} className={`rounded-xl border p-3 ${r.claimedByDeptId ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50'}`}>
                      <div className="flex items-start gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: deptColor }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-gray-800">{r.ownerDeptName}</span>
                            <span className="text-xs text-gray-500">{r.date} · 手術室{r.roomId.replace('or', '')}</span>
                          </div>
                          {r.message && <p className="text-xs text-gray-600 mt-0.5">{r.message}</p>}
                          {r.claimedByDeptId
                            ? <p className="text-xs text-blue-700 font-bold mt-1">✓ {r.claimedByDeptName}</p>
                            : (
                              <div className="flex gap-2 mt-2">
                                <select
                                  className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5"
                                  value={claimDept[r.id] ?? ''}
                                  onChange={e => setClaimDept(prev => ({ ...prev, [r.id]: e.target.value }))}
                                >
                                  <option value="">診療科を選択...</option>
                                  {departments.filter(d => d.id !== r.ownerDeptId).map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleClaim(r.id)}
                                  disabled={!claimDept[r.id]}
                                  className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg"
                                >
                                  引き受ける
                                </button>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
