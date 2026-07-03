// ============================================
// COMPETENCY PROFILE HELPER UTILITIES
// ============================================

export interface SessionFact {
  concept_id: string;
  verdict: 'MASTERED' | 'WARNING' | 'GAP';
  gap_summary?: string;
}

export interface UserCompetencyProfile {
  PK: string;              // `USER#${user_id}`
  SK: string;              // `CONCEPT#${concept_id}`
  mastery_score: number;   // 0.0 - 1.0
  status: 'MASTERED' | 'WARNING' | 'GAP';
  gap_history: {
    session_id: string;
    gap_summary: string;   // tóm tắt ngắn, KHÔNG lưu transcript thô
    timestamp: string;
  }[];                      // Giữ tối đa N=5 gap gần nhất
  last_reviewed_at: string;  // ISO timestamp
  review_count: number;
  updated_at: string;
}

export function scoreToStatus(score: number): 'MASTERED' | 'WARNING' | 'GAP' {
  if (score > 0.7) return 'MASTERED';
  if (score > 0.4) return 'WARNING';
  return 'GAP';
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function trimToN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  // Keep the most recent ones (usually appended at the end)
  return arr.slice(-n);
}

export function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function applyDecay(profile: UserCompetencyProfile): UserCompetencyProfile {
  const now = new Date().toISOString();
  const daysSinceReview = daysBetween(profile.last_reviewed_at, now);
  // Ebbinghaus-style: decay nhẹ, áp dụng sau 7 ngày không ôn tập (chỉ dành cho status MASTERED)
  if (daysSinceReview > 7 && profile.status === 'MASTERED') {
    const decayFactor = Math.min(0.3, (daysSinceReview - 7) * 0.01);
    const newScore = clamp(profile.mastery_score - decayFactor, 0, 1);
    return {
      ...profile,
      mastery_score: newScore,
      status: scoreToStatus(newScore)
    };
  }
  return profile;
}
