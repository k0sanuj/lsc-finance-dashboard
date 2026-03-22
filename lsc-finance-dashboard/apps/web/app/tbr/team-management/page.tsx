import { getTeamDirectory, getUserOptions } from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { assignUserToTeamAction, createTeamAction } from "./actions";

type TeamManagementPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function TeamManagementPage({
  searchParams
}: TeamManagementPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const [teams, users] = await Promise.all([getTeamDirectory(), getUserOptions()]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  return (
    <div className="page-grid">
      <section className="hero">
        <span className="eyebrow">TBR workflow</span>
        <h2>Team Management</h2>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Directory</span>
            <h3>Teams</h3>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Code</th>
                <th>Description</th>
                <th>Members</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {teams.length > 0 ? (
                teams.map((team) => (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{team.code}</td>
                    <td>{team.description}</td>
                    <td>{team.members}</td>
                    <td>{team.membershipCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={5}>
                    No teams exist yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">New team</span>
              <h3>Create team</h3>
            </div>
          </div>
          <form action={createTeamAction} className="stack-form">
            <div className="grid-two">
              <label className="field">
                <span>Name</span>
                <input name="teamName" placeholder="Operations Crew" required />
              </label>
              <label className="field">
                <span>Code</span>
                <input name="teamCode" placeholder="OPS" required />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea
                name="description"
                rows={3}
                placeholder="What this team is responsible for."
              />
            </label>
            <button className="action-button primary" type="submit">
              Save team
            </button>
          </form>
        </article>

        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Memberships</span>
              <h3>Assign member</h3>
            </div>
          </div>
          <form action={assignUserToTeamAction} className="stack-form">
            <label className="field">
              <span>User</span>
              <select name="userId" defaultValue="">
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Team</span>
              <select name="teamId" defaultValue="">
                <option value="">Select team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Role</span>
              <select name="membershipRole" defaultValue="member">
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
            </label>
            <button className="action-button primary" type="submit">
              Assign
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
