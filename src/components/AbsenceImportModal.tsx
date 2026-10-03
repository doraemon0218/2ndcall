'use client';

import { useState } from 'react';
import { Department } from '@/lib/types';
import { Absence } from './AbsenceModal';
import { generateId } from '@/lib/utils';

interface Props {
  departments: Department[];
  onImport: (absences: Omit<Absence, 'id' | 'createdAt'>[]) => void;
  onClose: () => void;
}

const CSV_TEMPLATE = `診療科名,担当者名,理由,開始日(YYYY-MM-DD),終了日(YYYY-MM-DD),メモ
整形外科,山田 部長,学会,2026-11-14,2026-11-16,整形外科学会（名古屋）
消化器外科,,学会,2026-12-05,2026-12-07,消化器外科学会（東京）
心臓血管外科,田中 部長,学会,2026-10-20,2026-10-21,胸部外科学会`;

export default function AbsenceImportModal({ departments, onImport, onClose }: Props) {
  const [tab, setTab] = useState<'csv' | 'text'>('csv');
  const [csvText, setCsvText] = useState('');
  const [freeText, setFreeText] = useState('');
  const [preview, setPreview] = useState<Omit<Absence, 'id' | 'createdAt'>[]>([]);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  function parseCSV(text: string): Omit<Absence, 'id' | 'createdAt'>[] {
    const lines = text.trim().split('\n').filter(l => l.trim());
    const dataLines = lines.filter(l => !l.startsWith('診療科名'));
    const results: Omit<Absence, 'id' | 'createdAt'>[] = [];
    const errors: string[] = [];

    dataLines.forEach((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 5) {
        errors.push(`行${i + 1}: 列数が不足しています`);
        return;
      }
      const [deptName, personName, reason, startDate, endDate, notes = ''] = cols;
      const dept = departments.find(d => d.name === deptName || d.shortName === deptName);
      if (!dept) {
        errors.push(`行${i + 1}: 診療科「${deptName}」が見つかりません`);
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        errors.push(`行${i + 1}: 日付形式が正しくありません（YYYY-MM-DD）`);
        return;
      }
      results.push({ deptId: dept.id, deptName: dept.name, personName, reason: reason || '学会', startDate, endDate, notes });
    });

    if (errors.length > 0) throw new Error(errors.join('\n'));
    return results;
  }

  function handleCSVParse() {
    setError('');
    try {
      const parsed = parseCSV(csvText);
      setPreview(parsed);
    } catch (e) {
      setError((e as Error).message);
      setPreview([]);
    }
  }

  async function handleAIParse() {
    setError('');
    setParsing(true);
    // Simulate AI parsing - in production this would call Claude API
    await new Promise(r => setTimeout(r, 800));

    // Heuristic fallback parser for demo
    try {
      const lines = freeText.split('\n').filter(l => l.trim());
      const results: Omit<Absence, 'id' | 'createdAt'>[] = [];
      const reasonKeywords: Record<string, string> = { '学会': '学会', '休暇': '休暇', '研修': '研修', '出張': '出張' };

      for (const line of lines) {
        // Try to find department
        const dept = departments.find(d => line.includes(d.name) || line.includes(d.shortName));
        if (!dept) continue;

        // Try to find dates (YYYY-MM-DD, M/D, M月D日 patterns)
        const datePattern = /(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?)(?:[〜~-](\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?))?/;
        const match = line.match(datePattern);
        if (!match) continue;

        const parseDate = (s: string) => {
          const cleaned = s.replace(/[年月\/]/g, '-').replace(/日/g, '').padEnd(10);
          const parts = cleaned.split('-').map(p => p.padStart(2, '0'));
          if (parts[0].length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`;
          return null;
        };

        const startDate = parseDate(match[1]);
        const endDate = match[2] ? parseDate(match[2]) : startDate;
        if (!startDate || !endDate) continue;

        const reason = Object.keys(reasonKeywords).find(k => line.includes(k)) ?? '学会';
        const notes = line.replace(dept.name, '').replace(dept.shortName, '').replace(match[0], '').trim();

        results.push({ deptId: dept.id, deptName: dept.name, personName: '', reason, startDate, endDate, notes });
      }

      if (results.length === 0) {
        setError('解析できたデータがありませんでした。テキストの形式を確認してください。');
      } else {
        setPreview(results);
      }
    } catch {
      setError('解析に失敗しました。');
    }
    setParsing(false);
  }

  function handleImport() {
    onImport(preview);
    onClose();
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'absence_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target?.result as string ?? '');
    reader.readAsText(file, 'UTF-8');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">学会・不在スケジュールを一括インポート</h2>
          <p className="text-xs text-gray-500 mt-0.5">CSV/Excel または テキストから一括登録。LLMで収集したデータも対応。</p>
        </div>

        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab('csv')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'csv' ? 'text-green-700 border-b-2 border-green-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📊 CSV / Excel インポート
          </button>
          <button
            onClick={() => setTab('text')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'text' ? 'text-blue-700 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            🤖 テキスト貼り付け（AI解析）
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {tab === 'csv' && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={downloadTemplate}
                  className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50 rounded-lg transition-colors"
                >
                  ↓ テンプレートをダウンロード
                </button>
                <label className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer">
                  📁 ファイルを選択
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSVテキスト（直接貼り付け可）</label>
                <textarea
                  rows={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  placeholder={`診療科名,担当者名,理由,開始日(YYYY-MM-DD),終了日(YYYY-MM-DD),メモ\n整形外科,山田 部長,学会,2026-11-14,2026-11-16,整形外科学会（名古屋）`}
                />
              </div>
              <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                <p className="font-medium text-gray-700 mb-1">対応フォーマット</p>
                <p>・診療科名: 登録されている診療科名（例: 整形外科）</p>
                <p>・日付: YYYY-MM-DD 形式（例: 2026-11-14）</p>
                <p>・理由: 学会 / 休暇 / 研修 / 出張 / その他</p>
              </div>
              <button
                onClick={handleCSVParse}
                disabled={!csvText.trim()}
                className="w-full py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 rounded-lg transition-colors"
              >
                解析してプレビュー
              </button>
            </>
          )}

          {tab === 'text' && (
            <>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                <p className="font-bold mb-1">🤖 AI解析モード</p>
                <p>LLMが収集した学会情報や、メール・お知らせからコピーしたテキストを貼り付けてください。</p>
                <p className="mt-1">例: 「整形外科 山田部長 2026年11月14日〜16日 整形外科学会（名古屋）」</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">テキストを貼り付け</label>
                <textarea
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={freeText}
                  onChange={e => setFreeText(e.target.value)}
                  placeholder={`整形外科 山田部長 2026年11月14日〜16日 整形外科学会（名古屋）\n消化器外科 2026-12-05〜2026-12-07 消化器外科学会（東京）\n心臓血管外科 田中部長 10/20〜10/21 胸部外科学会`}
                />
              </div>
              <button
                onClick={handleAIParse}
                disabled={!freeText.trim() || parsing}
                className="w-full py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {parsing ? (
                  <>
                    <span className="animate-spin">⟳</span> 解析中...
                  </>
                ) : '🤖 AIで自動解析'}
              </button>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {preview.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-800 mb-2">{preview.length}件のデータを取り込みます</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {preview.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs">
                    <span className="font-bold text-green-800 w-24 truncate">{a.deptName}</span>
                    <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 font-bold rounded">{a.reason}</span>
                    <span className="text-gray-600">{a.startDate} ~ {a.endDate}</span>
                    {a.personName && <span className="text-gray-400">{a.personName}</span>}
                    {a.notes && <span className="text-gray-400 truncate">{a.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            キャンセル
          </button>
          <button
            onClick={handleImport}
            disabled={preview.length === 0}
            className="flex-1 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
          >
            {preview.length > 0 ? `${preview.length}件を登録` : 'まず解析してください'}
          </button>
        </div>
      </div>
    </div>
  );
}
