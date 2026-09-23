import type { CalendarKind } from '@/lib/calendarKinds';
import type { Event } from '@/hooks/useEvents';

/** Home: members can edit shared (non-private) events. Work / private: owner only. */
export function canEditEvent(
  event: Pick<Event, 'owner_member_id' | 'visibility_type'> & { isWorkBlock?: boolean },
  currentMemberId: string,
  calendarKind: CalendarKind | string | null | undefined,
): boolean {
  if (event.isWorkBlock) return false;
  if (event.owner_member_id === currentMemberId) return true;
  const kind = (calendarKind ?? 'home').toString().toLowerCase();
  if (kind !== 'home') return false;
  const vis = (event.visibility_type ?? 'all_members').toLowerCase();
  return vis !== 'private';
}
