/** Emojis a note may carry. Kept in step with member_notes_emoji. */
export const NOTE_EMOJIS = ['💌', '❤️', '✨', '🌸'] as const;

export type NoteEmoji = (typeof NOTE_EMOJIS)[number];

export const NOTE_MAX_LENGTH = 240;

export function noteEmoji(value: string | null | undefined): NoteEmoji {
  return (NOTE_EMOJIS as readonly string[]).includes(value ?? '')
    ? (value as NoteEmoji)
    : '💌';
}
