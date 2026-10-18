'use client';

import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export type NotificationCadence = 'instant' | '30m' | '1h' | '6h';

export interface NotificationItem {
  id: string;
  deptId: string;
  deptName: string;
  title: string;
  body: string;
  createdAt: string;
  scheduledAt: string;
  status: 'queued' | 'sent';
}

interface Props {
  notifications: NotificationItem[];
  cadence: NotificationCadence;
  onCadenceChange: (value: NotificationCadence) => void;
}

const OPTIONS: Array<{ value: NotificationCadence; label: string }> = [
  { value: 'instant', label: 'すぐ' },
  { value: '30m', label: '30分ごと' },
  { value: '1h', label: '1時間ごと' },
  { value: '6h', label: '6時間ごと' },
];

// 承認すると全診療科部長へ自動で届く通知の、タイミング設定と送信記録
export default function NotificationPanel({ notifications, cadence, onCadenceChange }: Props) {
  // 1回の承認 = 全科分の通知。本文と作成時刻でまとめて1行にする
  const groups = Object.values(
    notifications.reduce<Record<string, { body: string; createdAt: string; scheduledAt: string; total: number; sent: number }>>((acc, n) => {
      const k = `${n.createdAt}|${n.body}`;
      acc[k] ??= { body: n.body, createdAt: n.createdAt, scheduledAt: n.scheduledAt, total: 0, sent: 0 };
      acc[k].total++;
      if (n.status === 'sent') acc[k].sent++;
      return acc;
    }, {}),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">📣 自動通知</h3>
          <p className="text-sm text-gray-500 mt-0.5">承認すると、枠の移譲が全診療科部長へ自動で知らされます</p>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-600 mb-1">送るタイミング</p>
          <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
            {OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => onCadenceChange(o.value)}
                className={`px-3 py-1.5 text-sm font-bold rounded-md ${cadence === o.value ? 'bg-white text-[#1B3A5C] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">まだ通知はありません。移譲依頼を承認すると、ここに送信の記録が出ます。</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {groups.map(g => {
            const done = g.sent === g.total;
            return (
              <li key={`${g.createdAt}${g.body}`} className="py-2.5 flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${done ? 'bg-[#E9EDF2] text-[#1B3A5C]' : 'bg-[#FDF3EA] text-[#C2610F]'}`}>
                  {done ? '送信済み' : '送信予定'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">{g.body}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {g.total}科へ・{done ? '送信' : '予定'} {format(new Date(g.scheduledAt), 'M/d HH:mm', { locale: ja })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
