# Merchant Portal

A merchant payments onboarding portal built with **Angular 22** for a senior frontend take-home assignment ([brief](docs/ASSIGNMENT.md)). Sales staff create merchant applications, reviewers assess risk, and admins manage assignments. The backend is mocked in the browser with **MSW**, so the app runs with no server.

## Contents

- [Overview and features](#overview-and-features)
- [Setup and run](#setup-and-run)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
- [Security](#security)
- [Content Security Policy](#content-security-policy)
- [Testing](#testing)
- [Trade-offs and improvements](#trade-offs-and-improvements)
- [AI usage disclosure](#ai-usage-disclosure)

---

## Overview and features

| Brief | Feature |
| --- | --- |
| **A. Dashboard** | Responsive table with server-side pagination, status filter, debounced search, loading / error / retry / empty states, role-aware actions |
| **B. Multi-step application** | 4-step wizard (Business, Owner, Bank, Review) with typed Reactive Forms, custom and cross-field validators, accessible field errors, server 422 errors mapped to fields |
| **C. Draft & auto-save** | RxJS auto-save (debounced, queued with `concatMap`, errors caught per save), save status indicator, "unsaved changes" guard, edit mode for existing drafts |
| **D. Detail & review** | Sectioned detail page with risk history; assigned reviewer can start a review and approve/reject (with confirmation); admin can assign reviewers; none of these controls are shown to SALES |
| **F. Sensitive information** | Account number, routing number and date of birth masked **by the server**; ADMIN / assigned REVIEWER can reveal one field at a time via an **audited** endpoint; revealed values auto-hide after 30 s |
| Auth | Login, bearer-token interceptor with **refresh-once** for concurrent 401s, session restore on reload, functional route guards |

**Roles** (from the brief): **SALES** creates and edits their own applications · **REVIEWER** reviews applications assigned to them · **ADMIN** sees everything and manages assignments.

---

## Setup and run

**Requirements:** Node.js **24** (developed with 24.22.3; Angular 22 needs `^22.22.3 || ^24.15.0 || >=26`) and npm.

```bash
npm install
npm start          # = ng serve → http://localhost:4200
npm test           # = ng test (Vitest, watch mode); single run: npx ng test --watch=false
npm run lint       # = ng lint (angular-eslint)
npm run format     # Prettier; check only: npm run format:check
npm run build      # production build → dist/
```

The mock API starts automatically in the browser before the app boots (`src/main.ts`), so no backend is needed.

---

## Demo accounts

All accounts are **fictional**, and all use the password **`password123`**. It only works against the in-browser mock API and protects nothing real.

| Email | Name | Role |
| --- | --- | --- |
| sales1@example.com | Sam Sales | SALES |
| sales2@example.com | Sandy Sales | SALES |
| reviewer1@example.com | Riley Reviewer | REVIEWER |
| reviewer2@example.com | Robin Reviewer | REVIEWER |
| admin@example.com | Alex Admin | ADMIN |

The login page lists these accounts too. Seed data is 45 fake applications, generated deterministically: `example.com` emails, `555-01xx` phone numbers, account numbers starting `00000`, routing numbers starting `000`, `DEMO-REG-…` registration numbers.

**Demo hooks** (mock only): search the dashboard for **`fail`** → 500 (error and retry state); type **`savefail`** in a draft's legal name after its first save → auto-save error state.

---

## Architecture

### Folder structure

```
src/app/
├── core/        app-wide singletons
│   ├── auth/        AuthService, auth interceptor, authGuard, roleGuard
│   ├── guards/      unsavedChangesGuard (generic canDeactivate)
│   ├── layout/      ShellComponent (header, nav, logout)
│   ├── models/      shared TypeScript types (also used by the mock API)
│   └── services/    ApplicationApiService (thin, typed HTTP layer)
├── shared/      reusable, feature-agnostic pieces
│   ├── components/  load-state, masked-field, status-badge
│   ├── directives/  *appHasRole
│   ├── forms/       watchFormGroup (form events → signal bridge)
│   ├── utils/       httpStatusOf
│   └── validators/  merchant-rules (framework-free), Angular validators, error messages
├── features/    lazy-loaded pages (default exports for loadComponent)
│   ├── login/  dashboard/  application-wizard/  application-detail/
└── mocks/       MSW handlers and FAKE data only (auth, applications, review, users)
```

- **Standalone components**, built-in control flow (`@if`, `@for`, `@switch`), `inject()`, signal inputs/outputs. Angular 22's default **OnPush** change detection is enforced by lint.
- Every feature is **lazy-loaded**; the two wizard URLs (`/applications/new`, `/applications/:id/edit`) share one route via a URL matcher, so auto-save can change the URL without destroying the form.

### Signals for state, RxJS for async flows

| Use | Tool | Examples |
| --- | --- | --- |
| **State** (current values) | Signals, `computed`, `linkedSignal` | Current user and role, dashboard query, save status, `canReveal`, page notices |
| **Async data that depends on state** | `rxResource` | Dashboard list (keyed on the query signal), detail page (keyed on the id input). Cancels stale requests like `switchMap` |
| **Events over time** | RxJS operators | Debounced search (`debounceTime`, `distinctUntilChanged`), auto-save pipeline, token refresh sharing |
| **Bridges** | `toSignal`, `toObservable`, `watchFormGroup` | Reactive Forms aren't signal-based; `watchFormGroup` turns form events into a signal so OnPush views update |

Rule of thumb: **read** data with `rxResource`; **write** on user actions with explicit subscriptions; **shape events** with RxJS; **derive** with `computed`.

### Auth interceptor: refresh once for concurrent 401s

`core/auth/auth.interceptor.ts` and `AuthService.refreshAccessToken()`:

1. Attaches `Authorization: Bearer <token>` to **`/api/` requests only** (never to other origins, never to login/refresh).
2. On a **401**:
   - If the token **already changed** since this request was sent (another request finished a refresh meanwhile), retry straight away with the new token.
   - Otherwise call `refreshAccessToken()`. It keeps **one in-flight refresh** (`refreshInFlight$` + `shareReplay(1)`, reset in `finalize`), so **several requests that get 401 together all join the same `POST /api/auth/refresh`** instead of each starting one.
   - Each request is **retried once** with the new token. The retry goes to `next()` directly, so a second 401 doesn't trigger another refresh (no loops).
3. If the refresh fails, the user is logged out (`/login`).
4. 403 and other errors pass through unchanged.

### Auto-save pipeline

`features/application-wizard/draft-autosave.service.ts`, provided at the wizard component level (fresh state per wizard, cleaned up on destroy):

```
form.valueChanges
  → debounceTime(1000)                       one save per pause, not per keystroke
  → map(getRawValue → payload)               latest values; form-only fields stripped
  → distinctUntilChanged(JSON)               skip if nothing that's sent changed
  → filter(form.dirty)                       only real user changes (loading a draft doesn't save)
  ⊕ merge(saveNow() requests)                Next / "Save now" / Submit use the SAME queue
  → concatMap(save … catchError → EMPTY)     one save at a time, in order
  → takeUntilDestroyed
```

- **`concatMap`, not `switchMap`:** cancelling an in-flight HTTP save in the browser doesn't stop the server, so an older save could land after a newer one. Cancelling the first `createDraft` would also lose the new id and create a duplicate draft. `concatMap` runs saves in order; a save queued behind the create runs as an update with the new id.
- **`catchError` inside the `concatMap`:** an error that reaches the outer stream terminates it, so auto-save would silently stop after the first failure. Caught per save, only that save fails (status `error`, "Save now" offered) and the pipeline keeps running.
- The form is **never** reset or patched on errors; the user's input stays as typed. The first save creates the draft and replaces the URL with `/applications/:id/edit` so a reload continues it.

More detail in the [`docs/`](docs/) folder (one guide per feature).

---

## Security

### Guards are UX; the server enforces permissions

Route guards (`authGuard`, `roleGuard`), `*appHasRole` and hidden buttons run in the user's browser, which the user fully controls. They give each role a clean UI but **can't prevent anything**. The **mock API enforces every rule itself** on each request:

- `requireAuth()` verifies the token and role (401 / 403); identity always comes from the **token**, never the request body.
- **Record-level scoping** on the server: SALES only see what they created, REVIEWERs only what's assigned to them (list and detail), ADMIN sees all.
- State rules return **409** (e.g. decide only when IN_REVIEW); validation returns **422** with field errors (submit re-validates the **stored** draft).
- **Mass-assignment protection:** draft saves copy only an allow-list of form fields; `status`, `createdById`, etc. can't be set by clients.

### Token storage trade-offs

| Option | Survives reload | Readable by JS (XSS risk) | Used for |
| --- | --- | --- | --- |
| Memory (signal) | No | Only while running | **Access token** (60 s) |
| `sessionStorage` | Yes (tab only) | Yes | **Refresh token**, so a reload restores the session |
| `localStorage` | Yes (forever) | Yes | Not used |
| `httpOnly` cookie | Yes | **No** | Best for refresh tokens in production; needs a real server (and `SameSite`/CSRF protection), which an in-browser mock can't provide |

### Server-side masking with audited reveal

- List and detail responses return sensitive fields **masked for everyone, including ADMIN** (`••••2345`, `••/••/1990`). Masking only in the UI would still send the full values to the browser (DevTools, caches, extensions, XSS).
- `POST /api/applications/:id/reveal { field }` returns **one** field in full, only to **ADMIN** or the **assigned REVIEWER** (403 otherwise), and records `{ userId, field, applicationId, at }` in an audit log.
- In the UI (`masked-field`), revealed values live only in memory, **auto-hide after 30 s**, are cleared on navigation/destroy, and are never stored or logged.
- The draft's creator gets full values only for their **own unsubmitted draft** (needed for editing).

### Angular's built-in XSS protection

- Interpolation (`{{ }}`) and property bindings **escape** values; URLs in bindings are **sanitized**.
- The codebase uses **no** `innerHTML` bindings, `bypassSecurityTrust*`, `eval` or `document.write` (checked).
- User-provided URLs (website) are shown as **text**, not links; the website validator only accepts `http(s)` (rejects `javascript:`).

### Security pass (results)

| Check | Result |
| --- | --- |
| `innerHTML` / `bypassSecurityTrust*` / `eval` / `document.write` | None found |
| Tokens in `localStorage` | None; access token in memory, refresh token in `sessionStorage` (documented trade-off) |
| `console.log` of tokens / sensitive values | None. The only console call is `console.error` for bootstrap failures in `main.ts` |
| Real personal / payment data in mocks | None. Only `example.com` emails, `555-01xx` phones, invalid `00000…`/`000…` bank numbers |
| `.gitignore` covers `.env` | Yes (`.env`, `.env.*`, except `.env.example`); no env/secret files tracked |
| Committed secrets | None. `password123` is a documented demo password for fake mock users |
| **Fixed:** bearer token sent to any URL | The interceptor attached the token to every request. Now **only `/api/`** requests get it, so it can't leak to third-party origins (3 tests added) |
| ReDoS-prone email regex (earlier pass) | Fixed; domain segments can't overlap, so matching is linear |

---

## Content Security Policy

**What it is:** an HTTP response header that tells the browser which sources of scripts, styles, images, connections, etc. the page may load. Anything not allowed is blocked.

**What it reduces:**

- **XSS impact:** injected `<script>` tags, inline event handlers (`onclick="…"`) and scripts from unknown domains won't run.
- **Data exfiltration:** `connect-src` / `img-src` limit where a script could send stolen data.
- **Clickjacking:** `frame-ancestors` stops other sites embedding the app in an iframe.
- **Plug-in and base-tag attacks:** `object-src 'none'`, `base-uri 'self'`.

CSP is **defence in depth**: it limits the damage if an XSS bug slips through; it doesn't replace escaping and sanitization.

### Example production header for this app

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'nonce-{RANDOM_PER_REQUEST}';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests
```

| Directive | Why |
| --- | --- |
| `default-src 'self'` | Fallback: only this origin, unless a directive below says otherwise |
| `script-src 'self'` | Only our own bundled JS files; **no inline scripts, no `eval`**, no third-party scripts |
| `style-src 'self' 'nonce-…'` | Our CSS files, plus `<style>` tags carrying the per-request nonce (Angular injects component styles at runtime) |
| `img-src 'self' data:` | Our images, plus `data:` URIs, which Bootstrap's CSS uses for form-control icons (select arrow, checkbox, close button) |
| `font-src 'self'` | Fonts only from our origin |
| `connect-src 'self'` | `fetch`/XHR only to our API. Add the API's origin if it's served elsewhere |
| `worker-src 'self'` | Service workers from our origin (the MSW demo worker; drop it if no worker is used in production) |
| `object-src 'none'` | No `<object>`/`<embed>` plug-ins |
| `base-uri 'self'` | Stops an injected `<base>` tag from redirecting relative URLs |
| `form-action 'self'` | Forms can only submit to our origin |
| `frame-ancestors 'none'` | Can't be embedded in iframes (clickjacking) |
| `upgrade-insecure-requests` | Any `http://` sub-resource is fetched over HTTPS |

### Making the Angular build compatible

The production build currently contains **one inline `<script>`** and **one inline `<style>`** from Angular's critical-CSS inlining, which `script-src 'self'` would block. Before enabling this header:

1. **Inline script:** disable critical-CSS inlining (`"optimization": { "styles": { "inlineCritical": false } }` in `angular.json`) **or** enable Angular's `"security": { "autoCsp": true }` build option, which adds hashes for its inline loader scripts.
2. **Runtime styles:** the server generates a random nonce per request, sends it in the header, and puts it on the root element (`<app-root ngCspNonce="{RANDOM_PER_REQUEST}">`). Angular then adds it to every `<style>` it creates. A static header without a nonce would need `'unsafe-inline'` for styles, which is weaker.
3. Roll out with **`Content-Security-Policy-Report-Only`** first to catch violations without breaking users.

Related headers worth sending too: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`.

---

## Testing

**Vitest + Angular TestBed.** Run all tests once with `npx ng test --watch=false` (or `npm test` for watch mode). Run one file with `npx ng test --watch=false --include="**/draft-autosave.service.spec.ts"`.

**Current suite: 130 tests in 13 files, all passing.**

| Area | What's covered |
| --- | --- |
| Auth | `authGuard` (redirect with `returnUrl`), `roleGuard` (allow, redirect, fail closed), `AuthService` login/logout and token storage, interceptor token scoping (`/api/` only) |
| API layer | `ApplicationApiService`: every method's URL, verb, body, query params, id encoding, error passthrough (`HttpTestingController`) |
| Validators | Every custom validator incl. edge cases (exactly 18 today, 29 February, empty values), `serverError()`, client/server rule agreement |
| Form | Structure matches the model, validators wired to the right controls and groups |
| Auto-save | One save per debounce (fake timers), create → update with no duplicate create while in flight, error leaves the form untouched and the stream alive, `saveNow()` |
| Wizard | Next on invalid/valid steps, focus management, 422 errors on fields, server error cleared on edit, no duplicate draft on retry |
| Leave guard | Ask / allow / block, destination URL passed to the component |
| Masked field | Hidden without permission, reveal and hide, auto-hide after 30 s (fake timers), cleared on input change and destroy, errors, never stored |
| Detail page | Role-based visibility (SALES / assigned / non-assigned REVIEWER / ADMIN), Start review, conditional 20-character rejection rule, confirmation dialog, 422 and 409 handling, reviewer assignment |

Every feature was also verified end to end during development with temporary tests running the real routes, interceptor and MSW handlers (not kept in the suite).

---

## Trade-offs and improvements

**Trade-offs made**

- **Mock backend in the browser (MSW):** no server to run, and the network layer is real (DevTools shows requests). But the "server" lives in the same bundle: tokens are unsigned, data resets on reload, and masking happens in the same JS context. A real backend would sign JWTs, hash passwords and persist data.
- **MSW starts in every build** (`main.ts`) because there's no real API. With a real backend it would be loaded only in development (dynamic import), which would also remove the bundle-size warning (initial bundle ~810 kB vs the 500 kB budget).
- **Refresh token in `sessionStorage`** rather than an `httpOnly` cookie, because a browser-only mock can't set one.
- **Validation rules shared as TypeScript functions** between client and mock server. Realistic only because both are TypeScript; a separate backend would share a schema (e.g. OpenAPI/JSON Schema) instead.
- **`window.confirm()`** for the leave-page warning (accessible and simple); a custom modal would look nicer.

**With more time**

- **Unit-test the interceptor's refresh-once behaviour** with several concurrent 401s (currently verified manually; only token scoping is unit-tested).
- Tests for the dashboard, `HasRoleDirective` and shell; an e2e suite (Playwright) for the main flows.
- Load MSW only in development; restore the bundle budget.
- Apply the CSP above with nonces and `autoCsp`; add security headers.
- Optional brief items: dashboard counts by status, real-time status updates (Socket.IO).
- Audit log view for admins; retry with backoff for auto-save; offline detection.
- Small cleanup: `refreshAccessToken()` types its response as `AuthResponse` although the endpoint returns `RefreshResponse`.

---

## AI usage disclosure

> **⚠️ PLACEHOLDER: to be written by the candidate.**
>
> _Describe which AI tools were used, for what, and how the output was reviewed and verified._

---

*All data in this repository is fictional. No real personal, customer or payment card data is included.*
