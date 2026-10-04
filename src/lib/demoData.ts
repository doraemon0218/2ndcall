// デモ用データセット
// 説明時にデータ取り込みから始めなくて済むよう、開いた日を基準に
// 「過去4週〜再来週」の手術予定・空き枠・共有・申請・分析履歴を生成する。
// 乱数は日付ベースの固定シードなので、同じ週なら何度開いても同じ内容になる。
// 患者名・医師名は含めない（実名を連想させない表記のみ）。

import { format, addDays, addWeeks, subMinutes } from 'date-fns';
import { Department, OperatingRoom, SlotAllocation, Surgery, ReleasedSlot, SlotRequest, PERIOD_HOURS } from './types';
import { getOperatingWeekStart } from './utils';
import type { AppEvent } from './eventLog';

// 当院の標準手術枠（新設案）に合わせた診療科。shortName は院内の略称（予定表の取込照合にも使う）
export const DEMO_DEPARTMENTS: Department[] = [
  { id: 'cardio_int', name: '循環器内科',   shortName: '循内科',   color: 'bg-sky-500',     textColor: 'text-sky-700' },
  { id: 'derma',      name: '皮膚科',       shortName: '皮膚科',   color: 'bg-lime-500',    textColor: 'text-lime-700' },
  { id: 'general',    name: '消化器外科',   shortName: '消化外',   color: 'bg-green-500',   textColor: 'text-green-700' },
  { id: 'thoracic',   name: '呼吸器外科',   shortName: '呼吸外',   color: 'bg-teal-500',    textColor: 'text-teal-700' },
  { id: 'neuro',      name: '脳神経外科',   shortName: '脳外科',   color: 'bg-purple-500',  textColor: 'text-purple-700' },
  { id: 'cardio',     name: '心臓血管外科', shortName: '心血管',   color: 'bg-red-500',     textColor: 'text-red-700' },
  { id: 'gyne',       name: '産婦人科',     shortName: '産婦人',   color: 'bg-pink-500',    textColor: 'text-pink-700' },
  { id: 'eye',        name: '眼科',         shortName: '眼科',     color: 'bg-cyan-500',    textColor: 'text-cyan-700' },
  { id: 'ent',        name: '耳鼻咽喉科・頭頸部外科', shortName: '耳鼻頸', color: 'bg-orange-500', textColor: 'text-orange-700' },
  { id: 'ortho',      name: '整形外科',     shortName: '整形外',   color: 'bg-blue-500',    textColor: 'text-blue-700' },
  { id: 'uro',        name: '泌尿器科',     shortName: '泌尿器',   color: 'bg-yellow-500',  textColor: 'text-yellow-700' },
  { id: 'dental',     name: '歯科',         shortName: '歯科',     color: 'bg-amber-500',   textColor: 'text-amber-700' },
  { id: 'plastic',    name: '形成外科',     shortName: '形成外',   color: 'bg-indigo-500',  textColor: 'text-indigo-700' },
  { id: 'dialysis',   name: '腎透析',       shortName: '腎透析',   color: 'bg-slate-500',   textColor: 'text-slate-700' },
  { id: 'breast',     name: '乳腺外科',     shortName: '乳腺外',   color: 'bg-rose-500',    textColor: 'text-rose-700' },
  { id: 'anesth',     name: '麻酔科（診察）', shortName: '麻酔診察', color: 'bg-violet-500', textColor: 'text-violet-700' },
];

