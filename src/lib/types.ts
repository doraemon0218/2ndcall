export interface Department {
  id: string;
  name: string;
  shortName: string;
  color: string; // Tailwind bg class
  textColor: string; // Tailwind text class
}

export interface OperatingRoom {
  id: string;
  name: string;
  order: number;
}

export type Period = 'am' | 'pm' | 'full';

export const PERIOD_HOURS: Record<Period, { startHour: number; startMin: number; endHour: number; endMin: number }> = {
  am:   { startHour: 8,  startMin: 0,  endHour: 12, endMin: 30 },
  pm:   { startHour: 13, startMin: 0,  endHour: 17, endMin: 0  },
  full: { startHour: 8,  startMin: 0,  endHour: 17, endMin: 0  },
};

export function getPeriodLabel(period: Period): string {
  return { am: '午前', pm: '午後', full: '終日' }[period];
}

export function inferPeriod(startHour: number, endHour: number): Period {
  if (startHour <= 8 && endHour >= 17) return 'full';
  if (endHour <= 13) return 'am';
  if (startHour >= 13) return 'pm';
  return 'full';
}

// 診療科が保有する定例OR枠（マスタ）
export interface SlotAllocation {
  id: string;
  roomId: string;
  dayOfWeek: number; // 1=月, 2=火, 3=水, 4=木, 5=金, 6=土
  period: Period;    // 'am' | 'pm' | 'full'
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  deptId: string;
  deptName: string;
  notes: string;
}

// 手術予定
export type SurgeryStatus = 'scheduled' | 'completed' | 'cancelled';

export interface Surgery {
  id: string;
  date: string;          // YYYY-MM-DD
  roomId: string;
  startTime: string;     // HH:MM
  endTime: string;       // HH:MM
  patientName: string;
  procedure: string;
  surgeonName: string;
  deptId: string;
  deptName: string;
  status: SurgeryStatus;
  isEmergency: boolean;
  notes: string;
  allocationId?: string;
}

// 空き枠への希望申請
export interface SlotRequest {
  id: string;
  releaseId: string;
  date: string;
  roomId: string;
  requestingDeptId: string;
  requestingDeptName: string;
  procedure: string;
  surgeonName: string;
  // 希望する時間帯（1/4日単位）
  wantedStartTime: string; // HH:MM
  wantedEndTime: string;   // HH:MM
  notes: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

// 空き枠解放（部長間共有）
export type SlotReasonType = 'positive' | 'negative' | 'neutral';
export type ReleasedSlotStatus = 'open' | 'done';

export interface ReleasedSlot {
  id: string;
  allocationId: string;
  date: string;            // YYYY-MM-DD
  roomId: string;
  ownerDeptId: string;
  ownerDeptName: string;
  period: Period;          // 保有枠の単位（am/pm）
  startHour: number;       // 保有枠の開始時刻（時）
  endHour: number;         // 保有枠の終了時刻（時）
  // 募集する時間帯（1/4日単位で指定可能、省略時は枠全体）
  availStartTime?: string; // HH:MM
  availEndTime?: string;   // HH:MM
  releasedAt: string;
  releasedBy: string;
  message: string;
  reasonType?: SlotReasonType;
  reasonLabel?: string;
  source?: 'manual' | 'absence' | 'other';
  status?: ReleasedSlotStatus;
  claimedByDeptId?: string;
  claimedByDeptName?: string;
  claimedAt?: string;
}

export interface WeeklySlot {
  allocation: SlotAllocation;
  surgeries: Surgery[];
  date: string;
  allocatedMinutes: number;
  usedMinutes: number;
  utilizationRate: number;
  isDeadlinePassed: boolean;
  isEmpty: boolean;
  releasedSlot?: ReleasedSlot;
}
