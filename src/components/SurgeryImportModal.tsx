'use client';

import { useState } from 'react';
import { getDay } from 'date-fns';
import { Department, OperatingRoom, SlotAllocation, Surgery } from '@/lib/types';

interface Props {
  departments: Department[];
  rooms: OperatingRoom[];
  allocations: SlotAllocation[];
  existingSurgeries: Surgery[];
  onImport: (dates: string[], surgeries: Omit<Surgery, 'id'>[]) => void;
  onClose: () => void;
}

// 予定表に必要な項目（電子カルテ出力の列名は施設で異なるため、候補語で自動判定し画面で選び直せる）
const FIELDS = [
  { key: 'date', label: '手術日', required: true, hints: ['手術日', '予定日', '実施日', '日付'] },
  { key: 'room', label: '手術室', required: true, hints: ['手術室', '部屋', '室名', 'ルーム'] },
  { key: 'dept', label: '診療科', required: true, hints: ['診療科', '依頼科', '科名', '科'] },
  { key: 'procedure', label: '術式', required: false, hints: ['術式', '手術名', '予定術式'] },
  { key: 'start', label: '入室時刻', required: true, hints: ['予定入室', '入室予定', '入室時刻', '入室'] },
  { key: 'duration', label: '手術所要時間', required: true, hints: ['予定手術時間', '手術予定時間', '予定時間', '所要時間', '所要', '手術時間'] },
] as const;
type FieldKey = typeof FIELDS[number]['key'];
type Mapping = Record<FieldKey, number>;

const DEPT_ALIASES: Record<string, string[]> = {
  general: ['外科', '消化器外科', '一般外科', '消化器・一般外科'],
  thoracic: ['呼吸器外科'],
  ent: ['耳鼻咽喉科', '耳鼻科', '頭頸部外科'],
  eye: ['眼科'],
  breast: ['乳腺外科', '乳腺・内分泌外科'],
};

function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