// 当院の標準手術枠：診療科ごとの曜日別の枠数（1 = 1室の終日、0.5 = 半日）
const WEEKLY_UNITS: Record<string, [number, number, number, number, number]> = {
  cardio_int: [0, 0, 1, 1, 0],
  derma:      [0, 0, 0, 0, 0],
  general:    [2, 2, 2, 1, 1],
  thoracic:   [0, 1, 0, 2, 0],
  neuro:      [1, 0, 1, 0, 1],
  cardio:     [2, 2, 0, 1, 1],
  gyne:       [1, 2, 1, 2, 0],
  eye:        [0, 0, 1, 0, 0],
  ent:        [0, 0, 2, 1, 2],
  ortho:      [1, 1, 0, 0, 2],
  uro:        [1, 0, 1, 0, 2],
  dental:     [0, 0, 0.5, 0, 0],
  plastic:    [0, 1, 0, 1, 0],
  dialysis:   [0, 0, 0, 0, 0],
  breast:     [1, 0, 0, 1, 0],
  anesth:     [1, 1, 0.5, 1, 1],
};

const ROOM_COUNT = Math.max(...[0, 1, 2, 3, 4].map(d => Math.ceil(Object.values(WEEKLY_UNITS).reduce((sum, u) => sum + u[d], 0))));

export const DEMO_ROOMS: OperatingRoom[] = Array.from({ length: ROOM_COUNT }, (_, i) => ({
  id: `or${i + 1}`,
  name: `手術室${i + 1}`,
  order: i + 1,
}));

const deptById = (id: string) => DEMO_DEPARTMENTS.find(d => d.id === id)!;

// 枠数表を部屋に割り当てる。同じ科はできるだけ毎日同じ部屋にする。半日枠は1室の午前・午後に詰める。
function buildAllocations(): SlotAllocation[] {
  const preferred = new Map<string, number[]>();
  const result: SlotAllocation[] = [];
  const make = (roomIdx: number, dow: number, period: 'am' | 'pm', deptId: string): SlotAllocation => ({
    id: `or${roomIdx + 1}-${dow}-${period}`,
    roomId: `or${roomIdx + 1}`,
    dayOfWeek: dow,
    period,
    ...PERIOD_HOURS[period],
    deptId,
    deptName: deptById(deptId).name,
    notes: '',
  });

  for (let d = 0; d < 5; d++) {
    const dow = d + 1;
    const taken: Array<{ am?: string; pm?: string }> = Array.from({ length: ROOM_COUNT }, () => ({}));
    const halves: string[] = [];
    const free = (i: number) => !taken[i].am && !taken[i].pm;
    const remaining = new Map<string, number>();
    for (const dept of DEMO_DEPARTMENTS) {
      const units = WEEKLY_UNITS[dept.id]?.[d] ?? 0;
      const full = Math.floor(units);
      if (units - full >= 0.5) halves.push(dept.id);
      remaining.set(dept.id, full);
    }
    // 1) これまでと同じ部屋を先に確保
    for (const dept of DEMO_DEPARTMENTS) {
      for (const idx of preferred.get(dept.id) ?? []) {
        if ((remaining.get(dept.id) ?? 0) > 0 && free(idx)) {
          taken[idx] = { am: dept.id, pm: dept.id };
          remaining.set(dept.id, remaining.get(dept.id)! - 1);
        }
      }
    }
    // 2) 残りは空いている部屋へ
    for (const dept of DEMO_DEPARTMENTS) {
      const prefs = preferred.get(dept.id) ?? [];
      while ((remaining.get(dept.id) ?? 0) > 0) {
        const idx = taken.findIndex((_, i) => free(i));
        if (idx < 0) break;
        taken[idx] = { am: dept.id, pm: dept.id };
        remaining.set(dept.id, remaining.get(dept.id)! - 1);
        if (!prefs.includes(idx)) prefs.push(idx);
      }
      preferred.set(dept.id, prefs);
    }
    for (const deptId of halves) {
      let idx = taken.findIndex(t => (t.am && !t.pm) || (!t.am && t.pm));
      if (idx < 0) idx = taken.findIndex(t => !t.am && !t.pm);
      if (idx < 0) continue;
      if (!taken[idx].am) taken[idx].am = deptId; else taken[idx].pm = deptId;
    }
    taken.forEach((t, i) => {
      if (t.am) result.push(make(i, dow, 'am', t.am));
      if (t.pm) result.push(make(i, dow, 'pm', t.pm));
    });
  }
  return result;
}

