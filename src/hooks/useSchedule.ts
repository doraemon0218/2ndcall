'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Department, OperatingRoom, SlotAllocation, Surgery, ReleasedSlot, SlotRequest } from '@/lib/types';
import { storage } from '@/lib/storage';
import { generateId } from '@/lib/utils';
import { logEvent } from '@/lib/eventLog';

function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86400000);
}

export function useSchedule() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<OperatingRoom[]>([]);
  const [allocations, setAllocations] = useState<SlotAllocation[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [releasedSlots, setReleasedSlots] = useState<ReleasedSlot[]>([]);
  const [slotRequests, setSlotRequests] = useState<SlotRequest[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ログ記録用に最新状態を参照する（state 更新関数の外で記録するため）
  const latest = useRef({ surgeries, releasedSlots, slotRequests });
  useEffect(() => {
    latest.current = { surgeries, releasedSlots, slotRequests };
  }, [surgeries, releasedSlots, slotRequests]);

  useEffect(() => {
    setDepartments(storage.getDepartments());
    setRooms(storage.getRooms());
    setAllocations(storage.getAllocations());
    setSurgeries(storage.getSurgeries());
    setReleasedSlots(storage.getReleasedSlots());
    setSlotRequests(storage.getSlotRequests());
    setInitialized(true);
  }, []);

  const addSurgery = useCallback((surgery: Omit<Surgery, 'id'>) => {
    const newSurgery = { ...surgery, id: generateId() };
    logEvent('surgery_added', {
      surgeryId: newSurgery.id, date: surgery.date, roomId: surgery.roomId, deptId: surgery.deptId,
      startTime: surgery.startTime, endTime: surgery.endTime, procedure: surgery.procedure,
      isEmergency: surgery.isEmergency, allocationId: surgery.allocationId,
    });
    setSurgeries(prev => {
      const next = [...prev, newSurgery];
      storage.saveSurgeries(next);
      return next;
    });
    return newSurgery;
  }, []);

  const updateSurgery = useCallback((id: string, updates: Partial<Surgery>) => {
    const before = latest.current.surgeries.find(s => s.id === id);
    logEvent('surgery_updated', {
      surgeryId: id, date: before?.date, roomId: before?.roomId, deptId: before?.deptId,
      prevStatus: before?.status, status: updates.status ?? before?.status,
      startTime: updates.startTime ?? before?.startTime, endTime: updates.endTime ?? before?.endTime,
    });
    setSurgeries(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      storage.saveSurgeries(next);
      return next;
    });
  }, []);

  const deleteSurgery = useCallback((id: string) => {
    const before = latest.current.surgeries.find(s => s.id === id);
    logEvent('surgery_deleted', {
      surgeryId: id, date: before?.date, roomId: before?.roomId, deptId: before?.deptId,
      startTime: before?.startTime, endTime: before?.endTime, procedure: before?.procedure, status: before?.status,
    });
    setSurgeries(prev => {
      const next = prev.filter(s => s.id !== id);
      storage.saveSurgeries(next);
      return next;
    });
  }, []);

  // 予定表の取り込み：指定日の手術予定をすべて入れ替える（上書き）
  const replaceSurgeriesForDates = useCallback((dates: string[], incoming: Omit<Surgery, 'id'>[]) => {
    const dateSet = new Set(dates);
    const replaced = latest.current.surgeries.filter(s => dateSet.has(s.date)).length;
    logEvent('schedule_imported', {
      dates: dates.length, firstDate: dates[0], lastDate: dates[dates.length - 1],
      imported: incoming.length, replaced,
    });
    setSurgeries(prev => {
      const next = [...prev.filter(s => !dateSet.has(s.date)), ...incoming.map(s => ({ ...s, id: generateId() }))];
      storage.saveSurgeries(next);
      return next;
    });
  }, []);

  const saveAllocations = useCallback((next: SlotAllocation[]) => {
    logEvent('allocations_updated', { count: next.length });
    setAllocations(next);
    storage.saveAllocations(next);
  }, []);

  const addAllocation = useCallback((alloc: Omit<SlotAllocation, 'id'>) => {
    setAllocations(prev => {
      const next = [...prev, { ...alloc, id: generateId() }];
      storage.saveAllocations(next);
      return next;
    });
  }, []);

  const deleteAllocation = useCallback((id: string) => {
    setAllocations(prev => {
      const next = prev.filter(a => a.id !== id);
      storage.saveAllocations(next);
      return next;
    });
  }, []);

  // 空き枠を解放
  const releaseSlot = useCallback((params: {
    allocationId: string; date: string; roomId: string;
    ownerDeptId: string; ownerDeptName: string;
    period: ReleasedSlot['period'];
    startHour: number; endHour: number;
    availStartTime?: string; availEndTime?: string;
    releasedBy: string; message: string;
    reasonType?: ReleasedSlot['reasonType'];
    reasonLabel?: string;
    source?: ReleasedSlot['source'];
  }) => {
    const newRelease: ReleasedSlot = { id: generateId(), ...params, status: 'open', releasedAt: new Date().toISOString() };
    logEvent('slot_released', {
      releaseId: newRelease.id, allocationId: params.allocationId, date: params.date, roomId: params.roomId,
      ownerDeptId: params.ownerDeptId, period: params.period, startHour: params.startHour, endHour: params.endHour,
      reasonType: params.reasonType, reasonLabel: params.reasonLabel, source: params.source ?? 'manual',
      leadDays: daysUntil(params.date),
    });
    setReleasedSlots(prev => {
      const filtered = prev.filter(r => !(r.allocationId === params.allocationId && r.date === params.date));
      const next = [...filtered, newRelease];
      storage.saveReleasedSlots(next);
      return next;
    });
  }, []);

  // 解放された枠に希望申請
  const submitRequest = useCallback((req: {
    releaseId: string; date: string; roomId: string;
    requestingDeptId: string; requestingDeptName: string;
    procedure: string; surgeonName: string;
    wantedStartTime: string; wantedEndTime: string;
    notes: string;
  }) => {
    const newReq: SlotRequest = { id: generateId(), ...req, requestedAt: new Date().toISOString(), status: 'pending' };
    const release = latest.current.releasedSlots.find(r => r.id === req.releaseId);
    logEvent('request_submitted', {
      requestId: newReq.id, releaseId: req.releaseId, date: req.date, roomId: req.roomId,
      ownerDeptId: release?.ownerDeptId, requestingDeptId: req.requestingDeptId,
      wantedStartTime: req.wantedStartTime, wantedEndTime: req.wantedEndTime,
      minutesSinceRelease: release ? minutesBetween(release.releasedAt, newReq.requestedAt) : null,
    });
    setSlotRequests(prev => {
      const next = [...prev, newReq];
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  // 申請を承認（交渉結果の確定）
  const approveRequest = useCallback((requestId: string) => {
    const target = latest.current.slotRequests.find(r => r.id === requestId);
    if (target) {
      const release = latest.current.releasedSlots.find(r => r.id === target.releaseId);
      const now = new Date().toISOString();
      const competitors = latest.current.slotRequests.filter(
        r => r.releaseId === target.releaseId && r.id !== requestId && r.status === 'pending',
      );
      logEvent('request_approved', {
        requestId, releaseId: target.releaseId, date: target.date, roomId: target.roomId,
        ownerDeptId: release?.ownerDeptId, requestingDeptId: target.requestingDeptId,
        competingRequests: competitors.length,
        minutesToDecision: minutesBetween(target.requestedAt, now),
        minutesSinceRelease: release ? minutesBetween(release.releasedAt, now) : null,
      });
      competitors.forEach(c => logEvent('request_rejected', {
        requestId: c.id, releaseId: c.releaseId, date: c.date, roomId: c.roomId,
        ownerDeptId: release?.ownerDeptId, requestingDeptId: c.requestingDeptId,
        reason: 'other_request_approved', minutesToDecision: minutesBetween(c.requestedAt, now),
      }));
    }
    setSlotRequests(prev => {
      const req = prev.find(r => r.id === requestId);
      if (!req) return prev;
      // 同じ枠への他の申請を却下
      const next = prev.map(r =>
        r.releaseId === req.releaseId
          ? { ...r, status: r.id === requestId ? 'approved' as const : 'rejected' as const }
          : r
      );
      storage.saveSlotRequests(next);
      // 解放枠にも引き受け診療科を記録
      setReleasedSlots(rs => {
        const updated = rs.map(r =>
          r.id === req.releaseId
            ? { ...r, claimedByDeptId: req.requestingDeptId, claimedByDeptName: req.requestingDeptName, claimedAt: new Date().toISOString() }
            : r
        );
        storage.saveReleasedSlots(updated);
        return updated;
      });
      return next;
    });
  }, []);

  // 申請を却下
  const rejectRequest = useCallback((requestId: string) => {
    const target = latest.current.slotRequests.find(r => r.id === requestId);
    if (target) {
      const release = latest.current.releasedSlots.find(r => r.id === target.releaseId);
      logEvent('request_rejected', {
        requestId, releaseId: target.releaseId, date: target.date, roomId: target.roomId,
        ownerDeptId: release?.ownerDeptId, requestingDeptId: target.requestingDeptId,
        reason: 'manager_rejected', minutesToDecision: minutesBetween(target.requestedAt, new Date().toISOString()),
      });
    }
    setSlotRequests(prev => {
      const next = prev.map(r => r.id === requestId ? { ...r, status: 'rejected' as const } : r);
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  // 申請キャンセル（申請者自身が取り消し）
  const cancelRequest = useCallback((requestId: string) => {
    const target = latest.current.slotRequests.find(r => r.id === requestId);
    if (target) {
      logEvent('request_cancelled', {
        requestId, releaseId: target.releaseId, date: target.date, roomId: target.roomId,
        requestingDeptId: target.requestingDeptId, status: target.status,
      });
    }
    setSlotRequests(prev => {
      const next = prev.filter(r => r.id !== requestId);
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  function buildTransferNotification(release: ReleasedSlot, nextDeptName: string) {
    const roomLabel = `手術室${release.roomId.replace('or', '')}`;
    const timeLabel = `${release.startHour}:00–${release.endHour}:00`;
    return `${release.date} ${roomLabel} ${timeLabel} の枠が、${release.ownerDeptName}から${nextDeptName}に移りました。ご協力ありがとうございます。`;
  }

  // 解放枠を直接引き受け（即時確定）
  const claimSlot = useCallback((releaseId: string, deptId: string, deptName: string) => {
    const release = latest.current.releasedSlots.find(r => r.id === releaseId);
    logEvent('slot_assigned', {
      releaseId, date: release?.date, roomId: release?.roomId, ownerDeptId: release?.ownerDeptId,
      claimedByDeptId: deptId, claimedByDeptName: deptName,
      minutesSinceRelease: release ? minutesBetween(release.releasedAt, new Date().toISOString()) : null,
    });
    setReleasedSlots(prev => {
      const next: ReleasedSlot[] = prev.map(r => {
        if (r.id !== releaseId) return r;
        const updated: ReleasedSlot = {
          ...r,
          status: 'done',
          claimedByDeptId: deptId,
          claimedByDeptName: deptName,
          claimedAt: new Date().toISOString(),
          message: r.message || buildTransferNotification(r, deptName),
        };
        return updated;
      });
      storage.saveReleasedSlots(next);
      return next;
    });
  }, []);

  // 解放キャンセル
  const cancelRelease = useCallback((releaseId: string) => {
    const release = latest.current.releasedSlots.find(r => r.id === releaseId);
    const relatedRequests = latest.current.slotRequests.filter(r => r.releaseId === releaseId);
    logEvent('release_cancelled', {
      releaseId, date: release?.date, roomId: release?.roomId, ownerDeptId: release?.ownerDeptId,
      period: release?.period, wasClaimed: !!release?.claimedByDeptId, claimedByDeptId: release?.claimedByDeptId,
      droppedRequests: relatedRequests.length,
      minutesSinceRelease: release ? minutesBetween(release.releasedAt, new Date().toISOString()) : null,
    });
    setReleasedSlots(prev => {
      const next = prev.filter(r => r.id !== releaseId);
      storage.saveReleasedSlots(next);
      return next;
    });
    // 関連申請も削除
    setSlotRequests(prev => {
      const next = prev.filter(r => r.releaseId !== releaseId);
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  return {
    departments, rooms, allocations, surgeries, releasedSlots, slotRequests, initialized,
    addSurgery, updateSurgery, deleteSurgery, replaceSurgeriesForDates,
    saveAllocations, addAllocation, deleteAllocation,
    releaseSlot, claimSlot, cancelRelease,
    submitRequest, approveRequest, rejectRequest, cancelRequest,
  };
}
