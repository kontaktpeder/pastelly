import type { CalendarDuplicate, ShiftProposal } from './types';

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.…]+$/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function timeKey(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

function certainKey(p: ShiftProposal): string {
  const date = p.eventDate ?? `${p.month}-${p.day}`;
  return [date, timeKey(p.startTime), timeKey(p.endTime), norm(p.title), norm(p.location)].join('|');
}

/** Merge only exact matches across screenshots of the same plan. */
export function mergeCertainImageDuplicates(proposals: ShiftProposal[]): ShiftProposal[] {
  const byKey = new Map<string, ShiftProposal>();
  for (const proposal of proposals) {
    const key = certainKey(proposal);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, proposal);
      continue;
    }
    byKey.set(key, {
      ...existing,
      mergedFromImages: existing.mergedFromImages + proposal.mergedFromImages,
    });
  }
  return [...byKey.values()].sort((a, b) => {
    const ad = a.eventDate ?? `${a.year ?? 0}-${a.month}-${a.day}`;
    const bd = b.eventDate ?? `${b.year ?? 0}-${b.month}-${b.day}`;
    return ad.localeCompare(bd) || a.startTime.localeCompare(b.startTime);
  });
}

export type CalendarEventLike = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
};

/** Possible calendar hits — marked only, never auto-removed. */
export function findPossibleCalendarDuplicate(
  proposal: ShiftProposal,
  events: CalendarEventLike[],
): CalendarDuplicate | null {
  if (!proposal.eventDate) return null;
  const hit = events.find(
    (event) =>
      event.event_date === proposal.eventDate &&
      timeKey(event.start_time) === timeKey(proposal.startTime) &&
      timeKey(event.end_time) === timeKey(proposal.endTime),
  );
  if (!hit) return null;
  return {
    eventId: hit.id,
    title: hit.title,
    eventDate: hit.event_date,
    startTime: hit.start_time,
    endTime: hit.end_time,
  };
}
