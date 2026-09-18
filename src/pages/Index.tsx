import { useState, useCallback, useMemo, useRef, useEffect, type ComponentProps, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { applyCalendarStripChange, calendarStripAnchor } from '@/lib/calendarStrip';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { getRecoveryState } from '@/lib/auth/recoveryState';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentHouseholdContext } from '@/hooks/useCurrentHouseholdContext';
import { useMembers } from '@/hooks/useHousehold';
import { useHouseholdHasEvents } from '@/hooks/useHouseholdHasEvents';
import { adjacentCalendarId, sortCalendarMemberships } from '@/lib/calendarStack';
import { resolveCalendarKind } from '@/lib/calendarKinds';
import { isSeedWeekDismissed } from '@/lib/seedWeekStorage';
import { LocaleProvider } from '@/hooks/useLocale';
import { PASTEL } from '@/lib/monthTheme';
import AuthPage from '@/pages/Auth';
import Landing from '@/pages/Landing';
import { isNativePlatform } from '@/lib/native/platform';
import OnboardingPage from '@/pages/Onboarding';
import CalendarView from '@/components/CalendarView';
import DesktopDayPanel from '@/components/DesktopDayPanel';
import CalendarSwitcher from '@/components/CalendarSwitcher';
import NewEventFlow from '@/components/NewEventFlow';
import NewCountdownFlow from '@/components/NewCountdownFlow';
import EditEventFlow from '@/components/EditEventFlow';
import EditEventQuickSheet from '@/components/EditEventQuickSheet';
import SeedWeekFlow from '@/components/SeedWeekFlow';
import WelcomeDialog from '@/components/WelcomeDialog';
import ProfileSheet, { type ProfileSheetMode } from '@/components/ProfileSheet';
import { toast } from 'sonner';
import { peekWelcomeIntent, consumeWelcomeIntent, type WelcomeIntent } from '@/lib/welcomeIntent';
import { peekPendingInviteCode } from '@/lib/inviteLink';
import { peekSessionNotice } from '@/lib/auth/sessionNotice';
import type { Event } from '@/hooks/useEvents';
import { tryOpenSheet } from '@/lib/sheetGate';
import { markAppReady } from '@/lib/native/appBoot';
import BootVeil from '@/components/BootVeil';
import { peekPendingOpenDay, subscribePendingOpenDay } from '@/lib/native/pendingOpenDay';
import { useActiveCountdowns } from '@/hooks/useCountdowns';
import { VacationModeProvider, useVacationMode } from '@/hooks/useVacationMode';

export type Highlight = { eventId: string; dateStr: string; ts: number } | null;

const stackTransition = {
  type: 'tween' as const,
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
};

