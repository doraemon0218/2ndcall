// 空き枠を「埋めた」「早めに共有した」診療科の貢献を集計する
import { Department } from './types';
import { AppEvent } from './eventLog';

export interface DeptContribution {
  dept: Department;
  filled: number;  // 他科の空き枠を引き受けて埋めた数
  shared: number;  // 自科の枠を早めに共有した数（取り消し分は除く）
  score: number;
}

export function computeContributions(departments: Department[], events: AppEvent[], days = 30, now = new Date()): DeptContribution[] {
  const since = now.getTime() - days * 86400000;
  const recent = events.filter(e => new Date(e.at).getTime() >= since);
  const cancelled = new Set(recent.filter(e => e.type === 'release_cancelled').map(e => String(e.data.releaseId)));

  return departments
    .map(dept => {
      const filled = recent.filter(e =>
        (e.type === 'request_approved' && e.data.requestingDeptId === dept.id) ||
        (e.type === 'slot_assigned' && e.data.claimedByDeptId === dept.id),
      ).length;
      const shared = recent.filter(e =>
        e.type === 'slot_released' && e.data.ownerDeptId === dept.id && !cancelled.has(String(e.data.releaseId)),
      ).length;
      return { dept, filled, shared, score: filled * 2 + shared };
    })
    .sort((a, b) => b.score - a.score || b.filled - a.filled);
}

export function rankOf(list: DeptContribution[], deptId: string): number {
  const i = list.findIndex(c => c.dept.id === deptId);
  return i < 0 ? list.length : i + 1;
}
