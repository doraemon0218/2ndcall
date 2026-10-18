'use client';

import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Department, ReleasedSlot, SlotRequest, SlotAllocation, getPeriodLabel } from '@/lib/types';
import { getReleaseWindow } from '@/lib/transfers';
import { getDeptBgStyle } from '@/lib/utils';

interface Props {
  pendingRequests: SlotRequest[];
  releasedSlots: ReleasedSlot[];
  departments: Department[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onShowMore?: () => void;
  allocations: SlotAllocation[];
}

const md = (d: string) => format(new Date(`${d}T00:00:00`), 'M/d(E)', { locale: ja });
const at = (iso: string) => format(new Date(iso), 'M/d HH:mm', { locale: ja });

// 承認待ちを「枠ごと」にまとめ、同じ枠を複数科が希望している（バッティング）場合は並べて比べられるようにする
export default function ApprovalQueue({ pendingRequests, releasedSlots, departments, onApprove, onReject, onShowMore, allocations }: Props) {
  // 所要時間＋安全マージンが枠に収まるか
  const fitText = (req: SlotRequest, release?: ReleasedSlot) => {
    if (!req.durationMinutes || !release) return null;
    const w = getReleaseWindow(release, allocations);
    const avail = w.end - w.start;
    const margin = req.safetyMarginMinutes ?? 0;
    const need = req.durationMinutes + margin;
    return { duration: req.durationMinutes, margin, need, avail, fits: need <= avail, rest: avail - need };
  };
  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`);
  const FitLine = ({ req, release }: { req: SlotRequest; release?: ReleasedSlot }) => {
    const f = fitText(req, release);
    if (!f) return <span className="text-xs text-gray-400">所要時間：未入力</span>;
    return (
      <span className={`text-xs font-bold ${f.fits ? 'text-[#1B3A5C]' : 'text-[#C2610F]'}`}>
        所要 {fmt(f.duration)}＋マージン{f.margin}分 → {f.fits ? `枠に収まる（残り${fmt(f.rest)}）` : `枠を${fmt(-f.rest)}超える`}
      </span>
    );
  };
  const groups = Object.values(
    pendingRequests.reduce<Record<string, SlotRequest[]>>((acc, r) => {
      (acc[r.releaseId] ??= []).push(r);
      return acc;
    }, {}),
  )
    .map(reqs => ({ reqs: [...reqs].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)), release: releasedSlots.find(r => r.id === reqs[0].releaseId) }))
    .sort((a, b) => (b.reqs.length > 1 ? 1 : 0) - (a.reqs.length > 1 ? 1 : 0) || a.reqs[0].date.localeCompare(b.reqs[0].date));

  const contested = groups.filter(g => g.reqs.length > 1).length;
  const color = (id: string) => getDeptBgStyle(departments.find(d => d.id === id)?.color ?? '');

  const slotLabel = (req: SlotRequest, release?: ReleasedSlot) =>
    `${md(req.date)}・手術室${req.roomId.replace('or', '')}${release ? `・${getPeriodLabel(release.period)}（${release.startHour}:00–${release.endHour}:00）` : ''}`;

  return (
    <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-lg font-bold text-amber-900">
          👉 今やること：申請が {pendingRequests.length}件 届いています
          {contested > 0 && <span className="ml-2 rounded-full bg-[#C2610F] px-3 py-1 text-sm text-white">⚠ 希望が重なっている枠 {contested}件</span>}
        </h3>
        {onShowMore && (
          <button type="button" onClick={onShowMore} className="text-sm font-bold text-amber-700 hover:underline">くわしく見る →</button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ reqs, release }) => {
          if (reqs.length === 1) {
            const req = reqs[0];
            return (
              <div key={req.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-800 truncate">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: color(req.requestingDeptId) }} />
                    {req.requestingDeptName} が使いたい
                  </p>
                  <p className="text-xs text-gray-500">元は {release?.ownerDeptName ?? '—'} の枠・希望は1科のみ</p>
                  <p className="text-[11px] text-gray-500">{slotLabel(req, release)}</p>
                  <FitLine req={req} release={release} />
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button type="button" onClick={() => onApprove(req.id)} className="px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">⭕ 承認</button>
                  <button type="button" onClick={() => onReject(req.id)} className="px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200">✕ 却下</button>
                </div>
              </div>
            );
          }

          // ── バッティング：同じ枠を複数科が希望 ──
          return (
            <div key={reqs[0].releaseId} className="md:col-span-2 xl:col-span-3 rounded-2xl border-4 border-[#C2610F] bg-white p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <p className="text-lg font-bold text-[#C2610F]">⚠ 1つの枠を {reqs.length}科 が希望しています — 1科を選んでください</p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    <b>{slotLabel(reqs[0], release)}</b>　元は {release?.ownerDeptName ?? '—'} の枠
                  </p>
                </div>
                <button type="button" onClick={() => reqs.forEach(r => onReject(r.id))} className="text-sm text-gray-500 hover:text-red-600 underline">
                  どの科にも渡さない
                </button>
              </div>

              <div className="flex items-stretch gap-3 flex-wrap">
                {reqs.map((req, i) => (
                  <div key={req.id} className="contents">
                    {i > 0 && (
                      <div className="flex items-center">
                        <span className="rounded-full bg-[#C2610F] px-3 py-2 text-sm font-bold text-white">VS</span>
                      </div>
                    )}
                    <div className={`flex-1 min-w-[14rem] rounded-xl border-2 p-4 flex flex-col gap-2 ${i === 0 ? 'border-[#1B3A5C] bg-[#F4F6F9]' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${i === 0 ? 'bg-[#1B3A5C] text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {i === 0 ? '1番目に申請（先着）' : `${i + 1}番目に申請`}
                        </span>
                        <span className="text-xs text-gray-500">{at(req.requestedAt)}</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ backgroundColor: color(req.requestingDeptId) }} />
                        {req.requestingDeptName}
                      </p>
                      <dl className="text-sm text-gray-700 space-y-0.5">
                        <div><dt className="inline text-gray-500">所要時間：</dt><dd className="inline text-lg font-bold">{req.durationMinutes ? fmt(req.durationMinutes) : '未入力'}</dd></div>
                        <div><FitLine req={req} release={release} /></div>
                        <div><dt className="inline text-gray-500">術式：</dt><dd className="inline font-bold">{req.procedure || '（未記入）'}</dd></div>
                        {req.notes && <div><dt className="inline text-gray-500">メモ：</dt><dd className="inline">{req.notes}</dd></div>}
                      </dl>
                      <button
                        type="button"
                        onClick={() => onApprove(req.id)}
                        className="mt-auto rounded-lg bg-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-700"
                      >
                        ⭕ {req.requestingDeptName}に決める
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">1科に決めると、ほかの科の申請は自動で「見送り」になり、全科に結果が通知されます。</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
