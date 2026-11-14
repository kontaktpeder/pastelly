import { describe, expect, it } from 'vitest';
import { canMemberEditEvent, canMemberViewEvent } from '../../supabase/functions/google-calendar/googleCalendar';

const memberId = 'member-a';
const ownerMemberId = 'member-owner';

describe('Google Calendar event access', () => {
  it('does not expose private events to non-owners during backfill or push', () => {
    expect(
      canMemberViewEvent({
        memberId,
        ownerMemberId,
        visibilityType: 'private',
        householdKind: 'home',
      }),
    ).toBe(false);
  });

  it('allows home co-edit only for visible shared events', () => {
    expect(
      canMemberEditEvent({
        memberId,
        ownerMemberId,
        visibilityType: 'all_members',
        householdKind: 'home',
      }),
    ).toBe(true);

    expect(
      canMemberEditEvent({
        memberId,
        ownerMemberId,
        visibilityType: 'private',
        householdKind: 'home',
      }),
    ).toBe(false);
  });

  it('requires selected-member visibility before accepting Google edits', () => {
    expect(
      canMemberViewEvent({
        memberId,
        ownerMemberId,
        visibilityType: 'selected_members',
        householdKind: 'home',
        selectedMemberIds: [memberId],
      }),
    ).toBe(true);
    expect(
      canMemberEditEvent({
        memberId,
        ownerMemberId,
        visibilityType: 'selected_members',
        householdKind: 'home',
        selectedMemberIds: [],
      }),
    ).toBe(false);
  });
});