export const DEMO_ALLOCATIONS: SlotAllocation[] = buildAllocations();

// 診療科ごとの代表的な術式と所要時間（分）
const PROCEDURES: Record<string, Array<[string, number]>> = {
  general:  [['腹腔鏡下胆嚢摘出術', 90], ['腹腔鏡下結腸切除術', 210], ['鼠径ヘルニア修復術', 70], ['胃切除術', 240], ['虫垂切除術', 60]],
  ortho:    [['人工膝関節置換術', 150], ['人工股関節置換術', 140], ['骨折観血的手術', 100], ['脊椎固定術', 210], ['関節鏡視下手術', 80]],
  cardio:   [['冠動脈バイパス術', 300], ['弁置換術', 270], ['ステントグラフト内挿術', 180]],
  neuro:    [['開頭腫瘍摘出術', 300], ['慢性硬膜下血腫穿孔洗浄術', 60], ['脊椎除圧術', 150]],
  uro:      [['経尿道的膀胱腫瘍切除術', 60], ['腹腔鏡下腎摘除術', 210], ['経尿道的尿管結石破砕術', 90], ['前立腺全摘除術', 240]],
  gyne:     [['腹腔鏡下子宮全摘術', 180], ['子宮鏡下ポリープ切除術', 40], ['帝王切開術', 70], ['付属器摘出術', 100]],
  thoracic: [['胸腔鏡下肺葉切除術', 210], ['胸腔鏡下肺部分切除術', 100], ['縦隔腫瘍摘出術', 150]],
  breast:   [['乳房部分切除術', 100], ['乳房全切除術', 150], ['センチネルリンパ節生検', 60]],
  ent:      [['内視鏡下鼻副鼻腔手術', 120], ['扁桃摘出術', 60], ['甲状腺切除術', 150], ['鼓室形成術', 150]],
  eye:      [['水晶体再建術', 20], ['硝子体茎離断術', 60], ['緑内障手術', 50]],
  plastic:  [['皮弁形成術', 150], ['皮膚腫瘍摘出術', 50], ['眼瞼下垂手術', 70]],
  derma:    [['皮膚悪性腫瘍切除術', 70], ['植皮術', 90]],
  cardio_int: [['ペースメーカー植込術', 90], ['カテーテルアブレーション', 180], ['経皮的左心耳閉鎖術', 90]],
  dental:   [['埋伏歯抜歯術', 60], ['顎骨嚢胞摘出術', 90]],
  anesth:   [['神経ブロック', 30], ['中心静脈ポート留置', 40]],
};

// 固定シード乱数（mulberry32）
function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export interface DemoDataset {
  departments: Department[];
  rooms: OperatingRoom[];
  allocations: SlotAllocation[];
  surgeries: Surgery[];
  releasedSlots: ReleasedSlot[];
  slotRequests: SlotRequest[];
  absences: Array<{ id: string; deptId: string; deptName: string; personName: string; reason: string; reasonType?: 'positive' | 'negative' | 'neutral'; startDate: string; endDate: string; notes: string; createdAt: string }>;
  events: AppEvent[];
}

type Fill = 'full' | 'partial' | 'empty';

