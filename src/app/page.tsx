'use client';

import { useState, useEffect, useCallback } from 'react';
import { addWeeks, subWeeks, format, startOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useSchedule } from '@/hooks/useSchedule';
import WeeklySchedule from '@/components/WeeklySchedule';
import StatsBar from '@/components/StatsBar';
import DeptRanking from '@/components/DeptRanking';
import OpenSlotBoard from '@/components/OpenSlotBoard';
import AbsenceModal, { Absence } from '@/components/AbsenceModal';
import AbsenceImportModal from '@/components/AbsenceImportModal';
import AllocationMasterModal from '@/components/AllocationMasterModal';
import DeptSlotView from '@/components/DeptSlotView';
import { generateId } from '@/lib/utils';

type View = 'schedule' | 'myslots' | 'board';

export default function HomePage() {
  const schedule = useSchedule();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [view, setView] = useState<View>('myslots');
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);

  // ログイン中の診療科（デモ用選択）
  const [activeDeptId, setActiveDeptId] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('or_absences');
    if (raw) setAbsences(JSON.parse(raw));
  }, []);

  // 診療科が初期化されたらデフォルトを設定
  useEffect(() => {
    if (schedule.departments.length > 0 && !activeDeptId) {
      const saved = localStorage.getItem('or_active_dept');
      setActiveDeptId(saved ?? schedule.departments[0].id);
    }
  }, [schedule.departments, activeDeptId]);

  function handleDeptChange(deptId: string) {
    setActiveDeptId(deptId);
    localStorage.setItem('or_active_dept', deptId);
  }

  const saveAbsence = useCallback((absence: Omit<Absence, 'id' | 'createdAt'>) => {
    const newAbsence: Absence = { ...absence, id: generateId(), createdAt: new Date().toISOString() };
    setAbsences(prev => {
      const next = [...prev, newAbsence];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
  }, []);

  const importAbsences = useCallback((items: Omit<Absence, 'id' | 'createdAt'>[]) => {
    const newItems: Absence[] = items.map(a => ({ ...a, id: generateId(), createdAt: new Date().toISOString() }));
    setAbsences(prev => {
      const next = [...prev, ...newItems];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteAbsence = useCallback((id: string) => {
    setAbsences(prev => {
      const next = prev.filter(a => a.id !== id);
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
  }, []);

  if (!schedule.initialized || schedule.departments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  const openSlotCount = schedule.releasedSlots.filter(r => !r.claimedByDeptId).length;
  const activeDept = schedule.departments.find(d => d.id === activeDeptId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">OR</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-gray-900 leading-none">OR スケジューラ</h1>
              <p className="text-xs text-gray-400">手術室稼働率改善システム</p>
            </div>
          </div>

          {/* Dept selector (= "ログイン中の診療科") */}
          <div className="flex items-center gap-2 ml-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">診療科:</span>
            <select
              className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
              value={activeDeptId}
              onChange={e => handleDeptChange(e.target.value)}
            >
              {schedule.departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* View tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 ml-2">
            <button
              onClick={() => setView('myslots')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'myslots' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              自科の枠
            </button>
            <button
              onClick={() => setView('schedule')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              週次グリッド
            </button>
            <button
              onClick={() => setView('board')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${view === 'board' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              空き枠ボード
              {openSlotCount > 0 && (
                <span className="w-4 h-4 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">{openSlotCount}</span>
              )}
            </button>
          </div>

          {/* Week nav (schedule view only) */}
          {view === 'schedule' && (
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600">←</button>
              <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">今週</button>
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">{format(weekStart, 'M/d', { locale: ja })} 週</span>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600">→</button>
            </div>
          )}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowMasterModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            >
              ⚙ 枠マスタ
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg transition-colors border border-green-200"
            >
              📊 一括インポート
            </button>
            <button
              onClick={() => setShowAbsenceModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            >
              📅 不在登録
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {/* Stats */}
        <StatsBar
          weekStart={weekStart}
          allocations={schedule.allocations}
          surgeries={schedule.surgeries}
          releasedSlots={schedule.releasedSlots}
        />

        {/* ── 自科の枠ビュー ── */}
        {view === 'myslots' && (
          <DeptSlotView
            activeDeptId={activeDeptId}
            departments={schedule.departments}
            allocations={schedule.allocations}
            surgeries={schedule.surgeries}
            releasedSlots={schedule.releasedSlots}
            slotRequests={schedule.slotRequests}
            onReleaseSlot={schedule.releaseSlot}
            onCancelRelease={schedule.cancelRelease}
            onSubmitRequest={schedule.submitRequest}
            onApproveRequest={schedule.approveRequest}
            onRejectRequest={schedule.rejectRequest}
            onCancelRequest={schedule.cancelRequest}
          />
        )}

        {/* ── 週次グリッド ── */}
        {view === 'schedule' && (
          <div className="space-y-5">
            <WeeklySchedule
              weekStart={weekStart}
              allocations={schedule.allocations}
              surgeries={schedule.surgeries}
              releasedSlots={schedule.releasedSlots}
              departments={schedule.departments}
              rooms={schedule.rooms}
              onAddSurgery={schedule.addSurgery}
              onUpdateSurgery={schedule.updateSurgery}
              onDeleteSurgery={schedule.deleteSurgery}
              onReleaseSlot={schedule.releaseSlot}
              onClaimSlot={schedule.claimSlot}
              onCancelRelease={schedule.cancelRelease}
            />
            <DeptRanking
              weekStart={weekStart}
              allocations={schedule.allocations}
              surgeries={schedule.surgeries}
              releasedSlots={schedule.releasedSlots}
              slotRequests={schedule.slotRequests}
              departments={schedule.departments}
            />
          </div>
        )}

        {/* ── 空き枠ボード ── */}
        {view === 'board' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <OpenSlotBoard
              releasedSlots={schedule.releasedSlots}
              absences={absences}
              departments={schedule.departments}
              allocations={schedule.allocations}
              surgeries={schedule.surgeries}
              onClaim={schedule.claimSlot}
              onCancelRelease={schedule.cancelRelease}
            />
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">登録済み不在・学会</h3>
                  <p className="text-xs text-gray-500 mt-0.5">事前に登録された不在期間</p>
                </div>
                <button
                  onClick={() => setShowAbsenceModal(true)}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                >
                  ＋ 追加
                </button>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {absences.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <div className="text-2xl mb-2">📅</div>
                    登録された不在はありません
                  </div>
                ) : (
                  absences.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(absence => (
                    <div key={absence.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-800">{absence.deptName}</span>
                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">{absence.reason}</span>
                          {absence.personName && <span className="text-xs text-gray-500">{absence.personName}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{absence.startDate} ~ {absence.endDate}</p>
                        {absence.notes && <p className="text-xs text-gray-400 mt-0.5">{absence.notes}</p>}
                      </div>
                      <button onClick={() => deleteAbsence(absence.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors mt-0.5">削除</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {showAbsenceModal && (
        <AbsenceModal
          departments={schedule.departments}
          onSave={saveAbsence}
          onClose={() => setShowAbsenceModal(false)}
        />
      )}
      {showImportModal && (
        <AbsenceImportModal
          departments={schedule.departments}
          onImport={importAbsences}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {showMasterModal && (
        <AllocationMasterModal
          allocations={schedule.allocations}
          departments={schedule.departments}
          rooms={schedule.rooms}
          onSave={schedule.saveAllocations}
          onClose={() => setShowMasterModal(false)}
        />
      )}
    </div>
  );
}
