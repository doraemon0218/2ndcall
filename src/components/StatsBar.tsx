'use client';

import { Surgery, SlotAllocation, ReleasedSlot } from '@/lib/types';
import { buildWeeklySlots, getWeekDates } from '@/lib/utils';

interface Props {
  weekStart: Date;
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots?: ReleasedSlot[];
}

export default function StatsBar({ weekStart, allocations, surgeries, releasedSlots = [] }: Props) {
  const weekDates = getWeekDates(weekStart);
  const slots = buildWeeklySlots(allocations, surgeries, weekDates, releasedSlots);

  const totalSlots = slots.length;
  const emptySlots = slots.filter(s => s.isEmpty).length;
  const alertSlots = slots.filter(s => s.isEmpty && s.isDeadlinePassed).length;
  const totalAllocated = slots.reduce((sum, s) => sum + s.allocatedMinutes, 0);
  const totalUsed = slots.reduce((sum, s) => sum + s.usedMinutes, 0);
  const weekRate = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : 0;

  const stats = [
    {
      label: '週間稼働率',
      value: `${weekRate}%`,
      sub: `${Math.round(totalUsed / 60)}h / ${Math.round(totalAllocated / 60)}h`,
      color: weekRate >= 80 ? 'text-green-600' : weekRate >= 60 ? 'text-yellow-600' : 'text-red-500',
      bg: weekRate >= 80 ? 'bg-green-50' : weekRate >= 60 ? 'bg-yellow-50' : 'bg-red-50',
    },
    {
      label: '空き枠',
      value: `${emptySlots}枠`,
      sub: `全${totalSlots}枠中`,
      color: emptySlots === 0 ? 'text-green-600' : emptySlots <= 3 ? 'text-yellow-600' : 'text-red-500',
      bg: emptySlots === 0 ? 'bg-green-50' : emptySlots <= 3 ? 'bg-yellow-50' : 'bg-red-50',
    },
    {
      label: '要確認（期限超過）',
      value: `${alertSlots}枠`,
      sub: '前週水曜超過の空き',
      color: alertSlots === 0 ? 'text-green-600' : 'text-red-600',
      bg: alertSlots === 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      label: '低稼働枠（<50%）',
      value: `${slots.filter(s => !s.isEmpty && s.utilizationRate < 50).length}枠`,
      sub: '予定有りも半分未満',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {stats.map(s => (
        <div key={s.label} className={`rounded-xl p-4 ${s.bg} border border-white/50`}>
          <div className="text-xs text-gray-500 font-medium mb-1">{s.label}</div>
          <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