const Index = () => {
  const { loading: authLoading, signOut } = useAuth();
  const {
    user,
    household,
    currentMember,
    memberships,
    setActiveHouseholdId,
    loading: ctxLoading,
    error: ctxError,
    refetch: refetchContext,
    invalidate,
  } = useCurrentHouseholdContext();
  const { data: members = [] } = useMembers(household?.id);
  const { data: activeCountdowns = [] } = useActiveCountdowns(household?.id);
  const { data: hasEvents, isSuccess: hasEventsReady } = useHouseholdHasEvents(household?.id);
  const queryClient = useQueryClient();
  const [focusedDate, setFocusedDate] = useState<Date>(() => new Date());
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventDate, setNewEventDate] = useState<Date | undefined>();
  const [showNewCountdown, setShowNewCountdown] = useState(false);
  const [newCountdownDate, setNewCountdownDate] = useState<Date | undefined>();
  const [profileMode, setProfileMode] = useState<ProfileSheetMode | null>(null);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [quickEditEvent, setQuickEditEvent] = useState<Event | null>(null);
  const [showSeedWeek, setShowSeedWeek] = useState(false);
  const [welcomeDialog, setWelcomeDialog] = useState<WelcomeIntent | null>(null);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [stackDirection, setStackDirection] = useState(0);
  /** Skip calendar-stack slide on cold open — only animate real switches. */
  const [stackMotionOn, setStackMotionOn] = useState(false);
  /** covering → soft veil; revealing → welcome fade; done → gone */
  const [bootPhase, setBootPhase] = useState<'covering' | 'revealing' | 'done'>('covering');
  const coldStartRef = useRef(true);
  const switchingRef = useRef(false);
  const seedAutoOpenedRef = useRef<string | null>(null);
  const [authView, setAuthView] = useState<null | 'login' | 'signup'>(() => {
    if (peekPendingInviteCode()) return 'signup';
    if (peekSessionNotice() === 'email_confirmed_login') return 'login';
    if (isNativePlatform()) return 'login';
    return null;
  });

  const orderedMemberships = useMemo(
    () => sortCalendarMemberships(memberships),
    [memberships],
  );

  const stackIndex = useMemo(() => {
    if (!household) return 0;
    const idx = orderedMemberships.findIndex((m) => m.household_id === household.id);
    return idx >= 0 ? idx : 0;
  }, [orderedMemberships, household]);

  const selectCalendar = useCallback(
    (id: string, direction?: number) => {
      if (!household || id === household.id || switchingRef.current) return;
      if (direction !== undefined) setStackDirection(direction);
      else {
        const from = orderedMemberships.findIndex((m) => m.household_id === household.id);
        const to = orderedMemberships.findIndex((m) => m.household_id === id);
        setStackDirection(to >= from ? 1 : -1);
      }
      switchingRef.current = true;
      setActiveHouseholdId(id);
      window.setTimeout(() => {
        switchingRef.current = false;
      }, 320);
    },
    [household, orderedMemberships, setActiveHouseholdId],
  );

  // Push tap may target another calendar — switch first; CalendarView opens the day.
  useEffect(() => {
    if (!household) return;
    const maybeSwitch = (householdId: string | null | undefined) => {
      if (!householdId || householdId === household.id) return;
      if (!orderedMemberships.some((m) => m.household_id === householdId)) return;
      selectCalendar(householdId);
    };
    const pending = peekPendingOpenDay();
    if (pending?.householdId) maybeSwitch(pending.householdId);
    return subscribePendingOpenDay((value) => maybeSwitch(value.householdId));
  }, [household, orderedMemberships, selectCalendar]);

  const handleSwipeCalendarStack = useCallback(
    (direction: 1 | -1) => {
      if (!household) return;
      if (showNewEvent || showNewCountdown || editEvent || quickEditEvent || profileMode || showSeedWeek) return;
      const nextId = adjacentCalendarId(memberships, household.id, direction);
      if (nextId) selectCalendar(nextId, direction);
    },
    [household, memberships, selectCalendar, showNewEvent, showNewCountdown, editEvent, quickEditEvent, profileMode, showSeedWeek],
  );

  const calendarKind = household ? resolveCalendarKind(household) : 'home';
  const canSeedWeek =
    !!household &&
    calendarKind === 'home' &&
    hasEventsReady &&
    hasEvents === false;

  useEffect(() => {
    if (!household || !canSeedWeek) return;
    if (isSeedWeekDismissed(household.id)) return;
    if (seedAutoOpenedRef.current === household.id) return;
    seedAutoOpenedRef.current = household.id;
    setShowSeedWeek(true);
  }, [household, canSeedWeek]);

  // Join welcome: after onboarding or joining via profile (no seed step).
  // Create welcome: wait until seed finishes / is skipped (see revealWelcomeAfterSeed).
  useEffect(() => {
    if (!household || !hasEventsReady) return;
    const pending = peekWelcomeIntent(household.id);
    if (pending === 'join') {
      consumeWelcomeIntent(household.id);
      const t = window.setTimeout(() => setWelcomeDialog('join'), 400);
      return () => window.clearTimeout(t);
    }
    if (pending === 'create' && !canSeedWeek) {
      // Seed won't open (already has events / not home) — welcome now.
      consumeWelcomeIntent(household.id);
      const t = window.setTimeout(() => setWelcomeDialog('create'), 400);
      return () => window.clearTimeout(t);
    }
  }, [household, hasEventsReady, canSeedWeek]);

  const revealWelcomeAfterSeed = useCallback(() => {
    if (!household) return;
    const pending = consumeWelcomeIntent(household.id);
    if (pending) {
      window.setTimeout(() => setWelcomeDialog(pending), 280);
    }
  }, [household]);

  const flashHighlight = useCallback((eventId: string, dateStr: string) => {
    setHighlight({ eventId, dateStr, ts: Date.now() });
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y && m && d) setFocusedDate(new Date(y, m - 1, d));
    window.setTimeout(() => setHighlight(null), 1400);
  }, []);

  useEffect(() => {
    setStackMotionOn(true);
  }, []);

  const beginWelcomeReveal = useCallback(() => {
    if (!coldStartRef.current) return;
    coldStartRef.current = false;
    setBootPhase('revealing');
    // Let the in-app veil start dissolving first so native splash doesn’t
    // uncover a mid-compositor frame (black flash on iOS WebView).
    window.setTimeout(() => markAppReady(), 48);
  }, []);

  // Unmount veil only after fade has fully settled — no AnimatePresence exit (double-fade glitch).
  useEffect(() => {
    if (bootPhase !== 'revealing') return;
    const t = window.setTimeout(() => setBootPhase('done'), 900);
    return () => window.clearTimeout(t);
  }, [bootPhase]);

  // Failsafe: never leave boot cover / splash stuck if calendar ready never fires.
  useEffect(() => {
    const t = window.setTimeout(() => beginWelcomeReveal(), 4800);
    return () => window.clearTimeout(t);
  }, [beginWelcomeReveal]);

  // Auth / onboarding / error: release splash once that screen is the destination.
  useEffect(() => {
    if (authLoading || ctxLoading) return;
    if (!user || ctxError || !household || !currentMember) {
      beginWelcomeReveal();
    }
  }, [authLoading, ctxLoading, user, ctxError, household, currentMember, beginWelcomeReveal]);

  const handleCalendarReady = useCallback(() => {
    beginWelcomeReveal();
  }, [beginWelcomeReveal]);

  if (getRecoveryState().isRecoveryFlow) {
    return <Navigate to="/auth/update-password" replace />;
  }

  if (authLoading || ctxLoading) {
    // Quiet boot — native splash stays up; web shows splash-matching surface (no spinner).
    return (
      <LocaleProvider>
        <div
          className="min-h-[100dvh] bg-background"
          style={{ backgroundColor: PASTEL.paper }}
          aria-busy="true"
          aria-label="Laster"
        />
      </LocaleProvider>
    );
  }

  if (!user) {
    if (!authView) {
      return (
        <LocaleProvider>
          <Landing
            onGetStarted={() => setAuthView('signup')}
            onSignIn={() => setAuthView('login')}
          />
        </LocaleProvider>
      );
    }
    return (
      <LocaleProvider>
        <AuthPage initialMode={authView} />
      </LocaleProvider>
    );
  }

  if (ctxError) {
    return (
      <LocaleProvider>
        <div className="h-[100dvh] bg-background flex items-center justify-center px-6 py-safe">
          <div className="w-full max-w-sm text-center">
            <p className="text-4xl mb-4" aria-hidden>📡</p>
            <h1 className="text-2xl font-bold mb-2">Kunne ikke hente kalenderen</h1>
            <p className="text-muted-foreground mb-6">
              Kalenderen din er fortsatt trygg. Kontroller forbindelsen og prøv igjen.
            </p>
            <button
              type="button"
              onClick={() => void refetchContext()}
              className="min-h-12 w-full rounded-2xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
            >
              Prøv igjen
            </button>
          </div>
        </div>
      </LocaleProvider>
    );
  }

  if (!household || !currentMember) {
    return (
      <LocaleProvider>
        <OnboardingPage onComplete={invalidate} />
      </LocaleProvider>
    );
  }

  const handleSelectDate = (date: Date) => {
    setFocusedDate(date);
  };

  const handleCreateEvent = (date: Date) => {
    tryOpenSheet(() => {
      setNewEventDate(date);
      setShowNewEvent(true);
    });
  };

  const handleCreateCountdown = (date: Date) => {
    tryOpenSheet(() => {
      setNewCountdownDate(date);
      setShowNewCountdown(true);
    });
  };

  const handleEditEvent = (event: Event) => {
    tryOpenSheet(() => setEditEvent(event));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setProfileMode(null);
      queryClient.clear();
    } catch (err: any) {
      console.error('Sign out error:', err);
      toast.error('Feil ved utlogging', {
        description: err?.message ?? 'Kunne ikke logge ut. Prøv igjen.',
      });
    }
  };

  const canSwipeStack = orderedMemberships.length > 1;

  const welcomeEase = [0.22, 1, 0.36, 1] as [number, number, number, number];
  const showBootVeil = bootPhase === 'covering' || bootPhase === 'revealing';

  return (
    <LocaleProvider calendarLocale={(household as any).locale}>
    <VacationModeProvider
      member={currentMember}
      calendarKind={calendarKind}
      countdowns={activeCountdowns}
    >
    <CalendarShell calendarKind={calendarKind}>
      {showBootVeil && <BootVeil revealing={bootPhase === 'revealing'} />}

      <motion.div
        className="relative z-10 flex min-h-0 flex-1 flex-col bg-background"
        initial={false}
        animate={bootPhase === 'covering' ? { y: 12 } : { y: 0 }}
        transition={{ duration: 0.85, ease: welcomeEase }}
      >
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-0.5 z-10">
        <CalendarSwitcher
          household={household}
          memberships={orderedMemberships}
          stackIndex={stackIndex}
          onSelect={(id) => selectCalendar(id)}
          onOpenSettings={(id) => {
            if (id !== household.id) selectCalendar(id);
            // Defer sheet open so calendar switch paint isn't blocked (esp. Android)
            window.requestAnimationFrame(() => {
              tryOpenSheet(() => setProfileMode('calendar'));
            });
          }}
        />
        <button
          onClick={() => {
            window.requestAnimationFrame(() => {
              tryOpenSheet(() => setProfileMode('account'));
            });
          }}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden shadow-sm"
          style={
            !currentMember.avatar_url
              ? { backgroundColor: `hsl(var(--member-${currentMember.color_token.replace('pastel-', '')}))` }
              : undefined
          }
        >
          {currentMember.avatar_url ? (
            <img src={currentMember.avatar_url} alt={currentMember.display_name} className="w-full h-full object-cover" />
          ) : (
            currentMember.display_name.charAt(0)
          )}
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden relative bg-background md:grid md:grid-cols-[minmax(0,1fr)_22rem] lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Single instance — no exit/enter overlap (avoids layered calendars) */}
        <motion.div
          key={household.id}
          initial={stackMotionOn ? { y: stackDirection >= 0 ? 36 : -36 } : false}
          animate={{ y: 0 }}
          transition={stackTransition}
          className="h-full min-w-0 flex flex-col bg-background"
        >
          <CalendarDateBridge
            focusedDate={focusedDate}
            onFocusedDateChange={setFocusedDate}
            householdId={household.id}
            members={members}
            currentMemberId={currentMember.id}
            calendarKind={calendarKind}
            onSelectDate={handleSelectDate}
            onCreateEvent={handleCreateEvent}
            onCreateCountdown={calendarKind === 'home' ? handleCreateCountdown : undefined}
            onEditEvent={handleEditEvent}
            onQuickEditEvent={(ev) => tryOpenSheet(() => setQuickEditEvent(ev))}
            onSwitchCalendar={(id) => selectCalendar(id)}
            onSwipeCalendarStack={handleSwipeCalendarStack}
            canSwipeCalendarStack={canSwipeStack}
            highlight={highlight}
            canSeedWeek={canSeedWeek}
            onSeedWeek={() => tryOpenSheet(() => setShowSeedWeek(true))}
            onReady={handleCalendarReady}
            showInOtherCalendars={!!currentMember.show_in_other_calendars}
          />
        </motion.div>

        <aside className="hidden min-h-0 flex-col border-l border-border/70 bg-card/70 md:flex">
          <DesktopDayPanel
            date={focusedDate}
            householdId={household.id}
            members={members}
            currentMemberId={currentMember.id}
            calendarKind={calendarKind}
            highlight={highlight}
            canSeedWeek={canSeedWeek}
            onCreateForDate={handleCreateEvent}
            onCreateCountdown={calendarKind === 'home' ? handleCreateCountdown : undefined}
            onEditEvent={handleEditEvent}
            onQuickEditEvent={(ev) => tryOpenSheet(() => setQuickEditEvent(ev))}
            onSeedWeek={() => tryOpenSheet(() => setShowSeedWeek(true))}
            onSwitchCalendar={(id) => selectCalendar(id)}
            showInOtherCalendars={!!currentMember.show_in_other_calendars}
          />
        </aside>
      </main>
      </motion.div>

      {showSeedWeek && (
        <SeedWeekFlow
          householdId={household.id}
          onClose={() => {
            setShowSeedWeek(false);
            revealWelcomeAfterSeed();
          }}
          onComplete={() => {
            setShowSeedWeek(false);
            revealWelcomeAfterSeed();
          }}
        />
      )}

      <AnimatePresence>
        {welcomeDialog && (
          <WelcomeDialog
            intent={welcomeDialog}
            householdId={household.id}
            onClose={() => setWelcomeDialog(null)}
          />
        )}
      </AnimatePresence>

      {showNewEvent && (
        <NewEventFlow
          householdId={household.id}
          members={members}
          currentMemberId={currentMember.id}
          calendarKind={household.kind}
          showInOtherCalendars={!!currentMember.show_in_other_calendars}
          initialDate={newEventDate}
          onClose={() => setShowNewEvent(false)}
          onCreated={(eventId, dateStr) => {
            flashHighlight(eventId, dateStr);
          }}
        />
      )}

      {showNewCountdown && (
        <NewCountdownFlow
          householdId={household.id}
          members={members}
          currentMemberId={currentMember.id}
          initialDate={newCountdownDate}
          onClose={() => setShowNewCountdown(false)}
        />
      )}

      {editEvent && (
        <EditEventFlow
          event={editEvent}
          householdId={household.id}
          members={members}
          currentMemberId={currentMember.id}
          calendarKind={household.kind}
          showInOtherCalendars={!!currentMember.show_in_other_calendars}
          onClose={() => setEditEvent(null)}
          onSaved={(eventId, dateStr) => {
            flashHighlight(eventId, dateStr);
          }}
        />
      )}

      {quickEditEvent && (
        <EditEventQuickSheet
          event={quickEditEvent}
          householdId={household.id}
          members={members}
          currentMemberId={currentMember.id}
          calendarKind={household.kind}
          showInOtherCalendars={!!currentMember.show_in_other_calendars}
          onClose={() => setQuickEditEvent(null)}
          onSaved={(eventId, dateStr) => {
            flashHighlight(eventId, dateStr);
          }}
          onOpenFullEdit={(ev) => {
            setQuickEditEvent(null);
            tryOpenSheet(() => setEditEvent(ev));
          }}
        />
      )}

      {profileMode && (
        <ProfileSheet
          key={profileMode}
          mode={profileMode}
          household={household}
          members={members}
          currentMember={currentMember}
          memberships={orderedMemberships}
          onSelectCalendar={(id) => {
            // Always pin the active id first (join/create), then animate if possible.
            setActiveHouseholdId(id);
            selectCalendar(id);
          }}
          onClose={() => setProfileMode(null)}
          onSignOut={handleSignOut}
        />
      )}
    </CalendarShell>
    </VacationModeProvider>
    </LocaleProvider>
  );
};

