'use client';

import { useState } from 'react';
import { SlotAllocation, ReleasedSlot, Department } from '@/lib/types';

interface Props {
  allocation: SlotAllocation;
  date: string;
  existingRelease?: ReleasedSlot;
  departments: Department[];
  currentUserRole?: 'manager' | 'dept';
  currentDeptId?: string;
  onRelease: (params: { releasedBy: string; message: string; claimDeptId?: string; claimDeptName?: string }) => void;
  onClaim: (deptId: string, deptName: string) => void;
  onCancel: () => void;
  onClose: () => void;
}

export default function ReleaseModal({ allocation, date, existingRelease, departments, currentUserRole = 'manager', currentDeptId = '', onRelease, onClaim, onCancel, onClose }: Props) {
  const [tab, setTab] = useState<'release' | 'claim'>(existingRelease && !existingRelease.claimedByDeptId ? 'claim' : 'release');
  const [releasedBy, setReleasedBy] = useState('');
  const [message, setMessage] = useState('');
  const [claimDeptId, setClaimDeptId] = useState(currentUserRole === 'dept' && currentDeptId ? currentDeptId : '');

  function handleRelease(e: React.FormEvent) {
    e.preventDefault();
    onRelease({ releasedBy, message });
    onClose();
  }

  function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    const deptId = currentUserRole === 'dept' ? (currentDeptId || claimDeptId) : claimDeptId;
    if (!deptId) return;
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    onClaim(deptId, dept.name);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">空き枠の共有・引き受け</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {date} · {allocation.roomId.replace('or', '手術室')} · {allocation.deptName}
            （{allocation.startHour}:00–{allocation.endHour}:00）
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab('release')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'release' ? 'text-purple-700 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            枠を解放する
          </button>
          <button
            onClick={() => setTab('claim')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'claim' ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            枠を引き受ける
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Existing release status */}
          {existingRelease && (
            <div className={`mb-4 p-3 rounded-xl border ${existingRelease.claimedByDeptId ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className={`text-xs font-bold ${existingRelease.claimedByDeptId ? 'text-blue-700' : 'text-purple-700'}`}>
                    {existingRelease.claimedByDeptId ? `✓ ${existingRelease.claimedByDeptName} が引き受け済み` : '🔓 解放中'}
                  </span>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {existingRelease.releasedBy && `解放: ${existingRelease.releasedBy}`}
                    {existingRelease.message && ` · ${existingRelease.message}`}
                  </p>
                </div>
                <button
                  onClick={() => { onCancel(); onClose(); }}
                  className="text-xs text-gray-400 hover:text-red-500 ml-2"
                >
                  解除
                </button>
              </div>
            </div>
          )}

          {tab === 'release' && (
            <form onSubmit={handleRelease} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">解放する担当者名</label>
                <input
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={releasedBy}
                  onChange={e => setReleasedBy(e.target.value)}
                  placeholder="例: 整形外科 部長"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">コメント（理由・条件など）</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="例: 手術件数が少なく午後が空きそうです。どの科でもご利用ください。"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  キャンセル
                </button>
                <button type="submit" className="flex-1 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
                  🔓 枠を解放・共有
                </button>
              </div>
            </form>
          )}

          {tab === 'claim' && (
            <form onSubmit={handleClaim} className="space-y-4">
              {!existingRelease && (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  この枠はまだ解放されていません。解放後に他の診療科が引き受けることができます。
                </p>
              )}
              {existingRelease && !existingRelease.claimedByDeptId && (
                <>
                  {currentUserRole === 'manager' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">引き受ける診療科</label>
                      <select
                        required
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={claimDeptId}
                        onChange={e => setClaimDeptId(e.target.value)}
                      >
                        <option value="">診療科を選択...</option>
                        {departments.filter(d => d.id !== allocation.deptId).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                      自診療科としてこの枠を引き受けます: <span className="font-bold">{departments.find(d => d.id === currentDeptId)?.name ?? '自科'}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      キャンセル
                    </button>
                    <button type="submit" className="flex-1 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                      ✓ この枠を引き受ける
                    </button>
                  </div>
                </>
              )}
              {existingRelease?.claimedByDeptId && (
                <p className="text-sm text-gray-600">
                  この枠は <strong>{existingRelease.claimedByDeptName}</strong> が引き受け済みです。
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
