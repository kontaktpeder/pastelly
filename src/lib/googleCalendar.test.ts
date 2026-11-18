import { describe, expect, it } from 'vitest';
import {
  userCanEditSyncedEvent,
  userCanViewSyncedEvent,
} from '../../supabase/functions/google-calendar/googleCalendar';

describe('Google Calendar sync permissions', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';

  it('exports all-member events to active household members', () => {
    expect(
      userCanViewSyncedEvent(
        { owner_member_id: owner, visibility_type: 'all_members' },
        [other],
      ),
    ).toBe(true);
  });

  it('does not export private events to non-owners', () => {
    expect(
      userCanViewSyncedEvent(
        { owner_member_id: owner, visibility_type: 'private' },
        [other],
      ),
    ).toBe(false);
  });

  it('exports selected-member events only to the owner or selected members', () => {
    expect(
      userCanViewSyncedEvent(
        { owner_member_id: owner, visibility_type: 'selected_members' },
        [other],
        [other],
      ),
    ).toBe(true);
    expect(
      userCanViewSyncedEvent(
        { owner_member_id: owner, visibility_type: 'selected_members' },
        ['33333333-3333-4333-8333-333333333333'],
        [other],
      ),
    ).toBe(false);
  });

  it('allows Google pull writes only for the Pastelly event owner', () => {
    expect(userCanEditSyncedEvent({ owner_member_id: owner }, [owner])).toBe(true);
    expect(userCanEditSyncedEvent({ owner_member_id: owner }, [other])).toBe(false);
  });
});
