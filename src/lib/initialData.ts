import { format, startOfWeek, addDays, addWeeks } from 'date-fns';
import { Department, OperatingRoom, SlotAllocation, Surgery, PERIOD_HOURS } from './types';

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'ortho',   name: '整形外科',     shortName: '整形', color: 'bg-blue-500',   textColor: 'text-blue-700'   },
  { id: 'general', name: '消化器外科',   shortName: '消外', color: 'bg-green-500',  textColor: 'text-green-700'  },
  { id: 'cardio',  name: '心臓血管外科', shortName: '心外', color: 'bg-red-500',    textColor: 'text-red-700'    },
  { id: 'neuro',   name: '脳神経外科',   shortName: '脳外', color: 'bg-purple-500', textColor: 'text-purple-700' },
  { id: 'uro',     name: '泌尿器科',     shortName: '泌尿', color: 'bg-yellow-500', textColor: 'text-yellow-700' },
  { id: 'gyne',    name: '産婦人科',     shortName: '産婦', color: 'bg-pink-500',   textColor: 'text-pink-700'   },
];

export const DEFAULT_ROOMS: OperatingRoom[] = [
  { id: 'or1', name: '手術室1', order: 1 },
  { id: 'or2', name: '手術室2', order: 2 },
  { id: 'or3', name: '手術室3', order: 3 },
  { id: 'or4', name: '手術室4', order: 4 },
];

function slot(
  id: string,
  roomId: string,
  dow: number,
  period: 'am' | 'pm',
  deptId: string,
  deptName: string,
): SlotAllocation {
  return { id, roomId, dayOfWeek: dow, period, ...PERIOD_HOURS[period], deptId, deptName, notes: '' };
}

// 曜日: 1=月, 2=火, 3=水, 4=木, 5=金
// 3室・5診療科・週15枠のシンプル構成
export const DEFAULT_ALLOCATIONS: SlotAllocation[] = [
  // 手術室1 — 整形外科メイン（月・水・金）
  slot('1-1am', 'or1', 1, 'am', 'ortho',   '整形外科'),
  slot('1-1pm', 'or1', 1, 'pm', 'ortho',   '整形外科'),
  slot('1-3am', 'or1', 3, 'am', 'ortho',   '整形外科'),
  slot('1-3pm', 'or1', 3, 'pm', 'ortho',   '整形外科'),
  slot('1-5am', 'or1', 5, 'am', 'ortho',   '整形外科'),

  // 手術室2 — 消化器外科（火・木）
  slot('2-2am', 'or2', 2, 'am', 'general', '消化器外科'),
  slot('2-2pm', 'or2', 2, 'pm', 'general', '消化器外科'),
  slot('2-4am', 'or2', 4, 'am', 'general', '消化器外科'),
  slot('2-4pm', 'or2', 4, 'pm', 'general', '消化器外科'),
  slot('2-5pm', 'or2', 5, 'pm', 'gyne',    '産婦人科'),   // 金曜午後は産婦人科

  // 手術室3 — 心外・脳外・泌尿（曜日で分担）
  slot('3-1am', 'or3', 1, 'am', 'cardio',  '心臓血管外科'),
  slot('3-1pm', 'or3', 1, 'pm', 'cardio',  '心臓血管外科'),
  slot('3-3am', 'or3', 3, 'am', 'neuro',   '脳神経外科'),
  slot('3-3pm', 'or3', 3, 'pm', 'neuro',   '脳神経外科'),
  slot('3-5am', 'or3', 5, 'am', 'uro',     '泌尿器科'),
];

// デモ用：今週の手術データを動的生成（常に今週の日付を使用）
let _demoSurgeries: Surgery[] | null = null;

