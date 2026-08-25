
// Tiny helpers shared by the TV screens to read the logged-in user the
// EXACT same way components/auth-context.tsx does: a JSON blob under the
// localStorage key "user" with shape { email, name }. We don't reuse the
// React context here because the TV screens render outside <AuthProvider>
// (they are standalone "10-foot UI" routes) and only need a synchronous
// read on mount for the gate + the email shown in the top bar.

export interface TvUser {
  email: string;
  name: string;
}

export function getTvUser(): TvUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === "string" && parsed.email) {
      return { email: parsed.email, name: parsed.name || parsed.email.split("@")[0] };
    }
  } catch {}
  return null;
}