function CalendarDateBridge({
  focusedDate,
  onFocusedDateChange,
  ...calendarProps
}: {
  focusedDate: Date;
  onFocusedDateChange: Dispatch<SetStateAction<Date>>;
} & Omit<ComponentProps<typeof CalendarView>, 'currentDate' | 'onCurrentDateChange'>) {
  const vacation = useVacationMode();
  const weekMode = vacation.enabledForCalendar && vacation.snapshot.active;
  const currentDate = useMemo(
    () => calendarStripAnchor(focusedDate, weekMode),
    [focusedDate, weekMode],
  );
  const onCurrentDateChange = useCallback<Dispatch<SetStateAction<Date>>>(
    (update) => {
      onFocusedDateChange((prev) => applyCalendarStripChange(prev, update, weekMode));
    },
    [onFocusedDateChange, weekMode],
  );
  return (
    <CalendarView
      {...calendarProps}
      currentDate={currentDate}
      onCurrentDateChange={onCurrentDateChange}
    />
  );
}

const CalendarShell = ({
  calendarKind,
  children,
}: {
  calendarKind: string;
  children: ReactNode;
}) => {
  const vacation = useVacationMode();
  return (
    <div
      data-calendar-kind={calendarKind}
      data-vacation-mode={vacation.snapshot.active ? 'on' : 'off'}
      className="h-[100dvh] w-full bg-background flex flex-col max-w-6xl mx-auto relative overflow-hidden"
      style={{ backgroundColor: vacation.snapshot.active ? '#E7F8F9' : PASTEL.paper }}
    >
      {children}
    </div>
  );
};

export default Index;
