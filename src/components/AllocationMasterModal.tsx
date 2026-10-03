'use client';

import { useState } from 'react';
import { SlotAllocation, Department, OperatingRoom, Period, PERIOD_HOURS, getPeriodLabel } from '@/lib/types';
import { getDeptBgStyle, generateId } from '@/lib/utils';

interface Props {
  allocations: SlotAllocation[];
  departments: Department[];
  rooms: OperatingRoom[];
  onSave: (next: SlotAllocation[]) => void;
  onClose: () => void;
}

const DAYS = [
  { dow: 1, label: '月' },
  { dow: 2, label: '火' },
  { dow: 3, label: '水' },
  { dow: 4, label: '木' },
  { dow: 5, label: '金' },
  { dow: 6, label: '土' },
];
const PERIODS: Period[] = ['am', 'pm'];

interface CellState {
  roomId: string; dow: number; period: Period;
}

export default function AllocationMasterModal({ allocations, departments, rooms, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<SlotAllocation[]>(allocations);
  const [editing, setEditing] = useState<CellState | null>(null);

  function getAlloc(roomId: string, dow: number, period: Period): SlotAllocation | undefined {
    return draft.find(a => a.roomId === roomId && a.dayOfWeek === dow && a.period === period);
  }

  function setAlloc(roomId: string, dow: number, period: Period, deptId: string) {
    const dept = departments.find(d => d.id === deptId);
    setDraft(prev => {
      const filtered = prev.filter(a => !(a.roomId === roomId && a.dayOfWeek === dow && a.period === period));
      if (!deptId || !dept) return filtered;
      const hours = PERIOD_HOURS[period];
      const newAlloc: SlotAllocation = {
        id: generateId(),
        roomId, dayOfWeek: dow, period,
        ...hours,
        deptId: dept.id,
        deptName: dept.name,
        notes: '',
      };
      return [...filtered, newAlloc];
    });
    setEditing(null);
  }

  function clearAlloc(roomId: string, dow: number, period: Period) {
    setDraft(prev => prev.filter(a => !(a.roomId === roomId && a.dayOfWeek === dow && a.period === period)));
    setEditing(null);
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function fillColumn(dow: number, deptId: string) {
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    for (const room of rooms) {
      for (const period of PERIODS) {
        setAlloc(room.id, dow, period, deptId);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">OR枠マスタ設定</h2>
            <p className="text-xs text-gray-500 mt-0.5">診療科ごとの保有枠を午前/午後単位で設定します</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">保存</button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500">診療科:</span>
          {departments.map(d => (
            <span key={d.id} className="flex items-center gap-1.5 text-xs text-gray-700">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: getDeptBgStyle(d.color) }} />
              {d.name}
            </span>
          ))}
        </div>

        {/* Matrix */}
        <div className="overflow-auto flex-1 p-4">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-xs text-gray-500 font-semibold text-left px-2 w-24">手術室</th>
                <th className="text-xs text-gray-500 font-semibold w-12"></th>
                {DAYS.map(d => (
                  <th key={d.dow} className={`text-sm font-bold text-center pb-1 ${d.dow === 6 ? 'text-blue-600' : 'text-gray-700'}`}>
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map(room => (
                PERIODS.map((period, pi) => (
                  <tr key={`${room.id}-${period}`}>
                    {pi === 0 && (
                      <td rowSpan={2} className="px-2 py-1 text-sm font-semibold text-gray-700 align-middle whitespace-nowrap border-r border-gray-200">
                        {room.name}
                      </td>
                    )}
                    <td className={`text-xs font-bold px-2 py-1 whitespace-nowrap ${period === 'am' ? 'text-amber-600' : 'text-indigo-600'} ${pi === 1 ? 'border-b border-gray-200' : ''}`}>
                      {getPeriodLabel(period)}
                    </td>
                    {DAYS.map(d => {
                      const alloc = getAlloc(room.id, d.dow, period);
                      const dept = alloc ? departments.find(x => x.id === alloc.deptId) : null;
                      const color = dept ? getDeptBgStyle(dept.color) : null;
                      const isEditing = editing?.roomId === room.id && editing?.dow === d.dow && editing?.period === period;

                      return (
                        <td key={d.dow} className={`relative ${pi === 1 ? 'border-b border-gray-100' : ''}`}>
                          {isEditing ? (
                            <div className="absolute z-10 top-0 left-0 bg-white shadow-xl rounded-xl border border-gray-200 p-2 w-44">
                              <p className="text-xs font-bold text-gray-600 mb-2">{d.label}曜 {getPeriodLabel(period)}</p>
                              <div className="space-y-1">
                                {departments.map(dep => (
                                  <button
                                    key={dep.id}
                                    onClick={() => setAlloc(room.id, d.dow, period, dep.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity flex items-center gap-2 ${alloc?.deptId === dep.id ? 'opacity-100' : 'opacity-60'}`}
                                    style={{ backgroundColor: getDeptBgStyle(dep.color) + '20', color: getDeptBgStyle(dep.color) }}
                                  >
                                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getDeptBgStyle(dep.color) }} />
                                    {dep.shortName}
                                  </button>
                                ))}
                                <button
                                  onClick={() => clearAlloc(room.id, d.dow, period)}
                                  className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-100 border border-dashed border-gray-300"
                                >
                                  なし（空き）
                                </button>
                              </div>
                              <button onClick={() => setEditing(null)} className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600">閉じる</button>
                            </div>
                          ) : null}

                          <button
                            onClick={() => setEditing(isEditing ? null : { roomId: room.id, dow: d.dow, period })}
                            className={`w-full h-10 rounded-lg text-xs font-bold transition-all hover:opacity-80 hover:shadow-sm border ${
                              alloc
                                ? 'border-transparent text-white'
                                : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400 bg-white'
                            } ${isEditing ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
                            style={alloc && color ? { backgroundColor: color, color: 'white' } : {}}
                          >
                            {dept ? dept.shortName : '+'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer hints */}
        <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-4">
          <span>• セルをクリックして診療科を割り当て</span>
          <span>• 同じセルを再クリックで変更</span>
          <span className="text-amber-600 font-medium">午前: 8:00–12:30</span>
          <span className="text-indigo-600 font-medium">午後: 13:00–17:00</span>
        </div>
      </div>
    </div>
  );
}
