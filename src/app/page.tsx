'use client';

import { useState, useEffect, useCallback } from 'react';
import { addWeeks, subWeeks, format } from 'date-fns';
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
import ManagerWeekOverview from '@/components/ManagerWeekOverview';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import ContributionBoard from '@/components/ContributionBoard';
import RecruitBanner from '@/components/RecruitBanner';
import SurgeryImportModal from '@/components/SurgeryImportModal';
import { useEventLog } from '@/hooks/useEventLog';
import { computeContributions, rankOf } from '@/lib/contribution';
import { writeDemoDataset } from '@/lib/storage';
import { logEvent, setActor } from '@/lib/eventLog';
import { generateId, getOperatingWeekStart, getActiveRecruitWeek } from '@/lib/utils';

type View = 'overview' | 'schedule' | 'myslots' | 'board' | 'analytics';
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
  const [weekStart, setWeekStart] = useState(getOperatingWeekStart());
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [view, setView] = useState<View>('board');
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSurgeryImport, setShowSurgeryImport] = useState(false);
  const [toast, setToast] = useState('');
  const events = useEventLog();
  const [showMasterModal, setShowMasterModal] = useState(false);

  // ログイン中の立場（デモ用）
  const [userRole, setUserRole] = useState<UserRole>('dept');
  const [activeDeptId, setActiveDeptId] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginRole, setLoginRole] = useState<UserRole>('dept');
  const [loginDeptId, setLoginDeptId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [pendingDeptId, setPendingDeptId] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [notificationCadence, setNotificationCadence] = useState<NotificationCadence>('instant');
  const [updateCycle, setUpdateCycle] = useState<UpdateCycle>('annual');
  const [deptNotifications, setDeptNotifications] = useState<DeptNotification[]>([]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    const savedLoggedIn = localStorage.getItem('or_logged_in') === 'true';
    if (savedRole === 'manager' || savedRole === 'dept') {
      setUserRole(savedRole);
      setLoginRole(savedRole);
      setView(savedRole === 'manager' ? 'overview' : 'myslots');
    }
    if (savedLoggedIn) {
      setIsLoggedIn(true);
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
    const dept = schedule.departments.find(d => d.id === activeDeptId);
    setActor(isLoggedIn
      ? { role: userRole, deptId: userRole === 'dept' ? activeDeptId : undefined, deptName: userRole === 'dept' ? dept?.name : undefined }
      : { role: 'unknown' });
  }, [isLoggedIn, userRole, activeDeptId, schedule.departments]);

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

    setPendingDeptId(nextDeptId);
    setSwitchPassword('');
    setSwitchError('');
  }

  function confirmDeptSwitch() {
    if (switchPassword !== '1234') {
      logEvent('dept_switch_failed', { toDeptId: pendingDeptId });
      setSwitchError('パスワードが一致しないため、他診療科への切替はできません。');
      return;
    }
    logEvent('dept_switch', { fromDeptId: activeDeptId, toDeptId: pendingDeptId });
    handleDeptChange(pendingDeptId);
    cancelDeptSwitch();
  }

  function cancelDeptSwitch() {
    setPendingDeptId('');
    setSwitchPassword('');
    setSwitchError('');
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

      if (loginPassword !== '1234') {
        logEvent('login_failed', { role: loginRole, deptId: loginDeptId });
        setLoginError('パスワードが一致しないため入室できません。');
        return;
      }
    }

    setLoginError('');
    setLoginPassword('');
    const nextDeptId = loginRole === 'dept' ? loginDeptId : (activeDeptId || schedule.departments[0]?.id || '');

    const loginDept = schedule.departments.find(d => d.id === nextDeptId);
    setActor(loginRole === 'dept' ? { role: 'dept', deptId: nextDeptId, deptName: loginDept?.name } : { role: 'manager' });
    logEvent('login', { role: loginRole, deptId: loginRole === 'dept' ? nextDeptId : undefined });
    setUserRole(loginRole);
    setActiveDeptId(nextDeptId);
    setView(loginRole === 'manager' ? 'overview' : 'myslots');
    localStorage.setItem('or_user_role', loginRole);
    localStorage.setItem('or_logged_in', 'true');
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

  function logAbsence(absence: Absence, via: 'manual' | 'import') {
    const days = Math.round((new Date(`${absence.endDate}T00:00:00`).getTime() - new Date(`${absence.startDate}T00:00:00`).getTime()) / 86400000) + 1;
    logEvent('absence_registered', {
      absenceId: absence.id, deptId: absence.deptId, reason: absence.reason, reasonType: absence.reasonType,
      startDate: absence.startDate, endDate: absence.endDate, days, via,
    });
  }

  const saveAbsence = useCallback((absence: Omit<Absence, 'id' | 'createdAt'>) => {
    const newAbsence: Absence = { ...absence, id: generateId(), createdAt: new Date().toISOString() };
    logAbsence(newAbsence, 'manual');
    setAbsences(prev => {
      const next = [...prev, newAbsence];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
    applyAutoReleaseForAbsence(absence);
  }, [applyAutoReleaseForAbsence]);

  const importAbsences = useCallback((items: Omit<Absence, 'id' | 'createdAt'>[]) => {
    const newItems: Absence[] = items.map(a => ({ ...a, id: generateId(), createdAt: new Date().toISOString() }));
    newItems.forEach(a => logAbsence(a, 'import'));
    setAbsences(prev => {
      const next = [...prev, ...newItems];
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
    items.forEach(item => applyAutoReleaseForAbsence(item));
  }, [applyAutoReleaseForAbsence]);

  const deleteAbsence = useCallback((id: string) => {
    const target = absences.find(a => a.id === id);
    if (target) logEvent('absence_deleted', { absenceId: id, deptId: target.deptId, reason: target.reason, startDate: target.startDate, endDate: target.endDate });
    setAbsences(prev => {
      const next = prev.filter(a => a.id !== id);
      localStorage.setItem('or_absences', JSON.stringify(next));
      return next;
    });
  }, [absences]);

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
              <div className="space-y-4">
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

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">パスワード</label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-800 focus:border-blue-400 focus:outline-none"
                    value={loginPassword}
                    onChange={e => {
                      setLoginPassword(e.target.value);
                      setLoginError('');
                    }}
                    placeholder="1234"
                    autoComplete="current-password"
                  />
                </div>
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

  const isManager = userRole === 'manager';
  const activeDept = schedule.departments.find(d => d.id === activeDeptId);
  const pendingRequests = schedule.slotRequests.filter(r => r.status === 'pending');
  const pendingApprovalCount = pendingRequests.length;
  const queuedNotificationCount = deptNotifications.filter(item => item.status === 'queued').length;

  // 診療科部長向けの自科サマリー
  const ownedByMe = schedule.allocations.filter(a => a.deptId === activeDeptId).length;
  const sharingByMe = schedule.releasedSlots.filter(r => r.ownerDeptId === activeDeptId && !r.claimedByDeptId).length;
  const acquiredFromOtherDepts = schedule.releasedSlots.filter(r => r.claimedByDeptId === activeDeptId && r.ownerDeptId !== activeDeptId).length;
  const myPendingRequests = pendingRequests.filter(r => r.requestingDeptId === activeDeptId).length;
  const deptInbox = deptNotifications
    .filter(item => item.deptId === activeDeptId && item.status === 'sent')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  // 募集期間の対象週（期間外は次の週）で、まだ埋まっていない共有枠
  const recruitWeek = getActiveRecruitWeek()?.weekStart ?? getOperatingWeekStart();
  const recruitWeekEnd = format(new Date(recruitWeek.getTime() + 6 * 86400000), 'yyyy-MM-dd');
  const recruitWeekStartStr = format(recruitWeek, 'yyyy-MM-dd');
  const recruitOpenSlots = schedule.releasedSlots.filter(r => !r.claimedByDeptId && r.date >= recruitWeekStartStr && r.date <= recruitWeekEnd);
  const contributions = computeContributions(schedule.departments, events);
  const myContribution = contributions.find(c => c.dept.id === activeDeptId);
  const myRank = rankOf(contributions.filter(c => c.score > 0), activeDeptId);

  function approveWithToast(requestId: string) {
    const req = schedule.slotRequests.find(r => r.id === requestId);
    handleApproveRequest(requestId);
    if (req) setToast(`✅ 承認しました：${req.requestingDeptName} がこの枠を使います（各科に通知されます）`);
  }

  function rejectWithToast(requestId: string) {
    const req = schedule.slotRequests.find(r => r.id === requestId);
    schedule.rejectRequest(requestId);
    if (req) setToast(`却下しました：${req.requestingDeptName} の申請`);
  }

  function claimWithToast(releaseId: string, deptId: string, deptName: string) {
    handleClaimSlot(releaseId, deptId, deptName);
    setToast(isManager ? `✅ ${deptName} に割り当てました` : '📨 申請しました。手術室の管理者が承認すると確定します');
  }

  function handleResetDemo() {
    if (!window.confirm('デモデータに戻します。取り込んだ予定や操作の記録は消えます。よろしいですか？')) return;
    writeDemoDataset();
    logEvent('demo_reset');
    window.location.reload();
  }

  function handleLogout() {
    logEvent('logout');
    setIsLoggedIn(false);
    localStorage.setItem('or_logged_in', 'false');
    setLoginError('');
  }

  function handleApproveRequest(requestId: string) {
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
  }

  // 部長の「引き受け」は承認待ちの申請として登録し、手術室管理者の承認で確定する
  function handleClaimSlot(releaseId: string, deptId: string, deptName: string) {
    const release = schedule.releasedSlots.find(r => r.id === releaseId);
    if (!release || release.claimedByDeptId) return;

    if (isManager) {
      schedule.claimSlot(releaseId, deptId, deptName);
      queueDepartmentNotifications({
        ownerDeptName: release.ownerDeptName,
        requestingDeptName: deptName,
        date: release.date,
        roomName: `手術室${release.roomId.replace('or', '')}`,
        startHour: release.startHour,
        endHour: release.endHour,
      });
      return;
    }

    const alreadyRequested = schedule.slotRequests.some(
      r => r.releaseId === releaseId && r.requestingDeptId === deptId && r.status === 'pending',
    );
    if (alreadyRequested) return;

    schedule.submitRequest({
      releaseId,
      date: release.date,
      roomId: release.roomId,
      requestingDeptId: deptId,
      requestingDeptName: deptName,
      procedure: '',
      surgeonName: '',
      wantedStartTime: release.availStartTime ?? `${release.startHour}:00`,
      wantedEndTime: release.availEndTime ?? `${release.endHour}:00`,
      notes: '引き受け申請',
    });
  }

  const tabs: Array<{ id: View; label: string; badge?: number; badgeTone?: 'amber' | 'red' }> = isManager
    ? [
        { id: 'overview', label: '🏠 空き状況' },
        { id: 'board', label: '✅ 申請の承認', badge: pendingApprovalCount, badgeTone: 'amber' },
        { id: 'schedule', label: '📅 予定表' },
        { id: 'analytics', label: '📊 集計' },
      ]
    : [
        { id: 'myslots', label: '🏠 自分の科', badge: myPendingRequests, badgeTone: 'amber' },
        { id: 'schedule', label: '📅 予定表' },
      ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">OR</span>
            </div>
            <h1 className="hidden sm:block text-base font-bold text-gray-900 leading-none">OR スケジューラ</h1>
          </div>

          {/* 立場（部長は所属科もここで切替） */}
          {isManager ? (
            <span className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-bold text-blue-700">手術室管理者</span>
          ) : (
            <div className="flex items-center gap-1 rounded-xl bg-gray-50 border border-gray-200 px-3 py-1.5">
              <select
                aria-label="所属診療科"
                className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none cursor-pointer"
                value={activeDeptId}
                onChange={e => handleDeptSecurityChange(e.target.value)}
              >
                {schedule.departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <span className="text-sm font-bold text-gray-800">部長</span>
            </div>
          )}

          {!isManager && pendingDeptId && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <span className="text-xs text-amber-700 whitespace-nowrap">
                {schedule.departments.find(d => d.id === pendingDeptId)?.name ?? '他診療科'}へ切替:
              </span>
              <input
                type="password"
                autoFocus
                className="w-24 rounded-lg border border-amber-200 bg-white px-2 py-1 text-sm focus:border-amber-400 focus:outline-none"
                value={switchPassword}
                onChange={e => {
                  setSwitchPassword(e.target.value);
                  setSwitchError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmDeptSwitch();
                  if (e.key === 'Escape') cancelDeptSwitch();
                }}
                placeholder="パスワード"
                autoComplete="current-password"
              />
              <button type="button" onClick={confirmDeptSwitch} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-2 py-1">
                切替
              </button>
              <button type="button" onClick={cancelDeptSwitch} className="text-xs text-gray-500 hover:text-gray-700">
                取消
              </button>
              {switchError && <span className="text-xs font-medium text-red-600">{switchError}</span>}
            </div>
          )}

          {/* View tabs */}
          <nav className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`px-4 py-2 text-base font-bold rounded-md transition-colors flex items-center gap-1.5 ${view === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.label}
                {!!tab.badge && (
                  <span className={`min-w-4 h-4 px-1 flex items-center justify-center text-white text-[10px] font-bold rounded-full ${tab.badgeTone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Week nav (schedule view only) */}
          {view === 'schedule' && (
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="前の週">←</button>
              <button onClick={() => setWeekStart(getOperatingWeekStart())} className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">今週</button>
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">{format(weekStart, 'M/d', { locale: ja })} 週</span>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="次の週">→</button>
            </div>
          )}

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            {isManager && (
              <>
                <button
                  onClick={() => setShowSurgeryImport(true)}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  📥 予定表を取り込む
                </button>
                <button
                  onClick={() => setShowMasterModal(true)}
                  className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
                >
                  ⚙ 枠の設定
                </button>
              </>
            )}
            <button
              onClick={() => setShowAbsenceModal(true)}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
            >
              📅 不在登録
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        <RecruitBanner
          openSlotCount={recruitOpenSlots.length}
          onShow={() => setView(isManager ? 'overview' : 'myslots')}
          actionLabel={isManager ? '空き状況を見る' : '空き枠を見る'}
        />

        {/* ── 管理者: 承認待ちをどの画面からでもワンクリックで処理 ── */}
        {isManager && pendingApprovalCount > 0 && view !== 'board' && (
          <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-lg font-bold text-amber-900">👉 今やること：申請が {pendingApprovalCount}件 届いています</h3>
              <button type="button" onClick={() => setView('board')} className="text-sm font-bold text-amber-700 hover:underline">
                くわしく見る →
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pendingRequests.map(req => {
                const release = schedule.releasedSlots.find(r => r.id === req.releaseId);
                const competing = pendingRequests.filter(r => r.releaseId === req.releaseId).length;
                return (
                  <div key={req.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-gray-800 truncate">{req.requestingDeptName} が使いたい</p>
                      <p className="text-xs text-gray-500">元は {release?.ownerDeptName ?? '—'} の枠</p>
                      <p className="text-[11px] text-gray-500">
                        {format(new Date(`${req.date}T00:00:00`), 'M/d(E)', { locale: ja })} · 手術室{req.roomId.replace('or', '')} · {req.wantedStartTime}–{req.wantedEndTime}
                        {competing > 1 && <span className="ml-1 font-bold text-red-600">（{competing}科が希望・1科を選ぶ）</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => approveWithToast(req.id)} className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                        ⭕ 承認
                      </button>
                      <button type="button" onClick={() => rejectWithToast(req.id)} className="px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200">
                        ✕ 却下
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {isManager && pendingApprovalCount === 0 && view === 'overview' && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-800">
            ✅ いま承認が必要な申請はありません
          </div>
        )}

        {/* ── 部長: 自科サマリーと通知 ── */}
        {!isManager && (
          <section className="mb-5 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-blue-600 font-bold">保有枠（週）</div>
                <div className="mt-1 text-2xl font-bold text-blue-700">{ownedByMe}</div>
              </div>
              <div className="rounded-xl border border-purple-100 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-purple-600 font-bold">共有中</div>
                <div className="mt-1 text-2xl font-bold text-purple-700">{sharingByMe}</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-amber-600 font-bold">承認待ちの申請</div>
                <div className="mt-1 text-2xl font-bold text-amber-700">{myPendingRequests}</div>
              </div>
              <div className="rounded-xl border border-cyan-100 bg-white p-3 shadow-sm">
                <div className="text-[11px] text-cyan-600 font-bold">他科から獲得</div>
                <div className="mt-1 text-2xl font-bold text-cyan-700">{acquiredFromOtherDepts}</div>
              </div>
              {myContribution && myContribution.score > 0 && (
                <div className="col-span-2 md:col-span-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  🏆 最近30日で <b>{myContribution.filled}枠</b> を埋め、<b>{myContribution.shared}枠</b> を早めに共有しました（全科で <b>{myRank}位</b>）。ご協力ありがとうございます。
                </div>
              )}
            </div>
            <div className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-bold text-indigo-600 mb-1.5">{activeDept?.name ?? '自科'}へのお知らせ</p>
              {deptInbox.length === 0 ? (
                <p className="text-xs text-gray-400">新しいお知らせはありません</p>
              ) : (
                <ul className="space-y-1">
                  {deptInbox.map(item => (
                    <li key={item.id} className="text-xs text-gray-700 leading-snug">
                      <span className="text-gray-400 mr-1">{format(new Date(item.createdAt), 'M/d HH:mm', { locale: ja })}</span>
                      {item.body}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ── 管理者: 全体の空き状況 ── */}
        {view === 'overview' && isManager && (
          <ManagerWeekOverview
            allocations={schedule.allocations}
            surgeries={schedule.surgeries}
            releasedSlots={schedule.releasedSlots}
            slotRequests={schedule.slotRequests}
            departments={schedule.departments}
            rooms={schedule.rooms}
            onOpenBoard={() => setView('board')}
          />
        )}
        {view === 'overview' && isManager && (
          <ContributionBoard departments={schedule.departments} />
        )}

        {/* ── 部長: 自科の枠 ── */}
        {view === 'myslots' && !isManager && (
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
            onSubmitRequest={req => {
              schedule.submitRequest(req);
              setToast('📨 申請しました。手術室の管理者が承認すると確定します');
            }}
            onApproveRequest={handleApproveRequest}
            onRejectRequest={schedule.rejectRequest}
            onCancelRequest={id => {
              schedule.cancelRequest(id);
              setToast('申請を取り消しました');
            }}
          />
        )}
        {view === 'myslots' && !isManager && (
          <div className="mt-5">
            <ContributionBoard departments={schedule.departments} highlightDeptId={activeDeptId} />
          </div>
        )}

        {/* ── 週次グリッド ── */}
        {view === 'schedule' && (
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
            slotRequests={schedule.slotRequests}
            onClaimSlot={claimWithToast}
            onCancelRelease={schedule.cancelRelease}
          />
        )}

        {/* ── 管理者: 承認・空き枠 ── */}
        {view === 'board' && isManager && (
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
              onClaim={claimWithToast}
              onCancelRelease={schedule.cancelRelease}
              onApproveRequest={approveWithToast}
              onRejectRequest={rejectWithToast}
            />
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">登録済み不在・学会</h3>
                  <p className="text-xs text-gray-500 mt-0.5">登録すると該当する枠が自動で共有されます</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 rounded-lg border border-green-200 transition-colors"
                  >
                    まとめて登録
                  </button>
                  <button
                    onClick={() => setShowAbsenceModal(true)}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                  >
                    ＋ 追加
                  </button>
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {absences.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <div className="text-2xl mb-2">📅</div>
                    登録された不在はありません
                  </div>
                ) : (
                  [...absences].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(absence => (
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

        {/* ── 管理者: 分析 ── */}
        {view === 'analytics' && isManager && (
          <AnalyticsDashboard
            departments={schedule.departments}
            releasedSlots={schedule.releasedSlots}
            queuedNotifications={queuedNotificationCount}
            notificationCadence={notificationCadence}
            updateCycle={updateCycle}
            onNotificationCadenceChange={handleNotificationCadenceChange}
            onUpdateCycleChange={handleUpdateCycleChange}
            onOpenImport={() => setShowSurgeryImport(true)}
            onResetDemo={handleResetDemo}
          >
            <ContributionBoard departments={schedule.departments} limit={12} />
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-gray-900">稼働率（{format(weekStart, 'M/d', { locale: ja })} 週）</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="前の週">←</button>
                  <button onClick={() => setWeekStart(getOperatingWeekStart())} className="px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">今週</button>
                  <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="次の週">→</button>
                </div>
              </div>
              <StatsBar
                weekStart={weekStart}
                allocations={schedule.allocations}
                surgeries={schedule.surgeries}
                releasedSlots={schedule.releasedSlots}
              />
              <DeptRanking
                weekStart={weekStart}
                allocations={schedule.allocations}
                surgeries={schedule.surgeries}
                releasedSlots={schedule.releasedSlots}
                slotRequests={schedule.slotRequests}
                departments={schedule.departments}
              />
            </section>
          </AnalyticsDashboard>
        )}
      </main>

      {/* ── Modals ── */}
      {showAbsenceModal && (
        <AbsenceModal
          departments={schedule.departments}
          defaultDeptId={isManager ? (schedule.departments[0]?.id ?? activeDeptId) : activeDeptId}
          managerMode={isManager}
          onSave={saveAbsence}
          onClose={() => setShowAbsenceModal(false)}
        />
      )}
      {showImportModal && isManager && (
        <AbsenceImportModal
          departments={schedule.departments}
          onImport={importAbsences}
          onClose={() => setShowImportModal(false)}
        />
      )}
      {showSurgeryImport && isManager && (
        <SurgeryImportModal
          departments={schedule.departments}
          rooms={schedule.rooms}
          allocations={schedule.allocations}
          existingSurgeries={schedule.surgeries}
          onImport={(dates, items) => {
            schedule.replaceSurgeriesForDates(dates, items);
            setToast(`✅ 予定表を取り込みました（${items.length}件・${dates.length}日分）`);
          }}
          onClose={() => setShowSurgeryImport(false)}
        />
      )}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-gray-900 px-6 py-4 text-base font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}
      {showMasterModal && isManager && (
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
