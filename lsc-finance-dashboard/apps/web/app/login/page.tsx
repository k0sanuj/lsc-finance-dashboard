import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const error = params?.error ?? null;

  return (
    <div className="login-shell">
      <section className="login-card">
        <span className="eyebrow">League Sports Co</span>
        <h2>Sign in to Finance Control Center</h2>
        <p>
          This platform now requires an authenticated session before anyone can view finance data
          or operate TBR workflows.
        </p>
        {error ? <div className="notice error">{error}</div> : null}
        <form action={loginAction} className="stack-form">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="action-button primary" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
