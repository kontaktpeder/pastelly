import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { HouseholdMember } from '@/hooks/useHousehold';

interface DailyDigestSettingsProps {
  member: HouseholdMember;
}

const TIME_OPTIONS = [
  '06:00',
  '06:30',
  '07:00',
  '07:30',
  '08:00',
  '08:30',
  '09:00',
] as const;

function toInputTime(value: string | null | undefined): string {
  if (!value) return '07:00';
  return value.slice(0, 5);
}

const DailyDigestSettings = ({ member }: DailyDigestSettingsProps) => {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(member.daily_digest_enabled ?? true);
  const [time, setTime] = useState(toInputTime(member.daily_digest_time));
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const save = useMutation({
    mutationFn: async (patch: { daily_digest_enabled?: boolean; daily_digest_time?: string }) => {
      const { error } = await supabase
        .from('household_members')
        .update(patch)
        .eq('id', member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['currentMember'] });
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
    },
  });

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    save.mutate({ daily_digest_enabled: next });
  };

  const handleTime = (next: string) => {
    setTime(next);
    save.mutate({ daily_digest_time: `${next}:00` });
  };

  const sendTest = async () => {
    setTestStatus('sending');
    setTestError('');
    const { data, error } = await supabase.functions.invoke('send-daily-digests', {
      body: { mode: 'self', household_id: member.household_id },
    });
    if (error) {
      setTestStatus('error');
      setTestError(error.message || 'Kunne ikke sende');
      return;
    }
    if (data?.error) {
      setTestStatus('error');
      setTestError(String(data.error));
      return;
    }
    setTestStatus('sent');
    window.setTimeout(() => setTestStatus('idle'), 2500);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-muted-foreground mb-1">Daglig oversikt</h3>
        <p className="text-sm text-muted-foreground">
          Få dagens aktiviteter på låseskjermen. Trykk på varselet for å åpne dagen i appen.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
        <span className="text-base font-medium">Send hver morgen</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          className="h-5 w-5 accent-primary"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-muted-foreground">Klokkeslett</span>
        <select
          value={time}
          disabled={!enabled}
          onChange={(e) => handleTime(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base disabled:opacity-50"
        >
          {TIME_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {!TIME_OPTIONS.includes(time as (typeof TIME_OPTIONS)[number]) && (
            <option value={time}>{time}</option>
          )}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void sendTest()}
        disabled={testStatus === 'sending'}
        className="w-full rounded-xl border border-border py-3 text-base font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {testStatus === 'sending'
          ? 'Sender...'
          : testStatus === 'sent'
            ? 'Sendt ✓'
            : 'Send dagens oversikt nå'}
      </button>
      {testError && <p className="text-destructive text-sm text-center">{testError}</p>}
      {save.isError && (
        <p className="text-destructive text-sm text-center">Kunne ikke lagre innstilling</p>
      )}
    </div>
  );
};

export default DailyDigestSettings;
