'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Surgery, SlotAllocation, Department, OperatingRoom, WeeklySlot, ReleasedSlot } from '@/lib/types';
import { formatDate, getDeptBgStyle, getUtilizationColor, buildWeeklySlots, getWeekDates, allocationStartHHMM, allocationEndHHMM } from '@/lib/utils';
import { getPeriodLabel } from '@/lib/types';
import SurgeryModal from './SurgeryModal';
import ReleaseModal from './ReleaseModal';

interface Props {
  weekStart: Date;
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots: ReleasedSlot[];
  departments: Department[];
  rooms: OperatingRoom[];
  currentUserRole?: 'manager' | 'dept';
  currentDeptId?: string;
  onAddSurgery: (s: Omit<Surgery, 'id'>) => void;
  onUpdateSurgery: (id: string, updates: Partial<Surgery>) => void;
  onDeleteSurgery: (id: string) => void;
  onReleaseSlot: (params: {
    allocationId: string; date: string; roomId: string;
    ownerDeptId: string; ownerDeptName: string;
    period: ReleasedSlot['period'];
    startHour: number; endHour: number;
    availStartTime?: string; availEndTime?: string;
    releasedBy: string; message: string;
  }) => void;
  onClaimSlot: (releaseId: string, deptId: string, deptName: string) => void;
  onCancelRelease: (releaseId: string) => void;
}

interface SurgeryModalState { allocation: SlotAllocation; date: string; surgery?: Surgery }
interface ReleaseModalState { slot: WeeklySlot }

