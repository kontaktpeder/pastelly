import { describe, expect, it } from 'vitest';
import {
  memberCanDeleteEvent,
  memberCanViewEvent,
  type PastellyEventRow,
} from '../../supabase/functions/google-calendar/googleCalendar';

const event = (
  owner_member_id: string,
  visibility_type: string,
): Pick<PastellyEventRow, 'owner_member_id' | 'visibility_type'> => ({
  owner_member_id,
  visibility_type,
});

describe('google calendar event authorization', () => {
  it('only lets the event owner delete Pastelly events from Google cancellations', () => {
    expect(memberCanDeleteEvent('member-owner', event('member-owner', 'all_members'))).toBe(true);
    expect(memberCanDeleteEvent('member-viewer', event('member-owner', 'all_members'))).toBe(false);
  });

  it('matches Pastelly visibility before pushing details to Google', () => {
    expect(memberCanViewEvent('member-viewer', event('member-owner', 'all_members'))).toBe(true);
    expect(memberCanViewEvent('member-owner', event('member-owner', 'private'))).toBe(true);
    expect(memberCanViewEvent('member-viewer', event('member-owner', 'private'))).toBe(false);
    expect(memberCanViewEvent('member-viewer', event('member-owner', 'selected_members'))).toBe(false);
    expect(
      memberCanViewEvent('member-viewer', event('member-owner', 'selected_members'), [
        'member-viewer',
      ]),
    ).toBe(true);
  });
});
