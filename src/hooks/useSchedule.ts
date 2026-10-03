'use client';

import { useState, useEffect, useCallback } from 'react';
import { Department, OperatingRoom, SlotAllocation, Surgery, ReleasedSlot, SlotRequest } from '@/lib/types';
import { storage } from '@/lib/storage';
import { generateId } from '@/lib/utils';

export function useSchedule() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<OperatingRoom[]>([]);
  const [allocations, setAllocations] = useState<SlotAllocation[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [releasedSlots, setReleasedSlots] = useState<ReleasedSlot[]>([]);
  const [slotRequests, setSlotRequests] = useState<SlotRequest[]>([]);
  const [initialized, setInitialized] = useState(false);

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
    setSurgeries(prev => {
      const next = [...prev, newSurgery];
      storage.saveSurgeries(next);
      return next;
    });
    return newSurgery;
  }, []);

  const updateSurgery = useCallback((id: string, updates: Partial<Surgery>) => {
    setSurgeries(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      storage.saveSurgeries(next);
      return next;
    });
  }, []);

  const deleteSurgery = useCallback((id: string) => {
    setSurgeries(prev => {
      const next = prev.filter(s => s.id !== id);
      storage.saveSurgeries(next);
      return next;
    });
  }, []);

  const saveAllocations = useCallback((next: SlotAllocation[]) => {
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
    setSlotRequests(prev => {
      const next = [...prev, newReq];
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  // 申請を承認（交渉結果の確定）
  const approveRequest = useCallback((requestId: string) => {
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
    setSlotRequests(prev => {
      const next = prev.map(r => r.id === requestId ? { ...r, status: 'rejected' as const } : r);
      storage.saveSlotRequests(next);
      return next;
    });
  }, []);

  // 申請キャンセル（申請者自身が取り消し）
  const cancelRequest = useCallback((requestId: string) => {
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
    addSurgery, updateSurgery, deleteSurgery,
    saveAllocations, addAllocation, deleteAllocation,
    releaseSlot, claimSlot, cancelRelease,
    submitRequest, approveRequest, rejectRequest, cancelRequest,
  };
}