export function buildDemoDataset(today: Date = new Date()): DemoDataset {
  const weekStart = getOperatingWeekStart(today); // 「今週」の月曜
  const todayStr = ymd(today);
  const surgeries: Surgery[] = [];
  const emptySlots: Array<{ alloc: SlotAllocation; date: string; weekOffset: number }> = [];
  let seq = 0;

  // 週ごとの埋まり具合：過去はほぼ実施済、来週・再来週ほど空きが多い
  const fillWeights: Record<number, [number, number]> = {
    [-4]: [0.72, 0.95], [-3]: [0.72, 0.95], [-2]: [0.70, 0.94], [-1]: [0.70, 0.93],
    0: [0.68, 0.92], 1: [0.55, 0.85], 2: [0.35, 0.68],
  };

  for (let w = -4; w <= 2; w++) {
    for (let dow = 1; dow <= 5; dow++) {
      const date = addDays(addWeeks(weekStart, w), dow - 1);
      const dateStr = ymd(date);
      for (const alloc of DEMO_ALLOCATIONS.filter(a => a.dayOfWeek === dow)) {
        const r = rng(`${alloc.id}-${dateStr}`);
        const [pFull, pPartial] = fillWeights[w];
        const roll = r();
        const fill: Fill = roll < pFull ? 'full' : roll < pPartial ? 'partial' : 'empty';
        if (fill === 'empty') {
          emptySlots.push({ alloc, date: dateStr, weekOffset: w });
          continue;
        }
        const winStart = alloc.startHour * 60 + alloc.startMin + (alloc.period === 'am' ? 45 : 0);
        const winEnd = alloc.endHour * 60 + alloc.endMin;
        const limit = fill === 'full' ? winEnd + 20 : winStart + (winEnd - winStart) * (0.35 + r() * 0.25);
        const menu = PROCEDURES[alloc.deptId] ?? [['手術', 90]];
        let cursor = winStart;
        let caseNo = 0;
        while (cursor < limit) {
          const [procedure, base] = menu[Math.floor(r() * menu.length)];
          const duration = Math.max(15, Math.round((base * (0.85 + r() * 0.3)) / 5) * 5);
          if (caseNo > 0 && cursor + duration > winEnd + 30) break;
          const isPast = dateStr < todayStr;
          surgeries.push({
            id: `demo-s${++seq}`,
            date: dateStr,
            roomId: alloc.roomId,
            startTime: hhmm(cursor),
            endTime: hhmm(cursor + duration),
            patientName: '',
            procedure,
            surgeonName: `${deptById(alloc.deptId).shortName} 担当医${String.fromCharCode(65 + Math.floor(r() * 4))}`,
            deptId: alloc.deptId,
            deptName: alloc.deptName,
            status: isPast ? 'completed' : 'scheduled',
            isEmergency: false,
            notes: '',
            allocationId: alloc.id,
          });
          cursor += duration + 30; // 入替時間
          caseNo++;
        }
      }
    }
  }

  // ── 共有・申請（来週・再来週の空き枠から） ──
  const now = today.getTime();
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
  const releasedSlots: ReleasedSlot[] = [];
  const slotRequests: SlotRequest[] = [];
  const future = emptySlots.filter(s => s.weekOffset >= 1 && s.date > todayStr);
  const pick = (pred: (s: typeof future[number]) => boolean) => {
    const i = future.findIndex(pred);
    return i >= 0 ? future.splice(i, 1)[0] : undefined;
  };
  const makeRelease = (s: typeof future[number], id: string, reasonLabel: string, reasonType: ReleasedSlot['reasonType'], source: ReleasedSlot['source'], minutesAgo: number): ReleasedSlot => ({
    id,
    allocationId: s.alloc.id,
    date: s.date,
    roomId: s.alloc.roomId,
    ownerDeptId: s.alloc.deptId,
    ownerDeptName: s.alloc.deptName,
    period: s.alloc.period,
    startHour: s.alloc.startHour,
    endHour: s.alloc.endHour,
    releasedAt: iso(minutesAgo),
    releasedBy: s.alloc.deptName,
    message: `${reasonLabel}のため共有`,
    reasonType,
    reasonLabel,
    source,
    status: 'open',
  });

  // 1) 学会で自動共有（脳神経外科）＋ 対応する不在登録
  const neuroEmpty = pick(s => s.alloc.deptId === 'neuro') ?? pick(() => true);
  // 2) 承認待ち（2科が競合）
  const contested = pick(s => s.alloc.deptId !== neuroEmpty?.alloc.deptId);
  // 3) 承認待ち（1科）
  const single = pick(() => true);
  // 4) 移動確定済み
  const moved = pick(() => true);
  // 5) 共有中（申請なし）
  const openOnes = [pick(() => true), pick(() => true)].filter(Boolean) as typeof future;

  const absences: DemoDataset['absences'] = [];
  if (neuroEmpty) {
    releasedSlots.push(makeRelease(neuroEmpty, 'demo-r1', '学会', 'positive', 'absence', 60 * 30));
    absences.push({
      id: 'demo-a1', deptId: neuroEmpty.alloc.deptId, deptName: neuroEmpty.alloc.deptName, personName: '',
      reason: '学会', reasonType: 'positive', startDate: neuroEmpty.date, endDate: neuroEmpty.date, notes: 'デモデータ', createdAt: iso(60 * 30),
    });
  }
  const otherDept = (excludeId: string, offset: number) => {
    const list = DEMO_DEPARTMENTS.filter(d => d.id !== excludeId);
    return list[offset % list.length];
  };
  const addRequest = (release: ReleasedSlot, dept: Department, id: string, minutesAgo: number, status: SlotRequest['status'] = 'pending') => {
    slotRequests.push({
      id, releaseId: release.id, date: release.date, roomId: release.roomId,
      requestingDeptId: dept.id, requestingDeptName: dept.name,
      procedure: (PROCEDURES[dept.id] ?? [['手術', 90]])[0][0], surgeonName: '',
      wantedStartTime: hhmm(release.startHour * 60), wantedEndTime: hhmm(release.endHour * 60),
      notes: '', requestedAt: iso(minutesAgo), status,
    });
  };
  if (contested) {
    const r = makeRelease(contested, 'demo-r2', '外来日の変更', 'neutral', 'manual', 60 * 20);
    releasedSlots.push(r);
    addRequest(r, otherDept(r.ownerDeptId, 0), 'demo-q1', 60 * 6);
    addRequest(r, otherDept(r.ownerDeptId, 3), 'demo-q2', 60 * 2);
  }
  if (single) {
    const r = makeRelease(single, 'demo-r3', '手術予定の延期', 'negative', 'manual', 60 * 12);
    releasedSlots.push(r);
    addRequest(r, otherDept(r.ownerDeptId, 5), 'demo-q3', 90);
  }
  if (moved) {
    const r = makeRelease(moved, 'demo-r4', '学会', 'positive', 'manual', 60 * 48);
    const winner = otherDept(r.ownerDeptId, 1);
    releasedSlots.push({ ...r, claimedByDeptId: winner.id, claimedByDeptName: winner.name, claimedAt: iso(60 * 40), status: 'done' });
    addRequest(r, winner, 'demo-q4', 60 * 44, 'approved');
  }
  openOnes.forEach((s, i) => releasedSlots.push(makeRelease(s, `demo-r${5 + i}`, i === 0 ? '休暇' : 'その他', i === 0 ? 'neutral' : 'neutral', 'manual', 60 * (8 + i * 5))));

  return {
    departments: DEMO_DEPARTMENTS,
    rooms: DEMO_ROOMS,
    allocations: DEMO_ALLOCATIONS,
    surgeries,
    releasedSlots,
    slotRequests,
    absences,
    events: buildDemoEvents(today),
  };
}

