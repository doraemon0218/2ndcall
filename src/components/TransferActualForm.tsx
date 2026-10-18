'use client';

import { useState } from 'react';
import { TransferRow } from '@/lib/transfers';

export interface ActualEntry {
  surgeryId?: string;
  procedure: string;
  start: string;
  end: string;
  done: boolean;
}

interface Props {
  row: TransferRow;
  onSave: (releaseId: string, entries: ActualEntry[]) => void;
  onCancel: () => void;
}

// 移譲枠の実績入力：使った科の手術ごとに、実際の入室・退室時刻を入れる
export default function TransferActualForm({ row, onSave, onCancel }: Props) {
  const [entries, setEntries] = useState<ActualEntry[]>(() =>
    row.cases.map(c => ({
      surgeryId: c.id,
      procedure: c.procedure,
      start: c.actualStartTime ?? c.startTime,
      end: c.actualEndTime ?? c.endTime,
      done: true,
    })),
  );
  const update = (i: number, patch: Partial<ActualEntry>) => setEntries(prev => prev.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const valid = entries.every(e => !e.done || (e.start && e.end && e.end > e.start));

  return (
    <div className="rounded-xl border-2 border-[#1B3A5C] bg-[#F4F6F9] p-4 space-y-3">
      <p className="text-sm font-bold text-gray-900">
        実績を入力：{row.toDeptName}（{row.date}・手術室{row.roomId.replace('or', '')}）
      </p>
      {entries.length === 0 && <p className="text-sm text-gray-600">予定されていた手術はありません。実施した手術があれば追加してください。</p>}
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className={`flex items-center gap-2 flex-wrap rounded-lg bg-white px-3 py-2 ${e.done ? '' : 'opacity-50'}`}>
            <label className="flex items-center gap-1.5 text-sm font-bold">
              <input type="checkbox" checked={e.done} onChange={ev => update(i, { done: ev.target.checked })} className="w-5 h-5" />
              実施した
            </label>
            <input
              className="flex-1 min-w-[10rem] rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={e.procedure}
              placeholder="術式"
              onChange={ev => update(i, { procedure: ev.target.value })}
            />
            <label className="text-xs text-gray-500">入室</label>
            <input type="time" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={e.start} onChange={ev => update(i, { start: ev.target.value })} />
            <label className="text-xs text-gray-500">退室</label>
            <input type="time" className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" value={e.end} onChange={ev => update(i, { end: ev.target.value })} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setEntries(prev => [...prev, { procedure: '', start: '', end: '', done: true }])}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
        >
          ＋ 手術を追加
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-gray-500">やめる</button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onSave(row.release.id, entries)}
          className="rounded-lg bg-[#1B3A5C] px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          実績を保存
        </button>
      </div>
    </div>
  );
}
