# Google OAuth — Setup

Code is implemented and passes `tsc` and `eslint`. This is what you need to do in Google Cloud Console and Vercel to switch it on.

---

## One OAuth client, not two

You only need a **Web application** client. The launcher never talks to Google.

`launcher/main.js:306` opens the system browser at `https://playbound.club/launcher/auth`, the website mints a PlayBound token, and it returns to Electron via `playbound://link?token=…`. Google is never in that conversation — the desktop app only ever sees your own token. Adding Google to the website gives the launcher Google sign-in for free.

A Desktop client would also be the wrong tool if you wanted native auth: Google blocks OAuth in embedded webviews, so Electron would have to shell out to the system browser and run a loopback redirect — which is what you already do, minus a second secret to rotate.

---

## Google Cloud Console

**1. Project → APIs & Services → OAuth consent screen**

- User type: **External**
- App name: `PlayBound`
- Support email + developer contact: your address
- Authorised domain: `playbound.club`
- Scopes: **leave the defaults** — `openid`, `email`, `profile`. The code requests nothing beyond these, which keeps you on the non-sensitive track and out of Google's verification review. Adding any sensitive scope later triggers a review that can take weeks.
- Publishing status: while in **Testing** only accounts on the test-user list can sign in, capped at 100. Hit **Publish app** before launch. With only non-sensitive scopes, publishing is immediate — no review.

**2. Credentials → Create credentials → OAuth client ID → Web application**

Name it something like `PlayBound Web`.

**Authorised JavaScript origins** — not strictly required (NextAuth uses a server-side code flow, not a browser SDK), but harmless and needed if you add One Tap later:

```
https://playbound.club
http://localhost:3000
```

**Authorised redirect URIs** — these are required and must match exactly:

