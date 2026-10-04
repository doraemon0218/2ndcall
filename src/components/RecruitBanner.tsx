'use client';

import { useEffect, useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { getActiveRecruitWeek, getRecruitOpen } from '@/lib/utils';

interface Props {
  openSlotCount: number; // 来週の共有中（まだ埋まっていない）枠数
  onShow?: () => void;
  actionLabel?: string;
}

function remaining(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

// 木曜午後〜金曜の「来週の空き枠を埋める時間」を知らせる帯
export default function RecruitBanner({ openSlotCount, onShow, actionLabel = '空き枠を見る' }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const active = getActiveRecruitWeek(now);

  if (!active) {
    const nextMonday = startOfWeek(addDays(now, 7), { weekStartsOn: 1 });
    let opensAt = getRecruitOpen(nextMonday);
    if (opensAt < now) opensAt = getRecruitOpen(addDays(nextMonday, 7));
    return (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        <span className="text-xl">🗓</span>
        <span>
          次の「空き枠を埋める時間」は <b className="text-slate-800">{format(opensAt, 'M月d日(E) HH:mm', { locale: ja })}</b> から金曜17時まで
          <span className="text-slate-400">（水曜に予定表作成 → 木曜午前に確定）</span>
        </span>
      </div>
    );
  }

  return (
    <div className="mb-5 flex items-center gap-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-5 py-4 shadow-sm flex-wrap">
      <span className="text-3xl">⏰</span>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold text-emerald-900">
          いまは来週（{format(active.weekStart, 'M/d', { locale: ja })}〜）の空き枠を埋める時間です
        </p>
        <p className="text-sm text-emerald-800">
          締切 {format(active.closesAt, 'M月d日(E) HH:mm', { locale: ja })}・あと <b>{remaining(active.closesAt.getTime() - now.getTime())}</b>
          　｜　埋めると追加の入院につながります
        </p>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold text-emerald-700">{openSlotCount}</div>
        <div className="text-xs font-bold text-emerald-700">空き枠</div>
      </div>
      {onShow && (
        <button type="button" onClick={onShow} className="rounded-xl bg-emerald-600 px-5 py-3 text-base font-bold text-white hover:bg-emerald-700">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
