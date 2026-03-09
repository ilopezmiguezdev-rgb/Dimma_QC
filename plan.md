# Plan: Fix Password Recovery Flow

## Problem

When a user requests a password reset, Supabase sends an email with a recovery link. Clicking that link leads to a **blank page** because:

1. **Wrong redirect URL**: `resetPasswordForEmail()` redirects to `/login`, but Supabase appends auth tokens as URL hash fragments (e.g., `/login#access_token=...&type=recovery`). The LoginPage ignores these.
2. **No PASSWORD_RECOVERY event handling**: `onAuthStateChange` in `SupabaseAuthContext.jsx` doesn't check for the `PASSWORD_RECOVERY` event — it treats the recovery session like a normal login.
3. **No reset password UI**: There's no page for the user to enter a new password after clicking the recovery link.
4. **Catch-all route**: The `*` route redirects to `/`, a `ProtectedRoute`. If the recovery session establishes, the user lands on the dashboard with no prompt. If not, blank page.

## Approach

Handle the `PASSWORD_RECOVERY` event in the auth context, redirect to a new `/reset-password` route, and create a lightweight page for entering the new password.

---

## Phase 1: Handle PASSWORD_RECOVERY event in auth context

**File**: `src/contexts/SupabaseAuthContext.jsx`

- [x] Add `passwordRecovery` state (default `false`)
- [x] In `onAuthStateChange`, check if `event === 'PASSWORD_RECOVERY'` and set it to `true`
- [x] Expose `passwordRecovery` and `clearPasswordRecovery` in the context value

```jsx
const [passwordRecovery, setPasswordRecovery] = useState(false);

const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    setPasswordRecovery(true);
  }
  if (mounted) await handleSession(session);
});

const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);
```

Add to the `value` memo: `passwordRecovery`, `clearPasswordRecovery`.

---

## Phase 2: Create ResetPasswordPage

**File**: `src/pages/ResetPasswordPage.jsx` (new file)

- [x] Create a page with "Nueva Contraseña" and "Confirmar Contraseña" fields
- [x] On submit, call `supabase.auth.updateUser({ password })`
- [x] On success, call `clearPasswordRecovery()` and navigate to `/`
- [x] On error, show a toast
- [x] Style consistently with LoginPage (centered card, medical-gradient button)
- [x] If `passwordRecovery` is `false` (user navigated here directly), redirect to `/login`

---

## Phase 3: Add route and redirect logic

**File**: `src/App.jsx`

- [x] Import `ResetPasswordPage`
- [x] Add route: `<Route path="/reset-password" element={<ResetPasswordPage />} />` before the catch-all

**File**: `src/pages/LoginPage.jsx`

- [x] Check `passwordRecovery` from `useAuth()`
- [x] If `true`, return `<Navigate to="/reset-password" />` — this handles the case where Supabase redirects to `/login` with the recovery hash and the auth listener fires `PASSWORD_RECOVERY`

---

## Phase 4: Update redirect URL

**File**: `src/pages/LoginPage.jsx`

- [x] Change `redirectTo` from `${window.location.origin}/login` to `${window.location.origin}/reset-password`

```jsx
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`,
});
```

---

## Phase 5: Supabase Dashboard (manual)

- [ ] **(Manual)** In Supabase Dashboard > Authentication > URL Configuration, add the production URL for `/reset-password` to the **Redirect URLs** allowlist

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/contexts/SupabaseAuthContext.jsx` | Edit | Add `PASSWORD_RECOVERY` event handling |
| `src/pages/ResetPasswordPage.jsx` | **Create** | New password reset form page |
| `src/App.jsx` | Edit | Add `/reset-password` route |
| `src/pages/LoginPage.jsx` | Edit | Update `redirectTo` + redirect on recovery event |
| Supabase Dashboard | Manual | Add redirect URL to allowlist |

## Implementation Order

1. `SupabaseAuthContext.jsx` — add state + event detection
2. `ResetPasswordPage.jsx` — create the page
3. `App.jsx` — add the route
4. `LoginPage.jsx` — update redirect URL + add Navigate guard
5. Supabase Dashboard — allowlist the URL