export function getDemoSurgeries(): Surgery[] {
  if (_demoSurgeries) return _demoSurgeries;

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const d = (offset: number) => format(addDays(monday, offset), 'yyyy-MM-dd');

  _demoSurgeries = [
    // 月曜 — OR1整形
    { id: 'ds1',  date: d(0), roomId: 'or1', startTime: '08:30', endTime: '11:00', patientName: '山田 太郎', procedure: '人工膝関節置換術（右）', surgeonName: '鈴木 Dr.', deptId: 'ortho',   deptName: '整形外科',     status: 'scheduled', isEmergency: false, notes: '', allocationId: '1-1am' },
    { id: 'ds2',  date: d(0), roomId: 'or1', startTime: '13:00', endTime: '15:30', patientName: '田中 花子', procedure: '腰椎椎間板ヘルニア摘出術', surgeonName: '鈴木 Dr.', deptId: 'ortho',   deptName: '整形外科',     status: 'scheduled', isEmergency: false, notes: '', allocationId: '1-1pm' },
    // 月曜 — OR3心外
    { id: 'ds3',  date: d(0), roomId: 'or3', startTime: '08:00', endTime: '12:00', patientName: '佐藤 一郎', procedure: '冠動脈バイパス術（CABG）',  surgeonName: '伊藤 Dr.', deptId: 'cardio',  deptName: '心臓血管外科', status: 'scheduled', isEmergency: false, notes: '', allocationId: '3-1am' },
    // 火曜 — OR2消外
    { id: 'ds4',  date: d(1), roomId: 'or2', startTime: '08:30', endTime: '10:30', patientName: '高橋 二郎', procedure: '腹腔鏡下胆嚢摘出術',         surgeonName: '渡辺 Dr.', deptId: 'general', deptName: '消化器外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '2-2am' },
    { id: 'ds5',  date: d(1), roomId: 'or2', startTime: '11:00', endTime: '12:30', patientName: '中村 三郎', procedure: '虫垂切除術',                  surgeonName: '渡辺 Dr.', deptId: 'general', deptName: '消化器外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '2-2am' },
    { id: 'ds6',  date: d(1), roomId: 'or2', startTime: '14:00', endTime: '16:30', patientName: '小林 四郎', procedure: '大腸切除術（腹腔鏡下）',     surgeonName: '渡辺 Dr.', deptId: 'general', deptName: '消化器外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '2-2pm' },
    // 水曜 — OR1整形（午前のみ使用、午後空き）
    { id: 'ds7',  date: d(2), roomId: 'or1', startTime: '08:30', endTime: '12:00', patientName: '加藤 五郎', procedure: '人工股関節置換術（左）',     surgeonName: '鈴木 Dr.', deptId: 'ortho',   deptName: '整形外科',     status: 'scheduled', isEmergency: false, notes: '', allocationId: '1-3am' },
    // 水曜 — OR3脳外
    { id: 'ds8',  date: d(2), roomId: 'or3', startTime: '09:00', endTime: '13:00', patientName: '吉田 六郎', procedure: '開頭腫瘍摘出術',              surgeonName: '山本 Dr.', deptId: 'neuro',   deptName: '脳神経外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '3-3am' },
    { id: 'ds9',  date: d(2), roomId: 'or3', startTime: '14:00', endTime: '17:00', patientName: '松本 七郎', procedure: '頸椎前方除圧固定術',          surgeonName: '山本 Dr.', deptId: 'neuro',   deptName: '脳神経外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '3-3pm' },
    // 木曜 — OR2消外（午前のみ、午後空き）
    { id: 'ds10', date: d(3), roomId: 'or2', startTime: '08:30', endTime: '11:30', patientName: '井上 八郎', procedure: '胃切除術',                    surgeonName: '渡辺 Dr.', deptId: 'general', deptName: '消化器外科',   status: 'scheduled', isEmergency: false, notes: '', allocationId: '2-4am' },
    // 金曜 — OR1整形（午前）
    { id: 'ds11', date: d(4), roomId: 'or1', startTime: '08:30', endTime: '10:30', patientName: '木村 九郎', procedure: '膝関節鏡視下手術',            surgeonName: '鈴木 Dr.', deptId: 'ortho',   deptName: '整形外科',     status: 'scheduled', isEmergency: false, notes: '', allocationId: '1-5am' },
    // 来週サンプル（1週後）
    { id: 'ds12', date: format(addDays(addWeeks(monday, 1), 0), 'yyyy-MM-dd'), roomId: 'or2', startTime: '08:30', endTime: '11:00', patientName: '林 十郎', procedure: '肝切除術', surgeonName: '渡辺 Dr.', deptId: 'general', deptName: '消化器外科', status: 'scheduled', isEmergency: false, notes: '', allocationId: '2-2am' },
  ];

  return _demoSurgeries;
}
