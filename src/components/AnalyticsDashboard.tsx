'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Department, ReleasedSlot } from '@/lib/types';
import { AppEvent, EVENT_LABELS, eventsToCsv } from '@/lib/eventLog';
import { useEventLog } from '@/hooks/useEventLog';

export type NotificationCadence = 'instant' | '30m' | '1h' | '6h';
export type UpdateCycle = 'annual' | 'quarterly' | 'halfyearly';
export type FreeCutoff = 60 | 90 | 120;

interface Props {
  departments: Department[];
  releasedSlots: ReleasedSlot[];
  queuedNotifications: number;
  notificationCadence: NotificationCadence;
  updateCycle: UpdateCycle;
  onNotificationCadenceChange: (value: NotificationCadence) => void;
  onUpdateCycleChange: (value: UpdateCycle) => void;
  freeCutoff: FreeCutoff;
  onFreeCutoffChange: (value: FreeCutoff) => void;
  onOpenImport: () => void;
  onResetDemo: () => void;
  children?: React.ReactNode; // 稼働率などの既存集計
}

const CADENCE_OPTIONS: Array<{ value: NotificationCadence; label: string }> = [
  { value: 'instant', label: 'すぐ' },
  { value: '30m', label: '30分ごと' },
  { value: '1h', label: '1時間ごと' },
  { value: '6h', label: '6時間ごと' },
];

const CUTOFF_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '60', label: '1時間' },
  { value: '90', label: '1.5時間' },
  { value: '120', label: '2時間' },
];

