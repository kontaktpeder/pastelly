# Google Calendar sync (Hjem)

Toveis synk mellom Pastelly-hendelser og en **egen** Google-kalender («Hjem» / «Home»). Alt annet i Google forblir privat.

## Supabase secrets

Sett i prosjektet (`tvaggvidklnsgxsxxnde`):

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_OAUTH_STATE_SECRET=...   # valgfri, faller tilbake til service role
```

## Google Cloud Console

1. Opprett OAuth 2.0 Client (Web application).
2. Authorized redirect URI:

```
https://tvaggvidklnsgxsxxnde.supabase.co/functions/v1/google-calendar/callback
```

3. Aktiver **Google Calendar API**.
4. Scopes brukt av appen: `calendar` + `calendar.events` + `openid`/`email`/`profile`.

## Deploy

```bash
# migrasjon + funksjon
supabase db push   # eller apply via dashboard
supabase functions deploy google-calendar
```

## Flyt

1. Profil / velkomst → **Koble Google-kalender**
2. OAuth → edge function lagrer tokens → oppretter kalender «Hjem»
3. Create/update/delete i Pastelly → `action: push`
4. Ved app-åpning → `action: pull` (syncToken)

## Begrensninger (v1)

- Google only (ikke Apple/EventKit ennå)
- Bare home-kalendere i Pastelly (ikke work)
- Gjentakende hendelser: ikke spesialbehandlet (Google `singleEvents=true` ved pull)
- Last-write-wins via sync; ingen manuell konflikt-UI
