import type { TutorSessionResolved } from '@homework/shared';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

interface SessionLike {
  time_start: string;
  duration_hours: number;
}

/**
 * Check a candidate session against existing sessions on the same day.
 * Returns an array of warning messages (empty = no conflicts).
 */
export function checkSessionConflicts(
  candidate: SessionLike,
  sameDaySessions: TutorSessionResolved[],
): string[] {
  const warnings: string[] = [];
  const cStart = timeToMinutes(candidate.time_start);
  const cEnd = cStart + candidate.duration_hours * 60;

  for (const s of sameDaySessions) {
    const sStart = timeToMinutes(s.time_start);
    const sEnd = sStart + s.duration_hours * 60;

    if (cStart < sEnd && cEnd > sStart) {
      warnings.push(
        `Пересечение с ${s.tutor_name} (${s.subject}) ${s.time_start}–${formatMinutes(sEnd)}`,
      );
    } else {
      const gap = Math.max(cStart - sEnd, sStart - cEnd);
      if (gap < 30) {
        warnings.push(
          `Перерыв менее 30 мин до ${s.tutor_name} (${s.subject}) ${s.time_start}–${formatMinutes(sEnd)}`,
        );
      }
    }
  }

  return warnings;
}

/**
 * Find all conflict pairs among a list of resolved sessions on the same day.
 * Returns a Set of session_id:date keys that have conflicts.
 */
export function findConflictingSessionKeys(
  sessions: TutorSessionResolved[],
): Map<string, string> {
  const conflicts = new Map<string, string>();

  // Group by date
  const byDate = new Map<string, TutorSessionResolved[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }

  for (const daySessions of byDate.values()) {
    for (let i = 0; i < daySessions.length; i++) {
      for (let j = i + 1; j < daySessions.length; j++) {
        const a = daySessions[i];
        const b = daySessions[j];

        const aStart = timeToMinutes(a.time_start);
        const aEnd = aStart + a.duration_hours * 60;
        const bStart = timeToMinutes(b.time_start);
        const bEnd = bStart + b.duration_hours * 60;

        const keyA = `${a.session_id}:${a.date}`;
        const keyB = `${b.session_id}:${b.date}`;

        if (aStart < bEnd && aEnd > bStart) {
          const msg = 'Пересечение';
          conflicts.set(keyA, msg);
          conflicts.set(keyB, msg);
        } else {
          const gap = Math.max(aStart - bEnd, bStart - aEnd);
          if (gap < 30) {
            const msg = `Перерыв ${gap} мин`;
            if (!conflicts.has(keyA)) conflicts.set(keyA, msg);
            if (!conflicts.has(keyB)) conflicts.set(keyB, msg);
          }
        }
      }
    }
  }

  return conflicts;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