export default function WeeklySchedule({
  weekStart, allocations, surgeries, releasedSlots, departments, rooms,
  currentUserRole = 'manager', currentDeptId = '',
  onAddSurgery, onUpdateSurgery, onDeleteSurgery,
  onReleaseSlot, onClaimSlot, onCancelRelease,
}: Props) {
  const [surgeryModal, setSurgeryModal] = useState<SurgeryModalState | null>(null);
  const [releaseModal, setReleaseModal] = useState<ReleaseModalState | null>(null);
  const weekDates = getWeekDates(weekStart);
  const slots = buildWeeklySlots(allocations, surgeries, weekDates, releasedSlots);

  function getSlot(roomId: string, date: string): WeeklySlot | undefined {
    return slots.find(s => s.allocation.roomId === roomId && s.date === date);
  }

  const dayLabels = weekDates.map(d => formatDate(d));

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 w-24 min-w-24 px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-r border-gray-200">
              手術室
            </th>
            {weekDates.map((date, i) => {
              const dow = date.getDay();
              const isSat = dow === 6;
              const dateStr = format(date, 'yyyy-MM-dd');
              const daySlots = slots.filter(s => s.date === dateStr);
              const totalAllocated = daySlots.reduce((sum, s) => sum + s.allocatedMinutes, 0);
              const totalUsed = daySlots.reduce((sum, s) => sum + s.usedMinutes, 0);
              const dayRate = totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : null;
              return (
                <th key={i} className={`px-2 py-3 text-center border-b border-r border-gray-200 min-w-40 ${isSat ? 'bg-blue-50/50' : 'bg-gray-50'}`}>
                  <div className="text-sm font-bold text-gray-800">{dayLabels[i]}</div>
                  {dayRate !== null && (
                    <div className={`text-xs mt-0.5 font-semibold ${dayRate >= 80 ? 'text-green-600' : dayRate >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                      稼働率 {dayRate}%
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map(room => (
            <tr key={room.id}>
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 border-b border-r border-gray-200 whitespace-nowrap">
                {room.name}
              </td>
              {weekDates.map((date, di) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const slot = getSlot(room.id, dateStr);

                if (!slot) {
                  return <td key={di} className="border-b border-r border-gray-100 bg-gray-50/30" />;
                }

                const dept = departments.find(d => d.id === slot.allocation.deptId);
                const deptColor = dept ? getDeptBgStyle(dept.color) : '#9ca3af';
                const isReleased = !!slot.releasedSlot;
                const cellBg = getUtilizationColor(slot.utilizationRate, slot.isEmpty, slot.isDeadlinePassed, isReleased);
                const activeSurgeries = slot.surgeries.filter(s => s.status !== 'cancelled');

                return (
                  <td key={di} className={`border-b border-r border-gray-200 p-2 align-top ${cellBg}`} style={{ minHeight: '120px', verticalAlign: 'top' }}>
                    {/* Dept header strip */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: deptColor }} />
                      <span className="text-xs font-bold text-gray-700 truncate">{slot.allocation.deptName}</span>
                      <span className="ml-auto text-xs text-gray-400 whitespace-nowrap font-mono">
                        {getPeriodLabel(slot.allocation.period)}
                        <span className="text-gray-300 ml-1">{allocationStartHHMM(slot.allocation)}–{allocationEndHHMM(slot.allocation)}</span>
                      </span>
                    </div>

                    {/* Utilization bar */}
                    <div className="h-1.5 rounded-full bg-white/70 mb-2 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(slot.utilizationRate, 100)}%`,
                          backgroundColor: slot.utilizationRate >= 80 ? '#22c55e' : slot.utilizationRate >= 50 ? '#eab308' : slot.isEmpty ? '#d1d5db' : '#f97316',
                        }}
                      />
                    </div>

                    {/* Released badge */}
                    {isReleased && (
                      <div className={`mb-1.5 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 ${slot.releasedSlot?.claimedByDeptId ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}>
                        {slot.releasedSlot?.claimedByDeptId
                          ? `✓ ${slot.releasedSlot.claimedByDeptName}が引受済`
                          : '🔓 解放中 — 引受待ち'}
                      </div>
                    )}

                    {/* Deadline alert */}
                    {slot.isEmpty && slot.isDeadlinePassed && !isReleased && (
                      <button
                        onClick={() => setReleaseModal({ slot })}
                        className="mb-1.5 w-full px-2 py-1 bg-red-100 border border-red-300 rounded text-xs text-red-700 font-bold flex items-center gap-1 hover:bg-red-200 transition-colors"
                      >
                        <span>⚠</span> 空き枠 — 枠を解放する
                      </button>
                    )}

                    {/* Surgery cards */}
                    <div className="space-y-1">
                      {activeSurgeries.map(s => {
                        const sDept = departments.find(d => d.id === s.deptId);
                        const sColor = sDept ? getDeptBgStyle(sDept.color) : deptColor;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSurgeryModal({ allocation: slot.allocation, date: slot.date, surgery: s })}
                            className="w-full text-left px-2 py-1.5 rounded border border-gray-200 bg-white text-xs hover:shadow-sm transition-all group"
                            style={{ borderLeftWidth: '3px', borderLeftColor: sColor }}
                          >
                            <div className="flex items-start gap-1">
                              <span className="font-semibold text-gray-800 truncate flex-1 leading-tight">{s.procedure}</span>
                              {s.isEmergency && <span className="text-red-500 text-xs font-bold flex-shrink-0">緊急</span>}
                            </div>
                            <div className="text-gray-500 mt-0.5 text-xs flex items-center gap-1">
                              <span className="font-mono">{s.startTime}–{s.endTime}</span>
                              {s.surgeonName && <span className="truncate">· {s.surgeonName}</span>}
                            </div>
                            {s.deptId !== slot.allocation.deptId && sDept && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: sColor + '20', color: sColor }}>
                                {sDept.shortName}
                              </span>
                            )}
                            {s.status === 'completed' && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">実施済</span>
                            )}
                          </button>
                        );
                      })}

                      {slot.surgeries.filter(s => s.status === 'cancelled').map(s => (
                        <button
                          key={s.id}
                          onClick={() => setSurgeryModal({ allocation: slot.allocation, date: slot.date, surgery: s })}
                          className="w-full text-left px-2 py-1 rounded border border-gray-200 text-xs text-gray-400 line-through bg-white"
                        >
                          {s.procedure}
                        </button>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="mt-1.5 flex gap-1">
                      <button
                        onClick={() => setSurgeryModal({ allocation: slot.allocation, date: slot.date })}
                        className="flex-1 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded border border-dashed border-gray-300 hover:border-blue-400 transition-colors"
                      >
                        ＋ 手術追加
                      </button>
                      {slot.isEmpty && !isReleased && (
                        <button
                          onClick={() => setReleaseModal({ slot })}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded border border-dashed border-gray-300 hover:border-purple-400 transition-colors"
                          title="枠を解放"
                        >
                          🔓
                        </button>
                      )}
                      {isReleased && !slot.releasedSlot?.claimedByDeptId && (
                        <button
                          onClick={() => setReleaseModal({ slot })}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded border border-blue-300 transition-colors"
                          title="引き受ける"
                        >
                          引受
                        </button>
                      )}
                    </div>

                    {!slot.isEmpty && (
                      <div className="mt-1 text-right text-xs text-gray-400 font-mono">
                        {slot.utilizationRate}%
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Surgery Modal */}
      {surgeryModal && (
        <SurgeryModal
          allocation={surgeryModal.allocation}
          date={surgeryModal.date}
          surgery={surgeryModal.surgery}
          departments={departments}
          onSave={onAddSurgery}
          onDelete={onDeleteSurgery}
          onClose={() => setSurgeryModal(null)}
        />
      )}

      {/* Release Modal */}
      {releaseModal && (
        <ReleaseModal
          allocation={releaseModal.slot.allocation}
          date={releaseModal.slot.date}
          existingRelease={releaseModal.slot.releasedSlot}
          departments={departments}
          currentUserRole={currentUserRole}
          currentDeptId={currentDeptId}
          onRelease={({ releasedBy, message }) => onReleaseSlot({
            allocationId: releaseModal.slot.allocation.id,
            date: releaseModal.slot.date,
            roomId: releaseModal.slot.allocation.roomId,
            ownerDeptId: releaseModal.slot.allocation.deptId,
            ownerDeptName: releaseModal.slot.allocation.deptName,
            period: releaseModal.slot.allocation.period,
            startHour: releaseModal.slot.allocation.startHour,
            endHour: releaseModal.slot.allocation.endHour,
            releasedBy,
            message,
          })}
          onClaim={(deptId, deptName) => {
            if (releaseModal.slot.releasedSlot) {
              onClaimSlot(releaseModal.slot.releasedSlot.id, deptId, deptName);
            }
          }}
          onCancel={() => {
            if (releaseModal.slot.releasedSlot) {
              onCancelRelease(releaseModal.slot.releasedSlot.id);
            }
          }}
          onClose={() => setReleaseModal(null)}
        />
      )}
    </div>
  );
}
