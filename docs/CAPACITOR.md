# Pastelly – Capacitor mobil-oppsett

Denne guiden viser hvordan du bygger og kjører Pastelly som native app på iOS
og Android via Capacitor.

## Forutsetninger

- **iOS**: macOS med Xcode 15+ og en Apple Developer-konto
- **Android**: Android Studio (Giraffe eller nyere) og Java 17
- Node 20+, npm eller bun

## 1. Klon og installer

```bash
git clone <repo>
cd pastelly
npm install
```

## 2. Legg til plattformer (kjøres kun én gang)

```bash
npx cap add ios
npx cap add android
```

Dette oppretter `ios/` og `android/` mapper. Disse skal committes.

## 3. Bygg webappen og synk til native

Hver gang du endrer web-kode:

```bash
npm run cap:sync
```

## 4. Kjør på simulator eller enhet

**iOS (kun macOS):**
```bash
npm run cap:ios       # åpner Xcode
# eller
npm run cap:run:ios   # kjører på valgt simulator/enhet
```

**Android:**
```bash
npm run cap:android       # åpner Android Studio
# eller
npm run cap:run:android
```

## 5. Deep links / auth-callback

All auth-callbacks (signup-bekreftelse, magic link, password reset og OAuth)
går gjennom én felles handler i `src/lib/auth/handleAuthCallbackUrl.ts`.

- **Web**: Supabase redirect'er til `${origin}/auth/callback`.
  `AuthCallback.tsx` kaller handleren, som prioriterer `?code=` (PKCE) og
  faller tilbake til hash-tokens. `detectSessionInUrl` er slått av i
  `src/integrations/supabase/client.ts` for å unngå dobbel-eksekvering.
- **Native**: `pastelly://auth/callback` fanges av `@capacitor/app` deep
  links (se `src/lib/native/deepLinks.ts`). Både cold start
  (`App.getLaunchUrl()`) og warm resume (`appUrlOpen`) rutes gjennom samme
  handler. Recovery-lenker sender brukeren videre til
  `/auth/update-password`.
- **Deduplisering**: handleren husker de siste 60 sekundene med koder /
  token-suffix i minnet, så React Strict Mode og cold+warm dobbel-fyring
  ikke gir "invalid grant"-feil.

### Supabase URL Configuration (må settes i dashboardet)

Under **Authentication → URL Configuration**:

- **Site URL**: `https://pastelly.no` (ikke Lovable web.app)
- **Redirect URLs** (allowlist):
  - `https://pastelly.no/auth/callback`
  - `pastelly://auth/callback` (native)
  - `http://localhost:8080/auth/callback` (Vite/Capacitor local)
  - `http://localhost:5173/auth/callback` (valgfri Vite-port)

Appen sender alltid `https://pastelly.no/auth/callback` for web i
produksjon (se `getAuthRedirectUrl`). Preview-hosts (Lovable) skal ikke
være Site URL — e-postlenker skal lande på pastelly.no.

### Signup OTP (6 siffer — dashboard, ikke kode)

Appen forventer **6 siffer**. I Supabase:

1. **Authentication → Providers → Email** (eller Auth settings): sett
   **OTP length / Mailer OTP Length** til `6` (default er ofte 8).
2. **Authentication → Email Templates → Confirm signup**

**Subject** (koden først → synlig i varsling/inbox-preview):

```
{{ .Token }} — Pastelly
```

**Body** (token øverst, uten mellomrom mellom sifrene — enkel å kopiere):

```html
<p style="font-size:32px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.25em;margin:0 0 12px">{{ .Token }}</p>
<p style="margin:0 0 20px">Skriv inn koden i Pastelly. Gyldig i 1 time.</p>
<p style="font-size:13px;color:#666;margin:0">
  Eller <a href="{{ .ConfirmationURL }}">bekreft via lenke</a>.
</p>
```

### Native URL scheme

- **iOS**: `ios/App/App/Info.plist` → `CFBundleURLTypes` med
  `CFBundleURLSchemes = ["pastelly"]`.
- **Android**: `android/app/src/main/AndroidManifest.xml` → intent-filter
  på `MainActivity` med `<data android:scheme="pastelly" />`.

## 6. App-metadata

- **appId**: `no.studiopah.pastelly`
- **appName**: `Pastelly`
- **Ikoner og splash**: legg native-ikoner i `ios/App/App/Assets.xcassets`
  og `android/app/src/main/res/mipmap-*/`.

## 7. Publisering

- iOS: Xcode → Product → Archive → App Store Connect
- Android: Android Studio → Build → Generate Signed Bundle → Google Play

## Feilsøking

- **Blank skjerm**: kjør `npm run cap:sync` på nytt.
- **Auth-callback åpner Safari/nettleser**: sjekk at deep-link scheme er
  registrert i både native prosjekt og Supabase.
- **Safe-area feil**: `viewport-fit=cover` må stå i `index.html` (allerede satt).
