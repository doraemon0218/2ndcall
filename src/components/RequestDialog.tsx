'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ReleasedSlot, getPeriodLabel } from '@/lib/types';
import { minutesToHHMM } from '@/lib/utils';

interface Props {
  release: ReleasedSlot;
  window: { start: number; end: number }; // 使える時間帯（分）
  deptName: string;
  safetyMarginMinutes: number;
  onSubmit: (input: { durationMinutes: number; procedure: string }) => void;
  onClose: () => void;
}

const fmt = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}` : `${min}分`);

// 空き枠への申請：所要時間を必ず入力し、安全マージンを足しても枠に収まるかを確かめる
export default function RequestDialog({ release, window, deptName, safetyMarginMinutes, onSubmit, onClose }: Props) {
  const [duration, setDuration] = useState(0);
  const [procedure, setProcedure] = useState('');
  const available = Math.max(0, window.end - window.start);
  const needed = duration + safetyMarginMinutes;
  const fits = duration > 0 && needed <= available;
  const options = Array.from({ length: Math.floor(available / 15) }, (_, i) => (i + 1) * 15);
  const pct = (m: number) => `${Math.min(100, (m / Math.max(available, 1)) * 100)}%`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">この空き枠に申請する</h2>
          <p className="text-sm text-gray-600 mt-1">
            {format(new Date(`${release.date}T00:00:00`), 'M月d日(E)', { locale: ja })}・手術室{release.roomId.replace('or', '')}・{getPeriodLabel(release.period)}
            <span className="ml-1 text-gray-400">（{release.ownerDeptName}の枠）</span>
          </p>
          <p className="text-sm text-gray-600">使える時間：<b>{minutesToHHMM(window.start)}–{minutesToHHMM(window.end)}（{fmt(available)}）</b></p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-800">所要時間 <span className="text-[#C2610F]">（必須）</span></span>
            <select
              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-3 text-lg font-bold"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
            >
              <option value={0}>選んでください</option>
              {options.map(m => <option key={m} value={m}>{fmt(m)}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-gray-800">術式（任意）</span>
            <input className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-base" value={procedure} onChange={e => setProcedure(e.target.value)} placeholder="例：腹腔鏡下胆嚢摘出術" />
          </label>

          {/* 収まるかどうか */}
          <div>
            <div className="h-6 w-full rounded-full bg-gray-100 overflow-hidden flex">
              <div className="h-full bg-[#1B3A5C]" style={{ width: pct(duration) }} />
              <div className="h-full" style={{ width: pct(safetyMarginMinutes), backgroundImage: 'repeating-linear-gradient(45deg,#C2610F 0 6px,#F0A35E 6px 12px)' }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>■ 所要時間 {duration ? fmt(duration) : '—'}　▨ 安全マージン {fmt(safetyMarginMinutes)}</span>
              <span>枠 {fmt(available)}</span>
            </div>
            {duration > 0 && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold ${fits ? 'bg-[#E9EDF2] text-[#1B3A5C]' : 'bg-[#FDF3EA] text-[#C2610F]'}`}>
                {fits
                  ? `✅ 所要時間＋安全マージンで ${fmt(needed)}。枠に収まります（残り ${fmt(available - needed)}）`
                  : `⚠ 所要時間＋安全マージンで ${fmt(needed)}。枠（${fmt(available)}）を超えるため申請できません`}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">安全マージンは、手術の延長でスタッフに負担がかからないよう手術室管理者が決めています。</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-3 text-base text-gray-600">やめる</button>
          <button
            type="button"
            disabled={!fits}
            onClick={() => onSubmit({ durationMinutes: duration, procedure })}
            className="flex-1 rounded-xl bg-[#1B3A5C] py-3 text-base font-bold text-white disabled:opacity-30"
          >
            {deptName}として申請する
          </button>
        </div>
      </div>
    </div>
  );
}