// 過去8週分の操作履歴（分析タブ用）
function buildDemoEvents(today: Date): AppEvent[] {
  const r = rng(`events-${ymd(getOperatingWeekStart(today))}`);
  const events: AppEvent[] = [];
  const reasons: Array<[string, 'positive' | 'negative' | 'neutral', 'absence' | 'manual']> = [
    ['学会', 'positive', 'absence'], ['学会', 'positive', 'manual'], ['休暇', 'neutral', 'absence'],
    ['手術予定の延期', 'negative', 'manual'], ['外来日の変更', 'neutral', 'manual'], ['患者都合のキャンセル', 'negative', 'manual'],
  ];
  const managerActor = { role: 'manager' as const };
  let n = 0;
  const push = (type: AppEvent['type'], at: Date, actor: AppEvent['actor'], data: AppEvent['data']) => {
    events.push({ id: `demo-e${++n}`, type, at: at.toISOString(), actor, data: { ...data, demo: true } });
  };

  for (let i = 0; i < 42; i++) {
    const alloc = DEMO_ALLOCATIONS[Math.floor(r() * DEMO_ALLOCATIONS.length)];
    const owner = deptById(alloc.deptId);
    const releasedAt = addDays(today, -Math.floor(r() * 56) - 3);
    releasedAt.setHours(8 + Math.floor(r() * 9), Math.floor(r() * 60));
    const leadDays = 2 + Math.floor(r() * 18);
    const slotDate = ymd(addDays(releasedAt, leadDays));
    const [reasonLabel, reasonType, source] = reasons[Math.floor(r() * reasons.length)];
    const releaseId = `demo-hist-r${i}`;
    const ownerActor = { role: 'dept' as const, deptId: owner.id, deptName: owner.name };
    push('slot_released', releasedAt, ownerActor, {
      releaseId, allocationId: alloc.id, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id,
      period: alloc.period, startHour: alloc.startHour, endHour: alloc.endHour, reasonType, reasonLabel, source, leadDays,
    });

    const outcome = r();
    if (outcome < 0.14) {
      push('release_cancelled', subMinutes(addDays(releasedAt, 1), -Math.floor(r() * 300)), ownerActor, {
        releaseId, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id, period: alloc.period,
        wasClaimed: false, droppedRequests: 0, minutesSinceRelease: 1440 + Math.floor(r() * 300),
      });
      continue;
    }
    if (outcome < 0.22) continue; // 共有したが誰も申請せず期限切れ

    const requesters = DEMO_DEPARTMENTS.filter(d => d.id !== owner.id).sort(() => r() - 0.5).slice(0, r() < 0.3 ? 2 : 1);
    const reqs = requesters.map((dept, k) => {
      const minutesSinceRelease = 30 + Math.floor(r() * 60 * 20) + k * 45;
      const at = new Date(releasedAt.getTime() + minutesSinceRelease * 60000);
      const requestId = `demo-hist-q${i}-${k}`;
      push('request_submitted', at, { role: 'dept', deptId: dept.id, deptName: dept.name }, {
        requestId, releaseId, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id,
        requestingDeptId: dept.id, minutesSinceRelease,
      });
      return { dept, at, requestId };
    });

    const decideAt = new Date(Math.max(...reqs.map(q => q.at.getTime())) + (20 + Math.floor(r() * 60 * 8)) * 60000);
    if (r() < 0.1) {
      reqs.forEach(q => push('request_rejected', decideAt, managerActor, {
        requestId: q.requestId, releaseId, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id,
        requestingDeptId: q.dept.id, reason: 'manager_rejected', minutesToDecision: Math.round((decideAt.getTime() - q.at.getTime()) / 60000),
      }));
      continue;
    }
    const [winner, ...losers] = reqs;
    push('request_approved', decideAt, managerActor, {
      requestId: winner.requestId, releaseId, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id,
      requestingDeptId: winner.dept.id, competingRequests: losers.length,
      minutesToDecision: Math.round((decideAt.getTime() - winner.at.getTime()) / 60000),
      minutesSinceRelease: Math.round((decideAt.getTime() - releasedAt.getTime()) / 60000),
    });
    losers.forEach(q => push('request_rejected', decideAt, managerActor, {
      requestId: q.requestId, releaseId, date: slotDate, roomId: alloc.roomId, ownerDeptId: owner.id,
      requestingDeptId: q.dept.id, reason: 'other_request_approved', minutesToDecision: Math.round((decideAt.getTime() - q.at.getTime()) / 60000),
    }));
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
