'use client';

import { Surgery, SlotAllocation, Department, ReleasedSlot, SlotRequest } from '@/lib/types';
import { buildWeeklySlots, getWeekDates, getDeptBgStyle } from '@/lib/utils';

interface Props {
  weekStart: Date;
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots: ReleasedSlot[];
  slotRequests?: SlotRequest[];
  departments: Department[];
}

interface DeptStats {
  dept: Department;
  ownAllocatedMin: number;
  ownUsedMin: number;
  ownRate: number;
  claimedSlots: number;
  releasedSlots: number;
  approvedRequests: number; // 交渉で勝ち取った他科枠
}

export default function DeptRanking({ weekStart, allocations, surgeries, releasedSlots, slotRequests = [], departments }: Props) {
  const weekDates = getWeekDates(weekStart);
  const slots = buildWeeklySlots(allocations, surgeries, weekDates, releasedSlots);

  const stats: DeptStats[] = departments.map(dept => {
    const ownSlots = slots.filter(s => s.allocation.deptId === dept.id);
    const ownAllocatedMin = ownSlots.reduce((sum, s) => sum + s.allocatedMinutes, 0);
    const ownUsedMin = ownSlots.reduce((sum, s) => sum + s.usedMinutes, 0);
    const ownRate = ownAllocatedMin > 0 ? Math.round((ownUsedMin / ownAllocatedMin) * 100) : 0;

    const claimed = surgeries.filter(s => {
      if (s.deptId !== dept.id) return false;
      const alloc = allocations.find(a => a.id === s.allocationId);
      return alloc && alloc.deptId !== dept.id;
    });

    const released = releasedSlots.filter(r => r.ownerDeptId === dept.id).length;
    const approved = slotRequests.filter(r => r.requestingDeptId === dept.id && r.status === 'approved').length;

    return {
      dept,
      ownAllocatedMin,
      ownUsedMin,
      ownRate,
      claimedSlots: claimed.length,
      releasedSlots: released,
      approvedRequests: approved,
    };
  }).filter(s => s.ownAllocatedMin > 0 || s.claimedSlots > 0 || s.approvedRequests > 0)
    .sort((a, b) => b.ownRate - a.ownRate);

  if (stats.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-bold text-gray-900">診療科別 稼働実績</h3>
        <p className="text-xs text-gray-500 mt-0.5">保有枠の稼働率 + 他科枠引き受け実績</p>
      </div>
      <div className="divide-y divide-gray-50">
        {stats.map((s, i) => {
          const color = getDeptBgStyle(s.dept.color);
          return (
            <div key={s.dept.id} className="flex items-center gap-3 px-5 py-3">
              <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
              <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium text-gray-800 w-24 truncate">{s.dept.name}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="flex-1 h-2 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(s.ownRate, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-12 text-right ${s.ownRate >= 80 ? 'text-green-600' : s.ownRate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {s.ownRate}%
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5 text-xs flex-wrap">
                {s.approvedRequests > 0 && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">
                    🏆 +{s.approvedRequests}枠獲得
                  </span>
                )}
                {s.claimedSlots > 0 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                    +{s.claimedSlots}枠引受
                  </span>
                )}
                {s.releasedSlots > 0 && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                    {s.releasedSlots}枠解放
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
