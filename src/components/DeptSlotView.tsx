'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { SlotAllocation, Surgery, ReleasedSlot, Department, SlotRequest } from '@/lib/types';
import { getPeriodLabel } from '@/lib/types';
import { getDeptBgStyle, getWeekDates, allocationStartHHMM, allocationEndHHMM, isDeadlinePassed, isRequestOpen, getRequestDeadline, minutesToHHMM } from '@/lib/utils';
import { addDays } from 'date-fns';

interface Props {
  activeDeptId: string;
  departments: Department[];
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots: ReleasedSlot[];
  slotRequests: SlotRequest[];
  onReleaseSlot: (params: {
    allocationId: string; date: string; roomId: string;
    ownerDeptId: string; ownerDeptName: string;
    period: ReleasedSlot['period'];
    startHour: number; endHour: number;
    availStartTime?: string; availEndTime?: string;
    releasedBy: string; message: string;
  }) => void;
  onCancelRelease: (releaseId: string) => void;
  onSubmitRequest: (req: {
    releaseId: string; date: string; roomId: string;
    requestingDeptId: string; requestingDeptName: string;
    procedure: string; surgeonName: string;
    wantedStartTime: string; wantedEndTime: string;
    notes: string;
  }) => void;
  onApproveRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onCancelRequest: (requestId: string) => void;
}

const DOW_LABELS = ['', '月', '火', '水', '木', '金', '土', '日'];
const NUM_WEEKS = 3;