// ダブルクォート・セル内改行に対応した CSV パーサ
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function guessMapping(header: string[]): Mapping {
  const used = new Set<number>();
  const m = {} as Mapping;
  for (const f of FIELDS) {
    let idx = -1;
    for (const hint of f.hints) {
      idx = header.findIndex((h, i) => !used.has(i) && h.trim() === hint);
      if (idx < 0) idx = header.findIndex((h, i) => !used.has(i) && h.includes(hint));
      if (idx >= 0) break;
    }
    m[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return m;
}

function toDateStr(v: string): string | null {
  const m = v.trim().match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

function toMinutes(v: string): number | null {
  const s = v.trim();
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  if (/^\d+$/.test(s)) return Number(s); // 「90」のような分表記
  return null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export default function SurgeryImportModal({ departments, rooms, allocations, existingSurgeries, onImport, onClose }: Props) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState('');

  const header = rows[0] ?? [];
  const body = rows.slice(1);

  async function handleFile(file: File) {
    setError('');
    if (/\.xlsx?$/i.test(file.name)) {
      setError('Excelファイルは「名前を付けて保存」→「CSV」で保存してから選んでください。');
      return;
    }
    const parsed = parseCsv(decode(await file.arrayBuffer()));
    if (parsed.length < 2) {
      setError('データが見つかりませんでした。1行目が列名のCSVを選んでください。');
      return;
    }
    setFileName(file.name);
    setRows(parsed);
    setMapping(guessMapping(parsed[0]));
  }

  function matchRoom(v: string): OperatingRoom | undefined {
    const text = v.trim();
    const exact = rooms.find(r => r.name === text);
    if (exact) return exact;
    const num = text.match(/(\d+)/)?.[1];
    if (!num || /外来/.test(text)) return undefined;
    return rooms.find(r => r.id === `or${Number(num)}`);
  }

  function matchDept(v: string): Department | undefined {
    const text = v.trim().replace(/\s/g, '');
    return departments.find(d => d.name === text)
      ?? departments.find(d => DEPT_ALIASES[d.id]?.includes(text))
      ?? departments.find(d => text.includes(d.name) || d.name.includes(text));
  }

  // プレビュー計算
  const ready = mapping && FIELDS.every(f => !f.required || mapping[f.key] >= 0);
  const parsedRows = ready && mapping ? body.map(r => {
    const cell = (k: FieldKey) => (mapping[k] >= 0 ? r[mapping[k]] ?? '' : '');
    const date = toDateStr(cell('date'));
    const room = matchRoom(cell('room'));
    const dept = matchDept(cell('dept'));
    const start = toMinutes(cell('start'));
    const duration = toMinutes(cell('duration'));
    const problems: string[] = [];
    if (!date) problems.push('日付');
    if (!room) problems.push(`部屋「${cell('room').trim()}」`);
    if (!dept) problems.push(`診療科「${cell('dept').trim()}」`);
    if (start === null) problems.push('入室時刻');
    if (duration === null) problems.push('所要時間');
    return { date, room, dept, start, duration, procedure: cell('procedure').split('\n')[0].trim(), problems };
  }) : [];
  const ok = parsedRows.filter(r => r.problems.length === 0);
  const skipped = parsedRows.filter(r => r.problems.length > 0);
  const dates = Array.from(new Set(ok.map(r => r.date!))).sort();
  const replacedCount = existingSurgeries.filter(s => dates.includes(s.date)).length;
  const skipReasons = Array.from(new Set(skipped.flatMap(r => r.problems))).slice(0, 6);

  function handleImport() {
    const surgeries: Omit<Surgery, 'id'>[] = ok.map(r => {
      const dow = getDay(new Date(`${r.date}T00:00:00`)) || 7;
      const alloc = allocations.find(a =>
        a.roomId === r.room!.id && a.dayOfWeek === dow &&
        r.start! >= a.startHour * 60 + a.startMin && r.start! < a.endHour * 60 + a.endMin,
      );
      return {
        date: r.date!, roomId: r.room!.id,
        startTime: hhmm(r.start!), endTime: hhmm(r.start! + r.duration!),
        patientName: '', procedure: r.procedure || '（術式未記載）', surgeonName: '',
        deptId: r.dept!.id, deptName: r.dept!.name,
        status: 'scheduled', isEmergency: false, notes: `取込: ${fileName}`,
        allocationId: alloc?.id,
      };
    });
    onImport(dates, surgeries);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">📥 予定表を取り込む</h2>
          <p className="text-sm text-gray-500 mt-1">電子カルテから出した予定表（CSV）を選ぶと、<b>同じ日付の予定が入れ替わります</b>。</p>
        </div>

        <div className="p-6 space-y-5">
          {/* 手順1 */}
          <div>
            <p className="text-sm font-bold text-gray-800 mb-2">① ファイルを選ぶ</p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-8 cursor-pointer hover:bg-blue-100">
              <span className="text-3xl">📄</span>
              <span className="text-base font-bold text-blue-700">{fileName || 'ここを押してファイルを選ぶ'}</span>
              <span className="text-xs text-gray-500">CSV形式（Excelは「CSVで保存」してから）</span>
              <input type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
            {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
          </div>

          {/* 手順2 */}
          {mapping && (
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">② 列の対応を確認（自動で選んであります）</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map(f => (
                  <label key={f.key} className="flex items-center gap-2 text-sm">
                    <span className="w-28 flex-shrink-0 font-bold text-gray-700">{f.label}{f.required && <span className="text-red-500">*</span>}</span>
                    <select
                      className={`flex-1 rounded-lg border px-2 py-1.5 ${mapping[f.key] < 0 && f.required ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                      value={mapping[f.key]}
                      onChange={e => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                    >
                      <option value={-1}>（使わない）</option>
                      {header.map((h, i) => <option key={i} value={i}>{h || `列${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 手順3 */}
          {ready && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-bold text-gray-800 mb-2">③ 内容を確認</p>
              <ul className="space-y-1 text-sm text-gray-700">
                <li>取り込む手術: <b className="text-lg text-blue-700">{ok.length}件</b>（{dates[0] ?? '—'} 〜 {dates[dates.length - 1] ?? '—'}・{dates.length}日分）</li>
                <li>入れ替わる今の予定: <b>{replacedCount}件</b></li>
                {skipped.length > 0 && (
                  <li className="text-amber-700">読み取れず飛ばす行: <b>{skipped.length}件</b>（{skipReasons.join('、')}）</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-3 text-base text-gray-600 hover:bg-gray-50">
            やめる
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!ready || ok.length === 0}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {ok.length > 0 ? `${ok.length}件を取り込む` : '取り込む'}
          </button>
        </div>
      </div>
    </div>
  );
}
