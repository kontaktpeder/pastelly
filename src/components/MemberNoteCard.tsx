import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLocale } from '@/hooks/useLocale';
import { useMarkMemberNoteRead, type MemberNote } from '@/hooks/useMemberNotes';
import { burstConfetti } from '@/lib/celebrate';

const NOTE_CONFETTI = ['#f9a8d4', '#fb7185', '#fda4af', '#fde68a', '#c4b5fd'];
const ENTER_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Phase = 'wait' | 'in' | 'shown' | 'out';

interface MemberNoteCardProps {
  note: MemberNote;
  onDismissed: () => void;
}

/**
 * Centered note. The card is painted in its final place: no fade and no scale,
 * which hitch on the iOS web view. Only the dim fades in, and confetti starts
 * after the card is already still.
 */
const MemberNoteCard = ({ note, onDismissed }: MemberNoteCardProps) => {
  const { t } = useLocale();
  const markRead = useMarkMemberNoteRead();
  const started = useRef(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('wait');

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (!cancelled) setPhase('in');
    };
    const cap = window.setTimeout(show, 280);
    document.fonts?.ready.then(() => {
      window.clearTimeout(cap);
      show();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, [note.id]);

  useEffect(() => {
    if (phase !== 'in') return;
    const frame = window.requestAnimationFrame(() => setPhase('shown'));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'shown') return;
    const id = window.setTimeout(
      () => burstConfetti({ colors: NOTE_CONFETTI, count: 28 }),
      220,
    );
    return () => window.clearTimeout(id);
  }, [phase, note.id]);

  const dismiss = () => {
    if (started.current || phase === 'wait' || phase === 'out') return;
    started.current = true;
    setError('');
    markRead.mutate(note.id, {
      onSuccess: () => setPhase('out'),
      onError: () => {
        started.current = false;
        const message = t('note.readFailed');
        setError(message);
        toast.error(message);
      },
    });
  };

  useEffect(() => {
    if (phase !== 'out') return;
    const id = window.setTimeout(() => onDismissedRef.current(), 160);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === 'wait') return null;

  const settled = phase === 'shown' || phase === 'out';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-6"
      style={{
        opacity: phase === 'shown' ? 1 : 0,
        transition: phase === 'out' ? 'opacity 160ms ease' : 'none',
      }}
    >
      <div
        className="absolute inset-0 bg-foreground/40"
        style={{
          opacity: settled ? 1 : 0,
          transition: `opacity 180ms ${ENTER_EASE}`,
        }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-note-body"
        className="relative w-full max-w-sm rounded-[1.75rem] bg-background px-6 pb-6 pt-8 text-center shadow-soft-lg"
      >
        <p className="text-5xl" aria-hidden>
          {note.emoji}
        </p>
        <p className="mt-3 min-h-5 text-sm font-medium text-muted-foreground">
          {note.fromName ? t('note.from', { name: note.fromName }) : ''}
        </p>
        <p
          id="member-note-body"
          className="mt-3 whitespace-pre-wrap break-words font-display text-[1.75rem] font-semibold leading-snug tracking-tight text-foreground"
        >
          {note.body}
        </p>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <button
          type="button"
          onClick={dismiss}
          disabled={markRead.isPending || phase === 'out'}
          className="mt-6 w-full rounded-2xl bg-green-200 py-3.5 text-base font-semibold text-green-900 transition-colors hover:bg-green-300 disabled:opacity-40"
        >
          {t('note.thanks')}
        </button>
      </div>
    </div>
  );
};

interface MemberNoteHostProps {
  notes: MemberNote[];
}

/** Shows the oldest unread note, then the next after it is marked read. */
export function MemberNoteHost({ notes }: MemberNoteHostProps) {
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const note = notes.find((item) => item.id !== hiddenId) ?? null;
  if (!note) return null;
  return <MemberNoteCard key={note.id} note={note} onDismissed={() => setHiddenId(note.id)} />;
}

export default MemberNoteCard;
