import { useState } from 'react';
import { toast } from 'sonner';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { useLocale } from '@/hooks/useLocale';
import { useSendMemberNote } from '@/hooks/useMemberNotes';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { NOTE_EMOJIS, NOTE_MAX_LENGTH, type NoteEmoji } from '@/lib/memberNotes';

interface SendMemberNoteProps {
  householdId: string;
  fromMemberId: string;
  toMember: HouseholdMember;
  onClose: () => void;
}

/** Choice, then a short note, for one other member of this calendar. */
const SendMemberNote = ({ householdId, fromMemberId, toMember, onClose }: SendMemberNoteProps) => {
  const { t } = useLocale();
  const send = useSendMemberNote();
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [emoji, setEmoji] = useState<NoteEmoji>('💌');
  const [error, setError] = useState('');

  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH && !send.isPending;

  const submit = () => {
    if (!trimmed) {
      setError(t('note.empty'));
      return;
    }
    if (trimmed.length > NOTE_MAX_LENGTH) {
      setError(t('note.tooLong'));
      return;
    }
    setError('');
    send.mutate(
      {
        householdId,
        fromMemberId,
        toMemberId: toMember.id,
        body: trimmed,
        emoji,
      },
      {
        onSuccess: () => {
          toast.success(t('note.sent', { name: toMember.display_name }));
          onClose();
        },
        onError: () => setError(t('note.failed')),
      },
    );
  };

  return (
    <CenteredPopup variant="compact" onClose={onClose} onExit={onClose} zClassName="z-[70]">
      <div className="px-5 pb-4 pt-1 text-center" data-sheet-scroll>
        <p className="text-4xl" aria-hidden>
          {writing ? emoji : '💌'}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          {t('note.send')}
        </h2>
        <p className="mt-1 text-base text-muted-foreground">
          {t('note.to', { name: toMember.display_name })}
        </p>

        {writing ? (
          <div className="mt-5 space-y-3 text-left">
            <div className="flex justify-center gap-2" role="group" aria-label={t('note.send')}>
              {NOTE_EMOJIS.map((choice) => {
                const selected = choice === emoji;
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setEmoji(choice)}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-colors ${
                      selected ? 'bg-primary/20 ring-2 ring-primary' : 'bg-muted'
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
            <textarea
              value={body}
              onChange={(event) => {
                setBody(event.target.value.slice(0, NOTE_MAX_LENGTH));
                if (error) setError('');
              }}
              rows={4}
              maxLength={NOTE_MAX_LENGTH}
              spellCheck={false}
              placeholder={t('note.placeholder')}
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-lg leading-snug focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}
      </div>

      <PopupStickyFooter>
        {writing ? (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="w-full rounded-2xl bg-green-200 py-3.5 text-base font-semibold text-green-900 transition-colors hover:bg-green-300 disabled:opacity-40"
          >
            {send.isPending ? t('note.sending') : t('note.sendAction')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="w-full rounded-2xl bg-green-200 py-3.5 text-base font-semibold text-green-900 transition-colors hover:bg-green-300"
          >
            {t('note.send')}
          </button>
        )}
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default SendMemberNote;
