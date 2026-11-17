import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useLocale } from '@/hooks/useLocale';
import { useMarkMemberNoteRead, type MemberNote } from '@/hooks/useMemberNotes';
import { burstConfetti } from '@/lib/celebrate';

const NOTE_CONFETTI = ['#f9a8d4', '#fb7185', '#fda4af', '#fde68a', '#c4b5fd'];

interface MemberNoteCardProps {
  note: MemberNote;
  onDismissed: () => void;
}

/** One unread note, centered, with a light confetti burst. */
const MemberNoteCard = ({ note, onDismissed }: MemberNoteCardProps) => {
  const { t } = useLocale();
  const markRead = useMarkMemberNoteRead();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(
      () => burstConfetti({ colors: NOTE_CONFETTI, count: 42 }),
      120,
    );
    return () => window.clearTimeout(id);
  }, [note.id]);

  const dismiss = () => {
    if (started.current) return;
    started.current = true;
    setError('');
    markRead.mutate(note.id, {
      onSuccess: () => onDismissed(),
      onError: () => {
        started.current = false;
        const message = t('note.readFailed');
        setError(message);
        toast.error(message);
      },
    });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className="absolute inset-0 bg-foreground/40" aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-note-body"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="relative w-full max-w-sm rounded-[1.75rem] bg-background px-6 pb-6 pt-8 text-center shadow-soft-lg"
      >
        <p className="text-5xl" aria-hidden>
          {note.emoji}
        </p>
        {note.fromName ? (
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {t('note.from', { name: note.fromName })}
          </p>
        ) : null}
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
          disabled={markRead.isPending}
          className="mt-6 w-full rounded-2xl bg-green-200 py-3.5 text-base font-semibold text-green-900 transition-colors hover:bg-green-300 disabled:opacity-40"
        >
          {t('note.thanks')}
        </button>
      </motion.div>
    </motion.div>
  );
};

interface MemberNoteHostProps {
  notes: MemberNote[];
}

/** Shows the oldest unread note, then the next after it is marked read. */
export function MemberNoteHost({ notes }: MemberNoteHostProps) {
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const note = notes.find((item) => item.id !== hiddenId) ?? null;
  return (
    <AnimatePresence>
      {note ? (
        <MemberNoteCard key={note.id} note={note} onDismissed={() => setHiddenId(note.id)} />
      ) : null}
    </AnimatePresence>
  );
}

export default MemberNoteCard;