```
https://playbound.club/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

Notes: `www.playbound.club` already 301s to the apex, so no www entry. Google allows no wildcards, so Vercel preview deployments can't do Google sign-in unless you register a stable preview alias — password login still works there, and the provider self-disables when the env vars are missing.

---

## Environment variables

Vercel → Settings → Environment Variables:

```
GOOGLE_CLIENT_ID               = <from the console>
GOOGLE_CLIENT_SECRET           = <from the console>
NEXT_PUBLIC_RECAPTCHA_SITE_KEY = <from the reCAPTCHA admin console>
RECAPTCHA_SECRET_KEY           = <from the reCAPTCHA admin console>
```

Optional reCAPTCHA tuning:

```
RECAPTCHA_MIN_SCORE   = 0.5     # default; 0.0 bot … 1.0 human
RECAPTCHA_FAIL_CLOSED = false   # default; see the failure policy below
```

Add the same values to `platform/.env.local` for local development. Both integrations self-disable when their keys are absent, so the app still runs without them.

**One blocker.** `NEXTAUTH_URL` is still the old Vercel host. NextAuth builds the OAuth callback from it, so Google will reject the round trip with `redirect_uri_mismatch` until it is:

```
NEXTAUTH_URL = https://playbound.club
```

Same root cause as the canonical-URL bug in `SEO-IMPLEMENTATION.md`. Fixing it once resolves both.

---

## How it behaves

**Existing password account, later signs in with Google (same email)** → linked automatically and signed in. Google is added to `authProviders`, and the account is marked email-verified since they have now proved control of the address.

**Brand new Google user** → account created, held on `/welcome` until they pick a username, then sent where they were going.

**Google account with an unverified email** → refused, with an explanation. This is the entire security boundary of the auto-link policy: an attacker who could create an unverified Google profile on someone else's address would otherwise inherit their PlayBound account. Do not relax the `email_verified` check in `src/lib/oauthUser.ts`.

**Google-only user tries the password form** → "This account uses Google sign-in. Use the Sign in with Google button above," rather than a generic failure that dead-ends.

**Google-only user tries to change their password** → told plainly there is no password on the account.

---

## The username gate

Google gives you a name and an email but no PlayBound username, and usernames appear on reviews, guides and discussions. You chose to force a picker before first use, so:

- A new OAuth account is written with a `pb_<hex>` placeholder to satisfy the unique index, and `needsUsername: true`.
- `src/middleware.ts` redirects every route except `/welcome`, `/api/auth/*`, `/privacy` and `/terms` back to `/welcome` while that flag is set. Enforced in middleware rather than per-page so no route can forget the check — otherwise a Google signup could post a review under the placeholder, and it would be visible forever.
- `/welcome` offers a suggestion derived from their Google name, checks availability live, and enforces the same 3–20 character rules as the profile editor.
- Claiming the name clears the flag and refreshes the JWT. Existing password users are unaffected — the flag is never set for them.

---

## reCAPTCHA v3

Applied to the three endpoints an unauthenticated visitor can reach, plus login:

| Endpoint | Action | Why |
|---|---|---|
| `/api/auth/register` | `signup` | Bot account creation. Checked before any write, and before spending a Brevo call or an email send. |
| `/api/newsletter` | `newsletter` | List poisoning. Checked before the Brevo call. |
| Credentials login | `login` | Credential stuffing. Checked before the database lookup and the bcrypt compare, so an attack can't use it to burn CPU either. |

`/api/auth/verify` is deliberately excluded — it's reached from an email link and already guarded by a single-use token; adding a captcha would break the flow. Everything else that writes is behind a session, and account creation is now gated, so those inherit the protection.

**Two things that are easy to get wrong and are handled here.** The `action` is asserted server-side rather than trusted from the request body — without that, cheap tokens farmed from the newsletter form would be spendable on signup. And tokens are minted at submit time, never at mount, because v3 tokens expire after two minutes.

**Failure policy is deliberately asymmetric.** A definitive rejection — bad token, wrong action, score below threshold — fails closed. A transport failure — Google unreachable or timing out — fails **open** with a loud log, because locking every new user out over a Google blip is worse than briefly letting spam through. Set `RECAPTCHA_FAIL_CLOSED=true` if that trade stops being right for you.

**Tune the threshold from real data.** 0.5 is Google's suggested starting point, not a good answer. The reCAPTCHA admin console shows your actual score distribution after a few days of traffic — set `RECAPTCHA_MIN_SCORE` from that. Too high and you silently block real people, which is the failure mode you won't hear about.

**The badge is hidden** in `globals.css` because it's fixed bottom-right and collides with the mobile nav. Google permits that only if the attribution text is shown in the flow instead, which is what `<RecaptchaNotice />` is. The two are a pair — removing one without the other puts you out of compliance.

Worth doing at some point: your privacy policy should mention that reCAPTCHA is in use and that data goes to Google. Not urgent, but it's the kind of thing that matters if anyone ever asks.

---

## Files

| File | Purpose |
|---|---|
| `src/lib/recaptcha.ts` | **New.** Server verification: score, action binding, failure policy. |
| `src/lib/recaptchaClient.ts` | **New.** Lazy script load and token minting. Loads on first use, not site-wide. |
| `src/components/RecaptchaNotice.tsx` | **New.** The required attribution. |
| `src/lib/oauthUser.ts` | **New.** Linking policy and user upsert. The `email_verified` check lives here. |
| `src/lib/auth.ts` | Google provider (self-disabling), `signIn` callback, `needsUsername` on the JWT and session. |
| `src/lib/models/User.ts` | `password` now conditionally required; adds `authProviders`, `image`, `needsUsername`. |
| `src/middleware.ts` | **New.** The username gate. |
| `src/app/welcome/page.tsx` | **New.** Username picker, guarded server-side. |
| `src/components/UsernamePicker.tsx` | **New.** Debounced availability check, session refresh on claim. |
| `src/app/api/auth/username/route.ts` | **New.** Claim (POST) and availability (GET). |
| `src/components/GoogleSignInButton.tsx` | **New.** Button, divider, and error-code messages. |
| `src/app/login/page.tsx` · `src/app/signup/page.tsx` | Google button plus `?error=` rendering. |

---

## Testing it

1. Set the env vars, restart dev.
2. `/signup` → **Sign up with Google** → expect `/welcome`, pick a username, land on `/profile`.
3. Try navigating to `/library` mid-flow — you should bounce back to `/welcome`.
4. Register a password account, verify it, sign out, then Google sign-in with that same address → expect the existing account, not a duplicate. Check Mongo: one user document, `authProviders: ["google"]`.
5. Sign in with Google, then open the launcher and press Connect → the browser handoff should work unchanged.
6. Unset `GOOGLE_CLIENT_ID` and reload `/login` → the button disappears, password login still works.
