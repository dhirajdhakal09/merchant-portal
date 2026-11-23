# Masked Field Component: How It Works

The UI half of brief requirement **F**: *"Mask sensitive fields by default with controlled role-based reveals."* A shared component that shows a sensitive value masked and, for permitted users, reveals the full value on request, briefly, through the audited server endpoint.

Related: [MASKING-AND-REVIEW-API.md](MASKING-AND-REVIEW-API.md) (server masking, reveal endpoint, audit log), [APPLICATION-API-REVIEW-METHODS.md](APPLICATION-API-REVIEW-METHODS.md) (`revealField`), [APPLICATION-DETAIL.md](APPLICATION-DETAIL.md) (the page using it).

| File | Change |
| --- | --- |
| `shared/components/masked-field/masked-field.component.ts` | **Built**: the component |
| `shared/components/masked-field/masked-field.component.html` | Template |
| `shared/components/masked-field/masked-field.component.spec.ts` | **New**: 13 tests |
| `shared/components/masked-field/masked-field.component.scss` | Removed (empty, unused) |
| `features/application-detail/application-detail.component.*` | `canReveal` computed; three sensitive fields use `<app-masked-field>` |

Suite: **110 tests in 11 files, all passing**; lint, types, formatting and production build clean.

---

## 1. What the user sees

| Who | Account number shows | Button |
| --- | --- | --- |
| SALES (even the creator), or anyone the server wouldn't allow | `••••2345` | none |
| ADMIN, or the assigned REVIEWER | `••••2345` | **Reveal** |
| … after clicking Reveal (loading) | `••••2345` | spinner + "Revealing…" (disabled) |
| … revealed | `0000012345` | **Hide** |
| … 30 seconds later, or after Hide | `••••2345` | **Reveal** |
| Reveal failed | `••••2345` + small red message | **Reveal** (try again) |
| Field empty (incomplete draft) | "Not provided" | none |

---

## 2. Inputs

```ts
readonly label = input.required<string>();              // "Account number"
readonly maskedValue = input.required<string>();        // "••••2345" (as sent by the server)
readonly field = input.required<SensitiveField>();      // 'bank.accountNumber'
readonly applicationId = input.required<string>();      // 'app-007'
readonly canReveal = input(false);                      // show the Reveal button?
```

- **Signal inputs**: the template and `computed`s react automatically when they change.
- `field` is typed `SensitiveField`, so only real sensitive fields can be passed.
- `canReveal` defaults to **`false`**: forgetting to set it means **no** Reveal button (fail closed).

### Used in the detail page

```html
<dt class="col-sm-5">Account number</dt>
<dd class="col-sm-7">
  <app-masked-field
    label="Account number"
    field="bank.accountNumber"
    [maskedValue]="a.bank.accountNumber"
    [applicationId]="a.id"
    [canReveal]="canReveal()"
  />
</dd>
```

Used for **Date of birth**, **Account number** and **Routing number**.

---

## 3. Who may reveal: `canReveal` in the detail page

```ts
protected readonly canReveal = computed(() => {
  const app = this.app();
  const user = this.auth.currentUser();
  if (!app || !user) return false;
  return user.role === 'ADMIN' || (user.role === 'REVIEWER' && app.assignedReviewerId === user.id);
});
```

- Mirrors the **server's** rule exactly (ADMIN, or the assigned REVIEWER), so the button is only offered to people the server will actually allow.
- A `computed` signal: it updates automatically if the user or the application changes.

**`canReveal` is UX, not security.** It only decides whether the button is **shown**. The server decides whether the value is **returned** (403 otherwise) and **records every reveal**. Even if someone forced `canReveal` to `true` in DevTools, the request would be rejected.

---

## 4. Reveal flow

```ts
protected reveal(): void {
  if (this.loading()) return;                     // no double requests
  this.loading.set(true);
  this.error.set(null);

  this.api
    .revealField(this.applicationId(), this.field())
    .pipe(
      finalize(() => this.loading.set(false)),     // always clears the loading state
      takeUntilDestroyed(this.destroyRef),         // cancelled if the page is left mid-request
    )
    .subscribe({
      next: ({ value }) => {
        this.revealedValue.set(value);
        this.startAutoHide();
      },
      error: (err: unknown) => {
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 403
            ? "You're not allowed to see this value."
            : "Couldn't reveal the value. Try again.",
        );
      },
    });
}
```

