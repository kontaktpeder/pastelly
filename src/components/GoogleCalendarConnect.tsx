import { useEffect, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarStatus,
  pullGoogleCalendar,
  startGoogleCalendarConnect,
} from '@/lib/googleCalendarSync';
import { toast } from 'sonner';

type Props = {
  householdId: string;
  /** Compact = one button row for welcome; default = profile settings block */
  compact?: boolean;
};

const GoogleCalendarConnect = ({ householdId, compact = false }: Props) => {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [calendarName, setCalendarName] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const status = await fetchGoogleCalendarStatus(householdId);
      setConnected(!!status.connected);
      setEmail(status.connection?.account_email ?? null);
      setCalendarName(status.connection?.external_calendar_name ?? null);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [householdId]);

  const connect = async () => {
    setBusy(true);
    try {
      const result = await startGoogleCalendarConnect(householdId);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error(result.message || t('google.connectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogleCalendar(householdId);
      setConnected(false);
      setEmail(null);
      toast.success(t('google.disconnected'));
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      pullGoogleCalendar(householdId);
      toast.success(t('google.syncStarted'));
      window.setTimeout(() => void refresh(), 1200);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('google.loading')}
      </p>
    );
  }

  if (compact) {
    if (connected) {
      return (
        <p className="text-sm text-muted-foreground">
          {t('google.connectedShort', { email: email || calendarName || 'Google' })}
        </p>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void connect()}
        className="w-full rounded-2xl bg-muted py-3 font-semibold text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
      >
        {busy ? t('google.connecting') : t('google.connectCta')}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-base font-medium">{t('google.title')}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{t('google.hint')}</p>
      </div>
      {connected ? (
        <div className="rounded-2xl bg-muted/60 px-4 py-3 space-y-2">
          <p className="text-sm font-medium">
            {t('google.connectedAs', {
              email: email || 'Google',
              calendar: calendarName || t('kind.homeDefaultName'),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncNow()}
              className="rounded-xl bg-background px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {t('google.syncNow')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground underline underline-offset-2 disabled:opacity-50"
            >
              {t('google.disconnect')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect()}
          className="w-full rounded-xl bg-green-200 py-3 font-semibold text-green-900 disabled:opacity-50"
        >
          {busy ? t('google.connecting') : t('google.connectCta')}
        </button>
      )}
    </div>
  );
};

export default GoogleCalendarConnect;
