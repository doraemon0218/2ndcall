'use client';

import { useState } from 'react';
import { Department } from '@/lib/types';

export interface Absence {
  id: string;
  deptId: string;
  deptName: string;
  personName: string;
  reason: string; // '学会', '休暇', '研修', 'その他'
  startDate: string;
  endDate: string;
  notes: string;
  createdAt: string;
}

interface Props {
  departments: Department[];
  onSave: (absence: Omit<Absence, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

export default function AbsenceModal({ departments, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    deptId: departments[0]?.id ?? '',
    personName: '',
    reason: '学会',
    startDate: '',
    endDate: '',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dept = departments.find(d => d.id === form.deptId);
    onSave({
      ...form,
      deptName: dept?.name ?? form.deptId,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">不在・学会を登録</h2>
          <p className="text-xs text-gray-500 mt-0.5">事前に登録すると、該当期間の空き枠が自動でハイライトされます</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">診療科</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.deptId}
                onChange={e => setForm(f => ({ ...f, deptId: e.target.value }))}
              >
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">理由</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              >
                {['学会', '休暇', '研修', '出張', 'その他'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">担当者名（任意）</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.personName}
              onChange={e => setForm(f => ({ ...f, personName: e.target.value }))}
              placeholder="例: 山田 部長"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日 <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">終了日 <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="例: ○○学会（東京）"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
            <button type="submit" className="flex-1 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">登録</button>
          </div>
        </form>
      </div>
    </div>
  );
}