const CYCLE_OPTIONS: Array<{ value: UpdateCycle; label: string }> = [
  { value: 'quarterly', label: '3か月' },
  { value: 'halfyearly', label: '6か月' },
  { value: 'annual', label: '1年' },
];

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)}分`;
  if (min < 60 * 24) return `${(min / 60).toFixed(1)}時間`;
  return `${(min / 60 / 24).toFixed(1)}日`;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap bg-gray-100 rounded-lg p-1 gap-1">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm font-bold rounded-md transition-colors ${value === opt.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard({
  departments, releasedSlots, queuedNotifications,
  notificationCadence, updateCycle, onNotificationCadenceChange, onUpdateCycleChange, freeCutoff, onFreeCutoffChange, onOpenImport, onResetDemo, children,
}: Props) {
  const events = useEventLog();
  const [showLog, setShowLog] = useState(false);

  const ofType = (type: AppEvent['type']) => events.filter(e => e.type === type);
  const released = ofType('slot_released');
  const approved = ofType('request_approved');
  const assigned = ofType('slot_assigned');
  const rejectedByManager = ofType('request_rejected').filter(e => e.data.reason === 'manager_rejected');
  const cancelledUnused = ofType('release_cancelled').filter(e => !e.data.wasClaimed);
  const moved = approved.length + assigned.length;

  const approvalRate = approved.length + rejectedByManager.length > 0
    ? Math.round((approved.length / (approved.length + rejectedByManager.length)) * 100)
    : null;
  const avgDecision = average(approved.concat(rejectedByManager).map(e => Number(e.data.minutesToDecision)).filter(n => !Number.isNaN(n)));
  const avgLeadDays = average(released.map(e => Number(e.data.leadDays)).filter(n => !Number.isNaN(n)));
  const avgFillTime = average(approved.concat(assigned).map(e => Number(e.data.minutesSinceRelease)).filter(n => !Number.isNaN(n)));

  const reasonCounts = released.reduce<Record<string, number>>((acc, e) => {
    const key = String(e.data.reasonLabel || (e.data.source === 'absence' ? '不在・学会' : '手動共有'));
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const reasonRows = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasonRows.map(([, n]) => n));

  const deptRows = departments.map(dept => {
    const countBy = (list: AppEvent[], key: string) => list.filter(e => e.data[key] === dept.id).length;
    return {
      dept,
      released: countBy(released, 'ownerDeptId'),
      requested: countBy(ofType('request_submitted'), 'requestingDeptId'),
      acquired: countBy(approved, 'requestingDeptId') + countBy(assigned, 'claimedByDeptId'),
      rejected: countBy(ofType('request_rejected'), 'requestingDeptId'),
      cancelledUnused: countBy(cancelledUnused, 'ownerDeptId'),
    };
  });

  const history = releasedSlots
    .filter(r => r.claimedByDeptId)
    .sort((a, b) => (b.claimedAt ?? '').localeCompare(a.claimedAt ?? ''))
    .slice(0, 10);

  const kpis = [
    { label: '共有された枠', value: `${released.length}`, sub: 'これまでの累計' },
    { label: '空き枠を埋めた', value: `${moved}`, sub: `＝追加で受け入れた手術（入院）の見込み` },
    { label: '使われず取消', value: `${cancelledUnused.length}`, sub: '共有後に取り下げ' },
    { label: '承認率', value: approvalRate === null ? '—' : `${approvalRate}%`, sub: `却下 ${rejectedByManager.length}件` },
    { label: '承認までの平均', value: formatMinutes(avgDecision), sub: '申請 → 判断' },
    { label: '共有 → 確定の平均', value: formatMinutes(avgFillTime), sub: '空き枠が埋まるまで' },
    { label: '共有の平均リードタイム', value: avgLeadDays === null ? '—' : `${avgLeadDays.toFixed(1)}日前`, sub: '手術日の何日前に共有' },
  ];

  return (
    <div className="space-y-5">
      {/* ── KPI ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">空き枠の活用</h3>
            <p className="text-xs text-gray-500 mt-0.5">操作履歴 {events.length}件から集計（このブラウザに蓄積。取消・却下も含む）</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => download(`or-event-log-${format(new Date(), 'yyyyMMdd')}.csv`, eventsToCsv(events), 'text/csv;charset=utf-8')}
              disabled={events.length === 0}
              className="px-3 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg"
            >
              CSVで書き出し
            </button>
            <button
              type="button"
              onClick={() => download(`or-event-log-${format(new Date(), 'yyyyMMdd')}.json`, JSON.stringify(events, null, 2), 'application/json')}
              disabled={events.length === 0}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 rounded-lg border border-gray-200"
            >
              JSON
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          {kpis.map(k => (
            <div key={k.label} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="text-[11px] font-bold text-gray-500">{k.label}</div>
              <div className="mt-1 text-xl font-bold text-gray-900">{k.value}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 診療科別 ── */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm overflow-x-auto">
          <h3 className="text-base font-bold text-gray-900 mb-3">診療科別</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 border-b border-gray-100">
                <th className="py-1.5 font-bold">診療科</th>
                <th className="py-1.5 font-bold text-right">共有</th>
                <th className="py-1.5 font-bold text-right">使われず取消</th>
                <th className="py-1.5 font-bold text-right">申請</th>
                <th className="py-1.5 font-bold text-right">獲得</th>
                <th className="py-1.5 font-bold text-right">却下</th>
              </tr>
            </thead>
            <tbody>
              {deptRows.map(row => (
                <tr key={row.dept.id} className="border-b border-gray-50">
                  <td className="py-1.5 font-bold text-gray-800">{row.dept.name}</td>
                  <td className="py-1.5 text-right font-mono">{row.released}</td>
                  <td className="py-1.5 text-right font-mono">{row.cancelledUnused}</td>
                  <td className="py-1.5 text-right font-mono">{row.requested}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-blue-700">{row.acquired}</td>
                  <td className="py-1.5 text-right font-mono">{row.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── 共有理由 ── */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-3">枠が空いた理由</h3>
          {reasonRows.length === 0 ? (
            <p className="text-sm text-gray-500">まだ共有された枠はありません。</p>
          ) : (
            <div className="space-y-2">
              {reasonRows.map(([label, count]) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <span className="w-28 flex-shrink-0 truncate text-gray-700">{label}</span>
                  <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${(count / maxReason) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-gray-700">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {children}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 枠移動の履歴 ── */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-3">最近の枠移動</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">まだ移動した枠はありません。</p>
          ) : (
            <div className="space-y-1.5">
              {history.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span className="font-bold text-gray-800">{r.ownerDeptName} → {r.claimedByDeptName}</span>
                  <span className="text-xs text-gray-500">{r.date} · 手術室{r.roomId.replace('or', '')} · {r.startHour}:00–{r.endHour}:00</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 操作履歴 ── */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">操作履歴</h3>
            <button type="button" onClick={() => setShowLog(v => !v)} className="text-xs font-bold text-blue-600 hover:underline">
              {showLog ? '閉じる' : `直近30件を表示`}
            </button>
          </div>
          {showLog && (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {events.slice(-30).reverse().map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs border-b border-gray-50 py-1">
                  <span className="font-mono text-gray-400 w-24 flex-shrink-0">{format(new Date(e.at), 'M/d HH:mm', { locale: ja })}</span>
                  <span className="font-bold text-gray-700">{EVENT_LABELS[e.type] ?? e.type}</span>
                  <span className="text-gray-500 truncate">{e.actor.role === 'manager' ? '管理者' : e.actor.deptName ?? ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {/* ── 運用設定 ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">運用設定</h3>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          <div>
            <p className="text-sm font-bold text-gray-800">「一部空き」とみなす時間</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">予定の合間に、この時間以上の空きがある枠を「一部空き」と表示します。予定が1件もない枠は「空き」です。</p>
            <Segmented value={String(freeCutoff)} options={CUTOFF_OPTIONS} onChange={v => onFreeCutoffChange(Number(v) as FreeCutoff)} />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">枠移動の通知タイミング</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">承認した枠移動を、全診療科部長へまとめて知らせる間隔です。</p>
            <Segmented value={notificationCadence} options={CADENCE_OPTIONS} onChange={onNotificationCadenceChange} />
            {queuedNotifications > 0 && (
              <p className="mt-2 text-xs font-bold text-amber-700">送信待ちの通知: {queuedNotifications}件</p>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">枠の見直し周期</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">診療科ごとの保有枠を見直す間隔です（現在は記録のみ。自動の再配分はまだありません）。</p>
            <Segmented value={updateCycle} options={CYCLE_OPTIONS} onChange={onUpdateCycleChange} />
          </div>
        </div>
      </section>

      {/* ── データ管理 ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">データ管理</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={onOpenImport} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
            📥 予定表を取り込む（同じ日付は上書き）
          </button>
          <button type="button" onClick={onResetDemo} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            ↺ デモデータに戻す
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">今はデモ用の予定が入っています。電子カルテの予定表を取り込むと、その日付の予定だけが置き換わります。</p>
      </section>
    </div>
  );
}