export default function DeptSlotView({
  activeDeptId, departments, allocations, surgeries,
  releasedSlots, slotRequests,
  onReleaseSlot, onCancelRelease, onSubmitRequest,
  onApproveRequest, onRejectRequest, onCancelRequest,
}: Props) {
  interface ReleaseFormState { message: string; availStart: string; availEnd: string }
  interface RequestFormState { procedure: string; surgeonName: string; wantedStart: string; wantedEnd: string; notes: string }

  const [releaseForm, setReleaseForm] = useState<Record<string, ReleaseFormState>>({});
  const [releasing, setReleasing] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState<Record<string, RequestFormState>>({});
  const [requesting, setRequesting] = useState<string | null>(null);

  const activeDept = departments.find(d => d.id === activeDeptId);
  const activeDeptColor = activeDept ? getDeptBgStyle(activeDept.color) : '#6b7280';

  const today = new Date();
  const allDates: Date[] = [];
  for (let w = 0; w < NUM_WEEKS; w++) {
    getWeekDates(addDays(today, w * 7)).forEach(d => allDates.push(d));
  }

  // Own department's slots
  const ownSlots = allDates.flatMap(date => {
    const dow = date.getDay() === 0 ? 7 : date.getDay();
    const dateStr = format(date, 'yyyy-MM-dd');
    return allocations
      .filter(a => a.deptId === activeDeptId && a.dayOfWeek === dow)
      .map(alloc => {
        const allocStartMin = alloc.startHour * 60 + (alloc.startMin ?? 0);
        const allocEndMin = alloc.endHour * 60 + (alloc.endMin ?? 0);
        const daySurgeries = surgeries.filter(s => {
          if (s.date !== dateStr || s.roomId !== alloc.roomId || s.status === 'cancelled') return false;
          const [sh, sm] = s.startTime.split(':').map(Number);
          const surgStart = sh * 60 + sm;
          return surgStart >= allocStartMin && surgStart < allocEndMin;
        });
        const released = releasedSlots.find(r => r.allocationId === alloc.id && r.date === dateStr);
        const requests = slotRequests.filter(r => released && r.releaseId === released.id);
        const deadline = getRequestDeadline(date);
        const deadlinePassed = isDeadlinePassed(date);
        return { alloc, date, dateStr, daySurgeries, released, requests, deadline, deadlinePassed };
      });
  });

  // Released slots from other depts
  const otherReleased = releasedSlots
    .filter(r => r.ownerDeptId !== activeDeptId)
    .map(r => {
      const rDate = parseISO(r.date);
      const requests = slotRequests.filter(req => req.releaseId === r.id);
      const myRequest = requests.find(req => req.requestingDeptId === activeDeptId);
      const deadline = getRequestDeadline(rDate);
      const deadlinePassed = isDeadlinePassed(rDate);
      const open = isRequestOpen(rDate);
      return { release: r, rDate, requests, myRequest, deadline, deadlinePassed, open };
    })
    .filter(r => r.rDate >= today || r.release.claimedByDeptId)
    .sort((a, b) => a.release.date.localeCompare(b.release.date));

  const ownKey = (alloc: SlotAllocation, dateStr: string) => `${alloc.id}-${dateStr}`;

  return (
    <div className="space-y-5">
      {/* ── 自科の保有枠 ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: activeDeptColor }} />
          <div>
            <h3 className="font-bold text-gray-900">{activeDept?.name ?? '—'} の保有枠（今後{NUM_WEEKS}週間）</h3>
            <p className="text-xs text-gray-500 mt-0.5">使えない枠をクリックして全診療科に共有できます</p>
          </div>
        </div>

        {ownSlots.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">この診療科の保有枠はありません</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {ownSlots.map(({ alloc, date, dateStr, daySurgeries, released, requests, deadline, deadlinePassed }) => {
              const key = ownKey(alloc, dateStr);
              const isEmpty = daySurgeries.length === 0;
              const isReleasing = releasing === key;
              const weekOf = format(date, 'M/d', { locale: ja });
              const dayLabel = DOW_LABELS[date.getDay() === 0 ? 7 : date.getDay()];
              const pendingReqs = requests.filter(r => r.status === 'pending');
              const approvedReq = requests.find(r => r.status === 'approved');

              return (
                <div key={key} className={`px-5 py-3.5 ${released ? (approvedReq ? 'bg-blue-50/40' : 'bg-purple-50/40') : isEmpty ? 'bg-orange-50/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    {/* Date */}
                    <div className="flex-shrink-0 text-center w-14">
                      <div className="text-xs text-gray-400 font-medium">{weekOf}</div>
                      <div className="text-xl font-bold text-gray-800 leading-tight">{dayLabel}</div>
                      <div className={`text-xs font-bold ${alloc.period === 'am' ? 'text-amber-600' : 'text-indigo-600'}`}>
                        {getPeriodLabel(alloc.period)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Room + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-700">
                          手術室{alloc.roomId.replace('or', '')}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">
                          {allocationStartHHMM(alloc)}–{allocationEndHHMM(alloc)}
                        </span>

                        {approvedReq && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
                            ✓ {approvedReq.requestingDeptName} が確定
                          </span>
                        )}
                        {released && !approvedReq && pendingReqs.length > 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded-full">
                            希望申請 {pendingReqs.length}件
                          </span>
                        )}
                        {released && !approvedReq && pendingReqs.length === 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">
                            🔓 共有中
                          </span>
                        )}
                        {!released && isEmpty && (
                          <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full font-bold">未登録</span>
                        )}
                        {!released && daySurgeries.length > 0 && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-bold">{daySurgeries.length}件予定</span>
                        )}
                      </div>

                      {daySurgeries.length > 0 && (
                        <p className="mt-0.5 text-xs text-gray-500 truncate">{daySurgeries.map(s => s.procedure).join(' / ')}</p>
                      )}

                      {/* Pending requests for this released slot */}
                      {released && pendingReqs.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-xs font-bold text-gray-600">
                            {deadlinePassed ? '交渉結果を入力:' : `申請受付中（締切: ${format(deadline, 'M/d(E) HH:mm', { locale: ja })}）`}
                          </p>
                          {pendingReqs.map(req => {
                            const reqDept = departments.find(d => d.id === req.requestingDeptId);
                            const reqColor = reqDept ? getDeptBgStyle(reqDept.color) : '#9ca3af';
                            return (
                              <div key={req.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
                                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: reqColor }} />
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-bold text-gray-800">{req.requestingDeptName}</span>
                                  {req.procedure && <span className="text-xs text-gray-500 ml-1.5">{req.procedure}</span>}
                                  {req.surgeonName && <span className="text-xs text-gray-400 ml-1.5">/ {req.surgeonName}</span>}
                                </div>
                                {deadlinePassed && (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => onApproveRequest(req.id)}
                                      className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                                    >
                                      確定
                                    </button>
                                    <button
                                      onClick={() => onRejectRequest(req.id)}
                                      className="px-2.5 py-1 text-xs text-gray-400 hover:bg-gray-100 rounded-lg border border-gray-200"
                                    >
                                      却下
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Release form */}
                      {isReleasing && !released && (
                        <div className="mt-2 bg-white border border-purple-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-purple-700">🔓 この枠を他科に共有します</p>
                          <p className="text-xs text-gray-500">募集する時間帯を指定できます（1/4日単位）</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">開始（省略で枠全体）</label>
                              <input
                                type="time"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                                value={releaseForm[key]?.availStart ?? allocationStartHHMM(alloc)}
                                onChange={e => setReleaseForm(p => ({ ...p, [key]: { ...p[key] ?? { message: '', availStart: allocationStartHHMM(alloc), availEnd: allocationEndHHMM(alloc) }, availStart: e.target.value } }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">終了</label>
                              <input
                                type="time"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                                value={releaseForm[key]?.availEnd ?? allocationEndHHMM(alloc)}
                                onChange={e => setReleaseForm(p => ({ ...p, [key]: { ...p[key] ?? { message: '', availStart: allocationStartHHMM(alloc), availEnd: allocationEndHHMM(alloc) }, availEnd: e.target.value } }))}
                              />
                            </div>
                          </div>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                            placeholder="メッセージ（例: 術者出張のため空きます）"
                            value={releaseForm[key]?.message ?? ''}
                            onChange={e => setReleaseForm(p => ({ ...p, [key]: { ...p[key] ?? { message: '', availStart: allocationStartHHMM(alloc), availEnd: allocationEndHHMM(alloc) }, message: e.target.value } }))}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setReleasing(null)} className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">戻る</button>
                            <button
                              onClick={() => {
                                const rf = releaseForm[key];
                                onReleaseSlot({
                                  allocationId: alloc.id, date: dateStr, roomId: alloc.roomId,
                                  ownerDeptId: alloc.deptId, ownerDeptName: alloc.deptName,
                                  period: alloc.period,
                                  startHour: alloc.startHour, endHour: alloc.endHour,
                                  availStartTime: rf?.availStart,
                                  availEndTime: rf?.availEnd,
                                  releasedBy: activeDept?.name ?? '', message: rf?.message ?? '',
                                });
                                setReleasing(null);
                              }}
                              className="flex-1 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
                            >
                              全科に共有する
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="flex-shrink-0">
                      {!released && (
                        <button
                          onClick={() => setReleasing(isReleasing ? null : key)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            isEmpty ? 'border-purple-300 text-purple-700 hover:bg-purple-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          枠を共有
                        </button>
                      )}
                      {released && !approvedReq && pendingReqs.length === 0 && (
                        <button
                          onClick={() => onCancelRelease(released.id)}
                          className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-500 rounded-lg border border-gray-200 hover:border-red-200"
                        >
                          共有取消
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 他科の空き枠（希望申請） ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">他科の空き枠に希望申請</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            金曜日 正午が申請締め切りです。複数申請があった場合は締め切り後に当事者間で交渉します。
          </p>
        </div>

        {otherReleased.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">他科から共有されている空き枠はありません</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {otherReleased.map(({ release: r, rDate, requests, myRequest, deadline, deadlinePassed, open }) => {
              const ownerDept = departments.find(d => d.id === r.ownerDeptId);
              const ownerColor = ownerDept ? getDeptBgStyle(ownerDept.color) : '#9ca3af';
              const dayLabel = DOW_LABELS[rDate.getDay() === 0 ? 7 : rDate.getDay()];
              const pendingReqs = requests.filter(req => req.status === 'pending');
              const approvedReq = requests.find(req => req.status === 'approved');
              const isReqOpen = requesting === r.id;
              const reqF = requestForm[r.id] ?? { procedure: '', surgeonName: '', wantedStart: r.availStartTime ?? `${r.startHour}:00`, wantedEnd: r.availEndTime ?? `${r.endHour}:00`, notes: '' };

              return (
                <div key={r.id} className={`px-5 py-3.5 ${approvedReq ? 'bg-green-50/30' : 'bg-purple-50/20'}`}>
                  <div className="flex items-start gap-3">
                    {/* Date */}
                    <div className="flex-shrink-0 text-center w-14">
                      <div className="text-xs text-gray-400">{format(rDate, 'M/d', { locale: ja })}</div>
                      <div className="text-xl font-bold text-gray-800 leading-tight">{dayLabel}</div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerColor }} />
                        <span className="text-sm font-bold text-gray-800">{r.ownerDeptName}</span>
                        <span className="text-xs text-gray-500">
                          手術室{r.roomId.replace('or', '')} · {r.startHour}:00–{r.endHour}:00
                        </span>
                        {approvedReq && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded-full">
                            ✓ {approvedReq.requestingDeptName} 確定
                          </span>
                        )}
                        {!approvedReq && deadlinePassed && pendingReqs.length > 1 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded-full">
                            交渉中 ({pendingReqs.length}科申請)
                          </span>
                        )}
                      </div>
                      {r.message && <p className="text-xs text-gray-500 mt-0.5">{r.message}</p>}

                      {/* Deadline info */}
                      {!approvedReq && (
                        <p className={`text-xs mt-0.5 font-medium ${deadlinePassed ? 'text-red-500' : 'text-gray-400'}`}>
                          申請締め切り: {format(deadline, 'M月d日(E) HH:mm', { locale: ja })}
                          {deadlinePassed ? ' — 締め切り済' : open ? ' — 申請受付中' : ' — まだ受付前'}
                        </p>
                      )}

                      {/* Pending requests overview */}
                      {pendingReqs.length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {pendingReqs.map(req => {
                            const reqDept = departments.find(d => d.id === req.requestingDeptId);
                            const reqColor = reqDept ? getDeptBgStyle(reqDept.color) : '#9ca3af';
                            return (
                              <span key={req.id} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-full text-xs">
                                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: reqColor }} />
                                {req.requestingDeptName}
                                {req.requestingDeptId === activeDeptId && (
                                  <button onClick={() => onCancelRequest(req.id)} className="text-gray-300 hover:text-red-400 ml-0.5">✕</button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Request form */}
                      {isReqOpen && !myRequest && !approvedReq && (
                        <div className="mt-2 bg-white border border-blue-200 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-bold text-blue-700">希望内容を入力してください</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="術式（例: 膝人工関節）"
                              value={reqF.procedure}
                              onChange={e => setRequestForm(p => ({ ...p, [r.id]: { ...reqF, procedure: e.target.value } }))}
                            />
                            <input
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="執刀医"
                              value={reqF.surgeonName}
                              onChange={e => setRequestForm(p => ({ ...p, [r.id]: { ...reqF, surgeonName: e.target.value } }))}
                            />
                          </div>
                          <p className="text-xs text-gray-500 font-medium">希望する時間帯（1/4日単位で指定可）</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-400 mb-0.5">開始</label>
                              <input
                                type="time"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={reqF.wantedStart}
                                onChange={e => setRequestForm(p => ({ ...p, [r.id]: { ...reqF, wantedStart: e.target.value } }))}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-0.5">終了</label>
                              <input
                                type="time"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                value={reqF.wantedEnd}
                                onChange={e => setRequestForm(p => ({ ...p, [r.id]: { ...reqF, wantedEnd: e.target.value } }))}
                              />
                            </div>
                          </div>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                            placeholder="備考（緊急度など）"
                            value={reqF.notes}
                            onChange={e => setRequestForm(p => ({ ...p, [r.id]: { ...reqF, notes: e.target.value } }))}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setRequesting(null)} className="flex-1 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">戻る</button>
                            <button
                              onClick={() => {
                                onSubmitRequest({
                                  releaseId: r.id, date: r.date, roomId: r.roomId,
                                  requestingDeptId: activeDeptId, requestingDeptName: activeDept?.name ?? '',
                                  procedure: reqF.procedure, surgeonName: reqF.surgeonName,
                                  wantedStartTime: reqF.wantedStart || (r.availStartTime ?? `${r.startHour}:00`),
                                  wantedEndTime: reqF.wantedEnd || (r.availEndTime ?? `${r.endHour}:00`),
                                  notes: reqF.notes,
                                });
                                setRequesting(null);
                              }}
                              className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                            >
                              希望申請を送る
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      {!approvedReq && !myRequest && (open || !deadlinePassed) && (
                        <button
                          onClick={() => setRequesting(isReqOpen ? null : r.id)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                        >
                          希望申請
                        </button>
                      )}
                      {myRequest && myRequest.status === 'pending' && (
                        <span className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg border border-blue-200">
                          申請済み
                        </span>
                      )}
                      {approvedReq?.requestingDeptId === activeDeptId && (
                        <span className="px-3 py-1.5 text-xs font-bold text-green-700 bg-green-100 rounded-lg">
                          ✓ 確定
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
