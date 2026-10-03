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

type View = 'schedule' | 'myslots' | 'board' | 'competition';
type UserRole = 'manager' | 'dept';
type NotificationCadence = 'instant' | '30m' | '1h' | '6h';
type UpdateCycle = 'annual' | 'quarterly' | 'halfyearly';
type DeptNotificationStatus = 'queued' | 'sent';

interface DeptNotification {
  id: string;
  deptId: string;
  deptName: string;
  title: string;
  body: string;
  createdAt: string;
  scheduledAt: string;
  status: DeptNotificationStatus;
}

export default function HomePage() {
  const schedule = useSchedule();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [view, setView] = useState<View>('board');
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);

  // ログイン中の立場（デモ用）
  const [userRole, setUserRole] = useState<UserRole>('dept');
  const [activeDeptId, setActiveDeptId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginRole, setLoginRole] = useState<UserRole>('dept');
  const [loginDeptId, setLoginDeptId] = useState('');
  const [loginError, setLoginError] = useState('');
  const [notificationCadence, setNotificationCadence] = useState<NotificationCadence>('instant');
  const [updateCycle, setUpdateCycle] = useState<UpdateCycle>('annual');
  const [deptNotifications, setDeptNotifications] = useState<DeptNotification[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('or_absences');
    if (raw) setAbsences(JSON.parse(raw));
  }, []);

  // 診療科が初期化されたらデフォルトを設定
  useEffect(() => {
    if (schedule.departments.length > 0) {
      const saved = localStorage.getItem('or_active_dept');
      const defaultDept = saved && schedule.departments.some(d => d.id === saved)
        ? saved
        : schedule.departments[0].id;

      setActiveDeptId(prev => prev || defaultDept);
      setLoginDeptId(prev => prev || defaultDept);
    }
  }, [schedule.departments]);

  useEffect(() => {
    const savedRole = localStorage.getItem('or_user_role');
    if (savedRole === 'manager' || savedRole === 'dept') {
      setUserRole(savedRole);
      setLoginRole(savedRole);
      setView(savedRole === 'manager' ? 'board' : 'myslots');
    }
  }, []);

  useEffect(() => {
    const savedCadence = localStorage.getItem('or_notification_cadence');
    if (savedCadence === 'instant' || savedCadence === '30m' || savedCadence === '1h' || savedCadence === '6h') {
      setNotificationCadence(savedCadence);
    }

    const savedCycle = localStorage.getItem('or_update_cycle');
    if (savedCycle === 'annual' || savedCycle === 'quarterly' || savedCycle === 'halfyearly') {
      setUpdateCycle(savedCycle);
    }

    const savedNotifications = localStorage.getItem('or_dept_notifications');
    if (savedNotifications) {
      try {
        const parsed = JSON.parse(savedNotifications) as DeptNotification[];
        if (Array.isArray(parsed)) setDeptNotifications(parsed);
      } catch {
        // ignore invalid cache
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('or_dept_notifications', JSON.stringify(deptNotifications));
  }, [deptNotifications]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDeptNotifications(prev => prev.map(item => {
        if (item.status === 'sent') return item;
        const due = new Date(item.scheduledAt).getTime() <= Date.now();
        return due ? { ...item, status: 'sent' } : item;
      }));
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  function handleDeptChange(deptId: string) {
    setActiveDeptId(deptId);
    setLoginDeptId(deptId);
    localStorage.setItem('or_active_dept', deptId);
  }

  function handleDeptSecurityChange(nextDeptId: string) {
    if (userRole !== 'dept') {
      handleDeptChange(nextDeptId);
      return;
    }

    const currentDeptId = activeDeptId || loginDeptId || schedule.departments[0]?.id || '';
    if (nextDeptId === currentDeptId) {
      handleDeptChange(nextDeptId);
      return;
    }

    const input = window.prompt('他診療科切替には認証が必要です\nパスワードを入力してください');
    if (input === '1234') {
      setLoginError('');
      handleDeptChange(nextDeptId);
      return;
    }

    setLoginError('パスワードが一致しないため、他診療科への切替はできません。');
  }

  function handleRoleChange(role: UserRole) {
    setUserRole(role);
    setLoginRole(role);
    setView(role === 'manager' ? 'board' : 'myslots');
    localStorage.setItem('or_user_role', role);
  }

  function handleNotificationCadenceChange(value: NotificationCadence) {
    setNotificationCadence(value);
    localStorage.setItem('or_notification_cadence', value);
  }

  function handleUpdateCycleChange(value: UpdateCycle) {
    setUpdateCycle(value);
    localStorage.setItem('or_update_cycle', value);
  }

  function getNotificationDelay(cadence: NotificationCadence): number {
    switch (cadence) {
      case 'instant': return 0;
      case '30m': return 30 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '6h': return 6 * 60 * 60 * 1000;
      default: return 0;
    }
  }

  function queueDepartmentNotifications(params: {
    ownerDeptName: string;
    requestingDeptName: string;
    date: string;
    roomName: string;
    startHour: number;
    endHour: number;
  }) {
    const now = Date.now();
    const delay = getNotificationDelay(notificationCadence);
    const items: DeptNotification[] = schedule.departments.map(dept => {
      const scheduledAt = new Date(now + delay).toISOString();
      return {
        id: `${dept.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        deptId: dept.id,
        deptName: dept.name,
        title: '枠移動が承認されました',
        body: `${params.date} ${params.roomName} ${params.startHour}:00–${params.endHour}:00 の枠が、${params.ownerDeptName}から${params.requestingDeptName}に承認されました。`,
        createdAt: new Date(now).toISOString(),
        scheduledAt,
        status: delay === 0 ? 'sent' : 'queued',
      };
    });

    setDeptNotifications(prev => [...prev, ...items]);
  }

  function handleLogin() {
    if (loginRole === 'dept') {
      if (!loginDeptId) {
        setLoginError('診療科部長として入室する場合は、所属診療科を選択してください。');
        return;
      }

      const password = window.prompt('診療科部長として入室するには認証が必要です\nパスワードを入力してください');
      if (password !== '1234') {
        setLoginError('パスワードが一致しないため入室できません。');
        return;
      }
    }

    setLoginError('');
    const nextDeptId = loginRole === 'dept' ? loginDeptId : (activeDeptId || schedule.departments[0]?.id || '');

    setUserRole(loginRole);
    setActiveDeptId(nextDeptId);
    setView(loginRole === 'manager' ? 'board' : 'myslots');
    localStorage.setItem('or_user_role', loginRole);
    if (nextDeptId) localStorage.setItem('or_active_dept', nextDeptId);
    setIsLoggedIn(true);
  }

  const applyAutoReleaseForAbsence = useCallback((absence: Omit<Absence, 'id' | 'createdAt'>) => {
    const start = new Date(`${absence.startDate}T00:00:00`);
    const end = new Date(`${absence.endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const reasonType = absence.reasonType ?? 'neutral';
    const current = new Date(start);
    while (current <= end) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay();

      schedule.allocations
        .filter(a => a.deptId === absence.deptId && a.dayOfWeek === dayOfWeek)
        .forEach(alloc => {
          const hasSurgery = schedule.surgeries.some(s => s.date === dateStr && s.roomId === alloc.roomId && s.status !== 'cancelled');
          const hasImportRelease = schedule.releasedSlots.some(r => r.allocationId === alloc.id && r.date === dateStr);
          if (!hasSurgery && !hasImportRelease) {
            schedule.releaseSlot({
              allocationId: alloc.id,
              date: dateStr,
              roomId: alloc.roomId,
              ownerDeptId: alloc.deptId,
              ownerDeptName: alloc.deptName,
              period: alloc.period,
              startHour: alloc.startHour,
              endHour: alloc.endHour,
              releasedBy: absence.personName || absence.deptName,
              message: `${absence.reason}のため自動共有（${absence.deptName}）`,
              reasonType,
              reasonLabel: absence.reason,
              source: 'absence',
            });
          }
        });

      current.setDate(current.getDate() + 1);
    }
  }, [schedule.allocations, schedule.releaseSlot, schedule.releasedSlots, schedule.surgeries]);

  const saveAbsence = useCallback((absence: Omit<Absence, 'id' | 'createdAt'>) => {
    const newAbsence: Absence = { ...absence, id: generateId(), createdAt: new Date().toISOString() };
    setAbsences(prev => {
      const next = [...prev, newAbsence];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
    applyAutoReleaseForAbsence(absence);
  }, [applyAutoReleaseForAbsence]);

  const importAbsences = useCallback((items: Omit<Absence, 'id' | 'createdAt'>[]) => {
    const newItems: Absence[] = items.map(a => ({ ...a, id: generateId(), createdAt: new Date().toISOString() }));
    setAbsences(prev => {
      const next = [...prev, ...newItems];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
    items.forEach(item => applyAutoReleaseForAbsence(item));
  }, [applyAutoReleaseForAbsence]);

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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white shadow-xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-lg font-bold">OR</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">OR スケジューラ</p>
              <h1 className="text-2xl font-bold text-slate-900">入室</h1>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">ログイン者の立場</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLoginRole('dept')}
                  className={`rounded-2xl border p-4 text-left transition ${loginRole === 'dept' ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="text-sm font-bold text-slate-800">診療科部長</div>
                  <div className="text-xs text-slate-500 mt-1">自科の枠を管理する</div>
                </button>
                <button
                  type="button"
                  onClick={() => setLoginRole('manager')}
                  className={`rounded-2xl border p-4 text-left transition ${loginRole === 'manager' ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="text-sm font-bold text-slate-800">手術室管理者</div>
                  <div className="text-xs text-slate-500 mt-1">全診療科の状況を見る</div>
                </button>
              </div>
            </div>

            {loginRole === 'dept' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">所属診療科</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-800 focus:border-blue-400 focus:outline-none"
                  value={loginDeptId}
                  onChange={e => {
                    setLoginDeptId(e.target.value);
                    setLoginError('');
                  }}
                >
                  {schedule.departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {loginError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {loginError}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              {loginRole === 'dept' ? '診療科部長として入室' : '手術室管理者として入室'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const openSlotCount = schedule.releasedSlots.filter(r => !r.claimedByDeptId).length;
  const activeDept = schedule.departments.find(d => d.id === activeDeptId);
  const ownedByMe = schedule.allocations.filter(a => a.deptId === activeDeptId).length;
  const releasedByMe = schedule.releasedSlots.filter(r => r.ownerDeptId === activeDeptId).length;
  const claimedByMe = schedule.releasedSlots.filter(r => r.claimedByDeptId === activeDeptId).length;
  const acquiredFromOtherDepts = schedule.releasedSlots.filter(r => r.claimedByDeptId === activeDeptId && r.ownerDeptId !== activeDeptId).length;
  const myPendingRequests = schedule.slotRequests.filter(r => r.requestingDeptId === activeDeptId && r.status === 'pending').length;
  const isManager = userRole === 'manager';
  const deptInbox = deptNotifications.filter(item => item.deptId === activeDeptId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);
  const managerNotificationsSummary = deptNotifications.filter(item => item.status === 'queued').length;
  const canViewDashboard = isManager;
  const canEditAbsence = isManager || userRole === 'dept';

  const handleApproveRequest = useCallback((requestId: string) => {
    const req = schedule.slotRequests.find(r => r.id === requestId);
    if (!req) return;

    const release = schedule.releasedSlots.find(r => r.id === req.releaseId);
    const ownerDeptName = release?.ownerDeptName ?? '当該診療科';
    const roomName = `手術室${req.roomId.replace('or', '')}`;

    schedule.approveRequest(requestId);
    queueDepartmentNotifications({
      ownerDeptName,
      requestingDeptName: req.requestingDeptName,
      date: req.date,
      roomName,
      startHour: Number(req.wantedStartTime.split(':')[0]),
      endHour: Number(req.wantedEndTime.split(':')[0]),
    });
  }, [schedule.approveRequest, schedule.releasedSlots, schedule.slotRequests, notificationCadence]);

  const workflowSteps = [
    {
      id: 'myslots' as const,
      label: 'Step 1',
      title: '自科の枠を確認',
      description: '保有枠の状態と共有予定を確認して、空きが出る枠を登録します。',
      action: '自科の枠を開く',
    },
    {
      id: 'schedule' as const,
      label: 'Step 2',
      title: '週次グリッドで手術を入力',
      description: '各日・各室の予定を見ながら、手術や不在を追加して確定させます。',
      action: '週次グリッドへ',
    },
    {
      id: 'board' as const,
      label: 'Step 3',
      title: '空き枠を引き受ける',
      description: '他科の解放枠を見て、必要なときに自科で引き受けます。',
      action: '空き枠ボードへ',
    },
  ];

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

          <div className={`flex items-center gap-2 ml-2 rounded-xl px-3 py-1.5 border ${userRole === 'manager' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
            <span className="text-xs text-gray-500 whitespace-nowrap">立場:</span>
            <span className={`text-sm font-bold ${userRole === 'manager' ? 'text-blue-700' : 'text-gray-800'}`}>
              {userRole === 'manager' ? '手術室管理者' : `${activeDept?.name ?? '診療科'} 部長`}
            </span>
          </div>

          {userRole === 'dept' && (
            <div className="flex items-center gap-2 ml-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <span className="text-xs text-gray-500 whitespace-nowrap">診療科:</span>
              <select
                className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
                value={activeDeptId}
                onChange={e => handleDeptSecurityChange(e.target.value)}
              >
                {schedule.departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {userRole === 'manager' && (
            <>
              <div className="flex items-center gap-2 ml-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-gray-500 whitespace-nowrap">全科通知:</span>
                <select
                  className="text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                  value={notificationCadence}
                  onChange={e => handleNotificationCadenceChange(e.target.value as NotificationCadence)}
                >
                  <option value="instant">その都度</option>
                  <option value="30m">30分おき</option>
                  <option value="1h">1時間おき</option>
                  <option value="6h">6時間おき</option>
                </select>
              </div>

              <div className="flex items-center gap-2 ml-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
                <span className="text-xs text-indigo-700 whitespace-nowrap">更新周期:</span>
                <select
                  className="text-sm font-bold text-indigo-800 bg-transparent focus:outline-none cursor-pointer"
                  value={updateCycle}
                  onChange={e => handleUpdateCycleChange(e.target.value as UpdateCycle)}
                >
                  <option value="annual">年次更新</option>
                  <option value="quarterly">3か月更新</option>
                  <option value="halfyearly">6か月更新</option>
                </select>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setIsLoggedIn(false);
              setLoginError('');
            }}
            className="ml-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            ログイン切替
          </button>

          {/* View tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 ml-2">
            <button
              onClick={() => setView('myslots')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'myslots' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              1. 自科の枠
            </button>
            <button
              onClick={() => setView('schedule')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              2. 週次グリッド
            </button>
            {canViewDashboard && (
              <button
                onClick={() => setView('board')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1 ${view === 'board' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                3. 空き枠ボード
                {openSlotCount > 0 && (
                  <span className="w-4 h-4 flex items-center justify-center bg-red-500 text-white text-xs rounded-full">{openSlotCount}</span>
                )}
              </button>
            )}
            <button
              onClick={() => setView('competition')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === 'competition' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              4. 競争状況
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
            {canEditAbsence && (
              <button
                onClick={() => setShowAbsenceModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              >
                📅 不在登録
              </button>
            )}
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

        {userRole === 'dept' && deptInbox.length > 0 && (
          <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-700">通知一覧</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">{activeDept?.name ?? '診療科'} への通知</h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700 border border-indigo-200">{deptInbox.filter(n => n.status === 'sent').length}件送信済</span>
            </div>
            <div className="space-y-2">
              {deptInbox.map(item => (
                <div key={item.id} className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-800">{item.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {item.status === 'sent' ? '送信済' : '予約中'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{item.body}</p>
                  <p className="text-[10px] text-gray-400 mt-1">予定: {new Date(item.scheduledAt).toLocaleString('ja-JP')}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {userRole === 'manager' && managerNotificationsSummary > 0 && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">通知スケジュール</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">全診療科への通知待ち</h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">{managerNotificationsSummary}件</span>
            </div>
          </section>
        )}

        <section className="mb-5 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">入力の流れ</p>
              <h2 className="text-lg font-bold text-gray-900 mt-0.5">{isManager ? '全診療科での基本操作' : `${activeDept?.name ?? '診療科'}での基本操作`}</h2>
            </div>
            <span className="text-xs text-gray-500 bg-white/80 border border-gray-200 rounded-full px-2.5 py-1">{isManager ? '全体の状況を見ながら運用します' : '最初にこの順番で進めると迷いにくいです'}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {workflowSteps.map((step) => {
              const active = view === step.id;
              return (
                <button
                  key={step.id}
                  onClick={() => setView(step.id)}
                  className={`text-left rounded-xl border p-3.5 transition-all ${
                    active
                      ? 'border-blue-300 bg-white shadow-sm ring-2 ring-blue-100'
                      : 'border-gray-200 bg-white/70 hover:border-blue-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-blue-700">{step.label}</span>
                    <span className="text-[10px] text-gray-400">{step.action}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-gray-800">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{step.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {!isManager && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-700">競争状況</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">全員共有の枠獲得状況を確認したいときは別画面へ</h3>
              </div>
              <button
                type="button"
                onClick={() => setView('competition')}
                className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
              >
                競争状況を見る
              </button>
            </div>
          </div>
        )}

        {view === 'competition' && (
          <section className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-700">全員共有の競争状況</p>
                <h3 className="text-base font-bold text-gray-900 mt-0.5">枠を獲得した診療科の詳細</h3>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-red-700 border border-red-200">詳細閲覧</span>
            </div>
            <div className="mt-3 space-y-2">
              {schedule.releasedSlots.filter(r => r.claimedByDeptId).length === 0 ? (
                <p className="text-sm text-gray-600">まだ誰も枠を獲得していません。最初の引き受けが競争の始まりです。</p>
              ) : (
                schedule.releasedSlots
                  .filter(r => r.claimedByDeptId)
                  .sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))
                  .map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-3 py-2">
                      <div>
                        <div className="text-sm font-bold text-gray-800">{r.ownerDeptName} → {r.claimedByDeptName}</div>
                        <div className="text-[11px] text-gray-500">{r.date} · 手術室{r.roomId.replace('or', '')} · {r.startHour}:00–{r.endHour}:00</div>
                      </div>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">獲得</span>
                    </div>
                  ))
              )}
            </div>
          </section>
        )}

        <section className="mb-5 grid gap-3 md:grid-cols-[1.4fr_1.1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">自分の立場</p>
                <h3 className="text-base font-bold text-gray-900">{activeDept?.name ?? '診療科'} の現況</h3>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold text-blue-700">当事者</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="text-[10px] text-blue-600 font-bold uppercase tracking-[0.08em]">保有枠</div>
                <div className="mt-1 text-xl font-bold text-blue-700">{ownedByMe}</div>
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
                <div className="text-[10px] text-purple-600 font-bold uppercase tracking-[0.08em]">共有中</div>
                <div className="mt-1 text-xl font-bold text-purple-700">{releasedByMe}</div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-[0.08em]">引受済</div>
                <div className="mt-1 text-xl font-bold text-emerald-700">{claimedByMe}</div>
              </div>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3">
                <div className="text-[10px] text-cyan-600 font-bold uppercase tracking-[0.08em]">他科枠獲得</div>
                <div className="mt-1 text-xl font-bold text-cyan-700">{acquiredFromOtherDepts}</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <div className="text-[10px] text-amber-600 font-bold uppercase tracking-[0.08em]">申請中</div>
                <div className="mt-1 text-xl font-bold text-amber-700">{myPendingRequests}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">編集権限</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-blue-800">当事者</span>
                  <span className="text-[10px] text-blue-700 bg-white px-2 py-0.5 rounded-full">自科のみ</span>
                </div>
                <p className="mt-1 text-xs text-blue-700">自科の保有枠を共有・取消・申請の判定まで操作できます。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">他科</span>
                  <span className="text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded-full">閲覧 + 申請</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">共有中の枠は申請・引き受けだけ可能で、当事者にのみ決定権があります。</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 自科の枠ビュー ── */}
        {view === 'myslots' && (
          <DeptSlotView
            activeDeptId={activeDeptId}
            currentUserRole={userRole}
            departments={schedule.departments}
            allocations={schedule.allocations}
            surgeries={schedule.surgeries}
            releasedSlots={schedule.releasedSlots}
            slotRequests={schedule.slotRequests}
            onReleaseSlot={schedule.releaseSlot}
            onCancelRelease={schedule.cancelRelease}
            onSubmitRequest={schedule.submitRequest}
            onApproveRequest={handleApproveRequest}
            onRejectRequest={schedule.rejectRequest}
            onCancelRequest={schedule.cancelRequest}
          />
        )}

        {view === 'competition' && (
          <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-700">競争状況詳細</p>
                <h3 className="text-lg font-bold text-gray-900 mt-0.5">全診療科の枠獲得履歴</h3>
              </div>
            </div>
            <div className="space-y-2">
              {schedule.releasedSlots.filter(r => r.claimedByDeptId).length === 0 ? (
                <p className="text-sm text-gray-600">まだ引き受けられた枠はありません。</p>
              ) : (
                schedule.releasedSlots
                  .filter(r => r.claimedByDeptId)
                  .sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))
                  .map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                      <div>
                        <div className="text-sm font-bold text-gray-800">{r.ownerDeptName} → {r.claimedByDeptName}</div>
                        <div className="text-[11px] text-gray-500">{r.date} · 手術室{r.roomId.replace('or', '')} · {r.startHour}:00–{r.endHour}:00</div>
                      </div>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">獲得済</span>
                    </div>
                  ))
              )}
            </div>
          </section>
        )}

        {userRole === 'dept' && !canViewDashboard && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            部長権限では全体ダッシュボードは表示されません。自科の枠と週次グリッドのみを確認できます。
          </div>
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
              currentUserRole={userRole}
              currentDeptId={activeDeptId}
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
        {view === 'board' && canViewDashboard && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <OpenSlotBoard
              releasedSlots={schedule.releasedSlots}
              absences={absences}
              departments={schedule.departments}
              rooms={schedule.rooms}
              allocations={schedule.allocations}
              surgeries={schedule.surgeries}
              currentUserRole={userRole}
              currentDeptId={activeDeptId}
              notificationCadence={notificationCadence}
              slotRequests={schedule.slotRequests}
              onClaim={schedule.claimSlot}
              onCancelRelease={schedule.cancelRelease}
              onApproveRequest={handleApproveRequest}
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
          defaultDeptId={userRole === 'manager' ? (schedule.departments[0]?.id ?? activeDeptId) : activeDeptId}
          managerMode={userRole === 'manager'}
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
