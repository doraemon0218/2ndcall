'use client';

import { useState, useEffect } from 'react';
import { Surgery, SlotAllocation, Department } from '@/lib/types';
import { allocationStartHHMM, allocationEndHHMM } from '@/lib/utils';

interface Props {
  allocation: SlotAllocation;
  date: string;
  surgery?: Surgery | null;
  departments: Department[];
  onSave: (surgery: Omit<Surgery, 'id'>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export default function SurgeryModal({ allocation, date, surgery, departments, onSave, onDelete, onClose }: Props) {
  const defaultStart = allocationStartHHMM(allocation);
  const defaultEnd = allocationEndHHMM(allocation);

  const [form, setForm] = useState({
    patientName: '',
    procedure: '',
    surgeonName: '',
    deptId: allocation.deptId,
    startTime: defaultStart,
    endTime: defaultEnd,
    status: 'scheduled' as Surgery['status'],
    isEmergency: false,
    notes: '',
  });

  useEffect(() => {
    if (surgery) {
      setForm({
        patientName: surgery.patientName,
        procedure: surgery.procedure,
        surgeonName: surgery.surgeonName,
        deptId: surgery.deptId,
        startTime: surgery.startTime,
        endTime: surgery.endTime,
        status: surgery.status,
        isEmergency: surgery.isEmergency,
        notes: surgery.notes,
      });
    }
  }, [surgery]);

  const dept = departments.find(d => d.id === form.deptId) ?? departments[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      date,
      roomId: allocation.roomId,
      deptName: departments.find(d => d.id === form.deptId)?.name ?? form.deptId,
      allocationId: allocation.id,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {surgery ? '手術情報を編集' : '手術を登録'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {date} · {allocation.roomId.replace('or', '手術室')} · {allocation.deptName}
            </p>
          </div>
          {form.isEmergency && (
            <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full">緊急</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* 術式 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">術式 <span className="text-red-500">*</span></label>
            <input
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.procedure}
              onChange={e => setForm(f => ({ ...f, procedure: e.target.value }))}
              placeholder="例: 腹腔鏡下胆嚢摘出術"
            />
          </div>

          {/* 患者・術者 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">患者名</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.patientName}
                onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))}
                placeholder="山田 太郎"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">執刀医</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.surgeonName}
                onChange={e => setForm(f => ({ ...f, surgeonName: e.target.value }))}
                placeholder="田中 先生"
              />
            </div>
          </div>

          {/* 診療科 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当診療科</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.deptId}
              onChange={e => setForm(f => ({ ...f, deptId: e.target.value }))}
            >
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* 時間 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始時刻</label>
              <input
                type="time"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終了時刻（予定）</label>
              <input
                type="time"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>

          {/* ステータス・緊急 */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as Surgery['status'] }))}
              >
                <option value="scheduled">予定</option>
                <option value="completed">実施済</option>
                <option value="cancelled">キャンセル</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-red-500"
                checked={form.isEmergency}
                onChange={e => setForm(f => ({ ...f, isEmergency: e.target.checked }))}
              />
              <span className="text-sm font-medium text-gray-700">緊急手術</span>
            </label>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="特記事項があれば記入"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {surgery && onDelete && (
              <button
                type="button"
                onClick={() => { onDelete(surgery.id); onClose(); }}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                削除
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {surgery ? '更新' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
