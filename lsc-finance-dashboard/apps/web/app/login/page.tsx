import { passwordLoginAction, requestMagicLinkAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    sent?: string;
    devLink?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const error = params?.error ?? null;
  const sent = params?.sent === "1";
  const devLink = params?.devLink ?? null;

  return (
    <div className="login-shell">
      <section className="login-card">
        <span className="eyebrow">League Sports Co</span>
        <h2>Sign in to Finance Control Center</h2>
        <p>
          Enter your approved email and we will send a secure sign-in link. Access is restricted
          to the allowlisted LSC finance accounts.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        {sent ? (
          <div className="notice success">
            If this email is approved, a sign-in link has been sent. The link expires in 15
            minutes.
          </div>
        ) : null}
        {devLink ? (
          <div className="notice">
            Development magic link: <a href={devLink}>open sign-in link</a>
          </div>
        ) : null}
        <form action={requestMagicLinkAction} className="stack-form">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="action-button primary" type="submit">
            Send secure link
          </button>
        </form>
        <details className="password-fallback">
          <summary>Use password instead</summary>
          <form action={passwordLoginAction} className="stack-form">
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="action-button secondary" type="submit">
              Sign in with password
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
