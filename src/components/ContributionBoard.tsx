'use client';

import { Department } from '@/lib/types';
import { getDeptBgStyle } from '@/lib/utils';
import { computeContributions } from '@/lib/contribution';
import { useEventLog } from '@/hooks/useEventLog';

interface Props {
  departments: Department[];
  highlightDeptId?: string;
  limit?: number;
}

const MEDALS = ['🥇', '🥈', '🥉'];

// 空き枠を埋めた／早めに共有した診療科をたたえるボード（全員に表示）
export default function ContributionBoard({ departments, highlightDeptId, limit = 5 }: Props) {
  const events = useEventLog();
  const list = computeContributions(departments, events).filter(c => c.score > 0);
  const top = list.slice(0, limit);
  const mine = highlightDeptId ? list.find(c => c.dept.id === highlightDeptId) : undefined;
  const mineRank = mine ? list.indexOf(mine) + 1 : 0;

  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-base font-bold text-gray-900">🏆 空き枠を埋めてくれた診療科（最近30日）</h3>
        <span className="text-[11px] text-gray-500">埋めた枠 ×2点 ＋ 早めの共有 ×1点</span>
      </div>

      {top.length === 0 ? (
        <p className="text-sm text-gray-500">まだ記録がありません。最初に空き枠を埋めた科がここに載ります。</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((c, i) => {
            const isMine = c.dept.id === highlightDeptId;
            return (
              <li
                key={c.dept.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isMine ? 'bg-amber-100 ring-2 ring-amber-300' : 'bg-white border border-amber-100'}`}
              >
                <span className="w-7 text-center text-lg">{MEDALS[i] ?? <span className="text-sm font-bold text-gray-400">{i + 1}</span>}</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getDeptBgStyle(c.dept.color) }} />
                <span className="flex-1 font-bold text-gray-800">{c.dept.name}{isMine && <span className="ml-1 text-xs text-amber-700">（あなたの科）</span>}</span>
                <span className="text-sm text-gray-700">埋めた <b className="text-lg text-emerald-700">{c.filled}</b> 枠</span>
                <span className="text-sm text-gray-500">共有 <b className="text-gray-700">{c.shared}</b></span>
              </li>
            );
          })}
        </ol>
      )}

      {mine && mineRank > limit && (
        <p className="mt-2 text-sm text-gray-700">
          {mine.dept.name}は {mineRank}位（埋めた {mine.filled}枠・共有 {mine.shared}枠）
        </p>
      )}
    </section>
  );
}
