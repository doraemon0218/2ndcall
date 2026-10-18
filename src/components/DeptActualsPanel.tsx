'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getPeriodLabel } from '@/lib/types';
import { TransferRow } from '@/lib/transfers';
import TransferActualForm, { ActualEntry } from './TransferActualForm';

interface Props {
  rows: TransferRow[]; // この科が使った移譲枠のうち、終了して実績が未入力のもの
  onSave: (releaseId: string, entries: ActualEntry[]) => void;
}

// 部長向け：移譲で受けた枠だけ、手術後に実績（入室・退室）を入力する
export default function DeptActualsPanel({ rows, onSave }: Props) {
  const [open, setOpen] = useState<string | null>(rows[0]?.release.id ?? null);
  if (rows.length === 0) return null;
  return (
    <section className="mb-5 rounded-2xl border-2 border-[#C2610F] bg-white p-4 shadow-sm">
      <h3 className="text-lg font-bold text-[#C2610F]">📝 移譲で受けた枠の実績を入力してください（{rows.length}件）</h3>
      <p className="text-sm text-gray-600 mb-3">手術が終わった移譲枠だけ、実際の入室・退室時刻を入力します。移譲枠の稼働率の計算に使います。</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.release.id}>
            {open === r.release.id ? (
              <TransferActualForm row={r} onSave={(id, e) => { onSave(id, e); setOpen(null); }} onCancel={() => setOpen(null)} />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(r.release.id)}
                className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className="text-sm text-gray-800">
                  <b>{format(new Date(`${r.date}T00:00:00`), 'M/d(E)', { locale: ja })}</b>　手術室{r.roomId.replace('or', '')}・{getPeriodLabel(r.period)}
                  <span className="ml-2 text-gray-500">（{r.fromDeptName}から移譲・予定{r.caseCount}件）</span>
                </span>
                <span className="rounded-lg bg-[#C2610F] px-3 py-1.5 text-sm font-bold text-white">実績を入力</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
