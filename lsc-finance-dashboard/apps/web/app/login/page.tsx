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
  const magicLinkAvailable = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="login-shell">
      <section className="login-card">
        <span className="eyebrow">League Sports Co</span>
        <h2>Sign in to Finance Control Center</h2>
        <p>
          Use your approved email and password. Access is restricted to allowlisted LSC
          accounts and sessions stay active for 90 days unless access is revoked.
        </p>
        {error ? <div className="login-notice error">{error}</div> : null}
        {sent ? (
          <div className="login-notice success">
            If this email is approved, a sign-in link has been sent. The link expires in 15
            minutes.
          </div>
        ) : null}
        {devLink ? (
          <div className="login-notice">
            Development magic link: <a href={devLink}>open sign-in link</a>
          </div>
        ) : null}
        <form action={passwordLoginAction} className="stack-form">
          <label className="field">
            <span>Email</span>
            <input id="login-email" name="email" type="email" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="action-button primary" type="submit">
            Sign in
          </button>
        </form>
        {magicLinkAvailable ? (
          <details className="password-fallback">
            <summary>Use secure email link instead</summary>
            <form action={requestMagicLinkAction} className="stack-form">
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <button className="action-button secondary" type="submit">
                Send secure link
              </button>
            </form>
          </details>
        ) : null}
      </section>
    </div>
  );
}
