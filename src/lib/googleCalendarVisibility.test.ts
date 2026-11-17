import { describe, expect, it } from 'vitest';
import {
  memberCanEditEvent,
  memberCanViewEvent,
  type EventAccessShape,
} from '../../supabase/functions/google-calendar/googleCalendar';

const memberId = 'member-a';
const otherMemberId = 'member-b';

function event(
  visibility_type: EventAccessShape['visibility_type'],
  owner_member_id = otherMemberId,
): EventAccessShape {
  return { visibility_type, owner_member_id };
}

describe('Google Calendar event access helpers', () => {
  it('matches private event visibility: only the owner can sync the event body', () => {
    expect(memberCanViewEvent(event('private', memberId), memberId)).toBe(true);
    expect(memberCanViewEvent(event('private'), memberId)).toBe(false);
  });

  it('allows selected-member visibility only for owners or explicitly selected members', () => {
    expect(memberCanViewEvent(event('selected_members', memberId), memberId)).toBe(true);
    expect(memberCanViewEvent(event('selected_members'), memberId, [memberId])).toBe(true);
    expect(memberCanViewEvent(event('selected_members'), memberId, [])).toBe(false);
  });

  it('matches home co-edit rules without granting private-event edits', () => {
    expect(memberCanEditEvent(event('all_members'), 'home', memberId)).toBe(true);
    expect(memberCanEditEvent(event('selected_members'), 'home', memberId, [memberId])).toBe(true);
    expect(memberCanEditEvent(event('selected_members'), 'home', memberId, [])).toBe(false);
    expect(memberCanEditEvent(event('private'), 'home', memberId)).toBe(false);
  });

  it('keeps non-home edits owner-only', () => {
    expect(memberCanEditEvent(event('all_members'), 'work', memberId)).toBe(false);
    expect(memberCanEditEvent(event('all_members', memberId), 'work', memberId)).toBe(true);
  });
});
