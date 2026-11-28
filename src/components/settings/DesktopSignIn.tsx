import { useState, type FormEvent } from "react";
import { clearDesktopAuth, hasDesktopAuth, signInToDesktop, useDesktopAuthRevision } from "../../api/suwayomi/desktopAuth";
import { useSettingsStore } from "../../stores/useSettingsStore";

export default function DesktopSignIn({ profileId, address }: { profileId: string; address: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useDesktopAuthRevision();
  const signedIn = hasDesktopAuth(address);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setError("");
    setWorking(true);
    form.reset();
    try {
      await signInToDesktop(profileId, address, String(fields.get("username") ?? ""), String(fields.get("password") ?? ""));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return <details className="yomi-setup-options mt-4">
    <summary>Sign in with Basic Auth</summary>
    {signedIn ? <div>
      <p>Signed in until you switch libraries, reload, or close the app.</p>
      <button type="button" className="yomi-button yomi-button-secondary" onClick={() => {
        clearDesktopAuth();
        void useSettingsStore.getState().testConnection();
      }}>Sign out of Suwayomi</button>
    </div> : <form onSubmit={signIn} className="space-y-3">
      <label className="block">Server username<input className="yomi-field mt-1 w-full" name="username" autoComplete="username" required maxLength={256} /></label>
      <label className="block">Server password<input className="yomi-field mt-1 w-full" name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
      <button type="submit" className="yomi-button yomi-button-secondary" disabled={working}>{working ? "Signing in…" : "Sign in to Suwayomi"}</button>
      {error && <p role="alert">{error}</p>}
    </form>}
  </details>;
}