```
[Reveal] ─click─► loading: "Revealing…" (button disabled)
                    │  POST /api/applications/:id/reveal { field }   ← server checks role + audits
          ┌─────────┴──────────┐
        200                   error
   show full value        inline message, masked value stays,
   + [Hide]               Reveal enabled again
   + 30 s timer starts
```

| Detail | Why |
| --- | --- |
| `if (this.loading()) return` + disabled button | Prevents duplicate requests, which would also mean duplicate audit entries |
| `finalize` | Loading is cleared on success **and** error |
| `takeUntilDestroyed` | Leaving the page mid-request cancels the subscription, so nothing updates a destroyed component |
| 403 vs other errors | 403: "not allowed" (retrying won't help); others: "Try again" |
| On error, the **masked value stays** | Nothing to show; the button returns so the user can retry |

---

## 5. Hiding: Hide button, 30 seconds, input change, destroy

```ts
export const AUTO_HIDE_MS = 30_000;

protected hide(): void {
  clearTimeout(this.hideTimer);
  this.hideTimer = undefined;
  this.revealedValue.set(null);
}

private startAutoHide(): void {
  clearTimeout(this.hideTimer);
  this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
}

constructor() {
  // A different application or field: never keep showing the previous full value.
  effect(() => {
    this.applicationId();
    this.field();
    untracked(() => this.hide());
  });

  this.destroyRef.onDestroy(() => this.hide());
}
```

| Trigger | Result | Why |
| --- | --- | --- |
| **Hide** button | Masked again | User control |
| **30 seconds** after revealing | Masked again automatically | A value left on screen can be seen by someone walking past, or captured in a screenshot or screen share. Showing it briefly limits exposure |
| **Inputs change** (another application/field) | Masked again | Angular may **reuse** the component when navigating between applications. Without this, a revealed value from application A could stay on screen next to application B's data |
| **Component destroyed** (leaving the page) | Value cleared, timer cancelled | No full value left in memory, and no timer firing after the component is gone |

**The `effect` + `untracked` pattern:** the effect *reads* `applicationId()` and `field()` to subscribe to them, and calls `hide()` inside `untracked()` so that the signals `hide()` writes (`revealedValue`) don't become dependencies of the effect.

**`clearTimeout` before each new timer:** revealing again resets the 30 seconds instead of stacking timers.

---

## 6. Never stored, never logged

| Rule | How |
| --- | --- |
| Lives only in memory | A `signal<string \| null>` inside the component |
| **Never** in `localStorage` / `sessionStorage` | No storage calls in the component; a test spies on `Storage.prototype.setItem` and confirms the value is never written |
| **Never** logged | No `console` calls in the component (checked) |
| Cleared after use | Hide / 30 s / input change / destroy, all `set(null)` |

**Why storage matters:** `localStorage` and `sessionStorage` are readable by **any script** on the page (including injected ones, i.e. XSS), survive reloads, and leave data behind on shared computers. Console logs can end up in error-reporting tools and screen recordings.

---

## 7. Template and accessibility

```html
@if (maskedValue()) {
  <span class="d-inline-flex flex-wrap align-items-center gap-2">
    <span aria-live="polite">
      @if (revealedValue(); as value) {
        <span class="font-monospace">{{ value }}</span>
        <span class="visually-hidden">(revealed, hides again automatically)</span>
      } @else {
        <span aria-hidden="true">{{ maskedValue() }}</span>
        <span class="visually-hidden">{{ maskedDescription() }}</span>
      }
      @if (error(); as message) {
        <span class="d-block small text-danger">{{ message }}</span>
      }
    </span>

    @if (canReveal()) {
      @if (revealedValue()) {
        <button type="button" class="btn btn-link btn-sm p-0"
                [attr.aria-label]="hideLabel()" (click)="hide()">Hide</button>
      } @else {
        <button type="button" class="btn btn-link btn-sm p-0"
                [attr.aria-label]="revealLabel()" [disabled]="loading()" (click)="reveal()">
          @if (loading()) { <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Revealing… }
          @else { Reveal }
        </button>
      }
    }
  </span>
} @else {
  Not provided
}
```

| Technique | Benefit |
| --- | --- |
| **`aria-live="polite"`** around the value and error | Screen readers announce the change (masked → revealed → masked, or an error) when the user pauses |
| Accessible button names: **"Reveal account number"**, **"Hide account number"** | Three "Reveal" buttons on one page would otherwise be indistinguishable. Built from `label` with `toLowerCase()` |
| Masked text `aria-hidden` + visually hidden description | Instead of "bullet bullet bullet bullet 2 3 4 5", screen readers hear **"Hidden, partially shown: 2345"** |
| "(revealed, hides again automatically)" (visually hidden) | Users who can't see the screen know the value will disappear |
| `type="button"` | Never accidentally submits a surrounding form |
| `btn-link btn-sm p-0` | Small inline action next to the value, not a big button inside a description list |
| `font-monospace` on the revealed value | Easier to read and compare digits |
| Spinner `aria-hidden` | The button's accessible name already says what it does |

### `maskedDescription`

```ts
protected readonly maskedDescription = computed(() => {
  const visible = this.maskedValue().replace(/[•/\s]/g, '');
  return visible ? `Hidden, partially shown: ${visible}` : 'Hidden';
});
```

| Masked value | Screen reader hears |
| --- | --- |
| `••••2345` | "Hidden, partially shown: 2345" |
| `••/••/1990` | "Hidden, partially shown: 1990" |
| `••••` | "Hidden" |

---

## 8. Tests (`masked-field.component.spec.ts`, 13 tests)

### Setup

```ts
revealField = vi.fn(() => of<RevealResponse>({ field: 'bank.accountNumber', value: '0000012345' }));
TestBed.configureTestingModule({
  imports: [MaskedFieldComponent],
  providers: [{ provide: ApplicationApiService, useValue: { revealField } }],
});
fixture = TestBed.createComponent(MaskedFieldComponent);
fixture.componentRef.setInput('label', 'Account number');
fixture.componentRef.setInput('field', 'bank.accountNumber');
fixture.componentRef.setInput('applicationId', 'app-007');
fixture.componentRef.setInput('maskedValue', '••••2345');
fixture.componentRef.setInput('canReveal', true);
```

- **`fixture.componentRef.setInput()`** is the way to set **signal inputs** in tests (you can't assign them directly).
- A fake `revealField` returns `of(...)` for instant success, a `Subject` to hold the request in flight, or `throwError(...)` for failures.
- Buttons are found by their **accessible name** (`button[aria-label="Reveal account number"]`), which also verifies the labels.

### Coverage

| Group | Test | Proves |
| --- | --- | --- |
| **Permissions** | hides the Reveal button when canReveal is false | No button; masked value shown |
| | shows a Reveal button with an accessible label when canReveal is true | `aria-label="Reveal account number"`, visible text "Reveal" |
| | shows "Not provided" and no button when there is no value | Empty draft fields |
| **Revealing** | calls revealField and shows the full value with a Hide button | Called with `('app-007', 'bank.accountNumber')`; full value shown, masked gone; Hide replaces Reveal |
| | shows a loading state while the request is in flight | Button disabled with "Revealing…" until the `Subject` emits |
| | Hide puts the masked value back | |
| | wraps the value in an aria-live="polite" region | The revealed value is inside the live region |
| **Auto-hide** | **hides the revealed value again after 30 seconds** | Still visible at 29 999 ms; masked at 30 000 ms; Reveal button back |
| | clears the revealed value when the inputs change to another application | Changing `applicationId` hides the old full value |
| | clears the revealed value when the component is destroyed | `fixture.destroy()` → `revealedValue()` is `null` |
| **Errors** | shows a short inline message on 403 and keeps the value masked | "You're not allowed to see this value."; masked; Reveal enabled again |
| | shows a retry message for other errors | "Couldn't reveal the value. Try again." |
| **Storage** | never writes the revealed value to localStorage or sessionStorage | `Storage.prototype.setItem` spy never receives the value |

### The 30-second test

```ts
it('hides the revealed value again after 30 seconds', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  create();
  clickReveal();
  expect(text()).toContain('0000012345');

  vi.advanceTimersByTime(AUTO_HIDE_MS - 1);
  fixture.detectChanges();
  expect(text()).toContain('0000012345');   // still visible just before 30s

  vi.advanceTimersByTime(1);
  fixture.detectChanges();
  expect(text()).not.toContain('0000012345');
  expect(text()).toContain('••••2345');
});
```

- Fakes **only** `setTimeout`/`clearTimeout`, the functions the component uses.
- **29 999 ms → still visible, 30 000 ms → hidden** proves the exact boundary.
- Uses `fixture.detectChanges()` (synchronous) instead of `whenStable()`, which could wait on Angular's own scheduling while timers are faked.
- Uses the exported `AUTO_HIDE_MS` constant, so changing the duration doesn't break the test.

---

## 9. End-to-end check (temporary, deleted afterwards)

With the real detail page, routes, interceptor and MSW:

- **ADMIN** sees three buttons labelled *"Reveal date of birth"*, *"Reveal account number"*, *"Reveal routing number"*; clicking one shows the **real stored value** and the server's **audit log gains an entry** `{ userId: 'u-admin-1', field: 'bank.accountNumber', applicationId }`.
- The **assigned REVIEWER** sees all three Reveal buttons.
- The **SALES creator** sees **no** Reveal buttons, only `••••` + last 4.

---

## 10. Defence in depth for sensitive data

| Layer | Protection |
| --- | --- |
| Server | Masks list/detail responses for everyone; reveal only for ADMIN / assigned REVIEWER (403 otherwise); every reveal audited; identity from the token |
| `canReveal` | Button offered only to users the server will allow (UX) |
| Component | Full value only in memory, one field at a time, auto-hidden after 30 s, cleared on input change and destroy, never stored or logged |
| Accessibility | Screen-reader users get clear names and descriptions without hearing bullet characters |

---

## 11. Not built yet

| Item | Notes |
| --- | --- |
| Reviewer controls (Start review, Approve/Reject form) | Brief D, hidden from SALES |
| ADMIN assignment dropdown | Uses `getReviewers()` / `assignReviewer()` |
| CSP explanation | Brief F asks to *explain Content Security Policy* |
| Copy-to-clipboard for revealed values | Deliberately not added: clipboards persist and can leak data |

---

## 12. Likely interview questions

**If the server enforces the rule, why compute `canReveal` in the UI?**
UX: users shouldn't see a button that only fails with 403. Security stays on the server, which rejects and audits regardless of the UI.

**Why auto-hide after 30 seconds?**
To limit exposure: values left on screen can be seen by passers-by or captured in screenshots and screen shares. The user can reveal again (and each reveal is audited).

**Why clear the value when the inputs change?**
Angular may reuse the component when navigating between applications; without it, a revealed value from one application could appear next to another's data.

**Why not keep revealed values in sessionStorage so they survive a reload?**
Storage is readable by any script on the page (XSS), persists, and leaves data on shared machines. Sensitive values belong only in memory, briefly.

**What does `aria-live="polite"` do here?**
It makes screen readers announce the switch between masked and revealed (and errors) when the user pauses, without interrupting.

**Why `aria-label` "Reveal account number" instead of just "Reveal"?**
There are three Reveal buttons on the page; each needs a unique accessible name so screen-reader users know which value it reveals.

**How do you test the 30-second auto-hide?**
Fake `setTimeout`/`clearTimeout` with Vitest, then advance to 29 999 ms (still visible) and 30 000 ms (hidden).

**How do you set signal inputs in a test?**
`fixture.componentRef.setInput('name', value)`.

**Why `untracked()` inside the reset effect?**
So the effect depends only on `applicationId` and `field`, not on the signals `hide()` writes, which would otherwise create unwanted dependencies.

**Why is the default `canReveal` false?**
Fail closed: if a page forgets to set it, no Reveal button appears.
