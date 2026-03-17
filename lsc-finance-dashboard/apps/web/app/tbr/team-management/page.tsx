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
        <p>
          Teams are the backbone for shared expense splits. This page should define who belongs to
          which team before reimbursements and shared costs become messy.
        </p>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="grid-two">
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">New team</span>
              <h3>Create Or Update Team</h3>
            </div>
          </div>
          <form action={createTeamAction} className="stack-form">
            <div className="grid-two">
              <label className="field">
                <span>Team name</span>
                <input name="teamName" placeholder="Operations Crew" required />
              </label>
              <label className="field">
                <span>Team code</span>
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
              <h3>Assign User To Team</h3>
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
              <span>Membership role</span>
              <select name="membershipRole" defaultValue="member">
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
            </label>
            <button className="action-button primary" type="submit">
              Assign membership
            </button>
          </form>
        </article>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Current structure</span>
            <h3>TBR Team Directory</h3>
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
    </div>
  );
}
