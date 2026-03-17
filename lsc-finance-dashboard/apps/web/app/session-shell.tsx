"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppUserRole } from "../lib/auth";

type NavItem = {
  href: Route;
  label: string;
  roles: AppUserRole[];
  children?: NavItem[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type SessionShellProps = {
  children: React.ReactNode;
  user: {
    fullName: string;
    role: AppUserRole;
  } | null;
};

function getNavGroups(role: AppUserRole | null): NavGroup[] {
  if (role === "team_member") {
    return [
      {
        label: "TBR Workspace",
        items: [
          { href: "/tbr", label: "Overview", roles: ["team_member"] },
          { href: "/tbr/my-expenses", label: "My Expenses", roles: ["team_member"] },
          { href: "/tbr/races", label: "Races", roles: ["team_member"] }
        ]
      }
    ];
  }

  return [
    {
      label: "Portfolio",
      items: [
        {
          href: "/",
          label: "Overview",
          roles: ["super_admin", "finance_admin", "commercial_user", "viewer"]
        },
        {
          href: "/tbr",
          label: "TBR",
          roles: ["super_admin", "finance_admin", "commercial_user", "viewer"]
        },
        {
          href: "/fsp",
          label: "FSP",
          roles: ["super_admin", "finance_admin", "commercial_user", "viewer"]
        }
      ]
    },
    {
      label: "TBR User View",
      items: [
        { href: "/tbr/my-expenses", label: "My Expenses", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/races", label: "Races", roles: ["super_admin", "finance_admin"] }
      ]
    },
    {
      label: "TBR Admin",
      items: [
        { href: "/tbr/expense-management", label: "Review Console", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/invoice-hub", label: "Invoice Hub", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/team-management", label: "Team Management", roles: ["super_admin", "finance_admin"] }
      ]
    },
    {
      label: "Finance Ops",
      items: [
        { href: "/costs", label: "Costs", roles: ["super_admin", "finance_admin", "viewer"] },
        { href: "/payments", label: "Payments", roles: ["super_admin", "finance_admin"] },
        { href: "/documents", label: "Documents", roles: ["super_admin", "finance_admin"] },
        {
          href: "/commercial-goals",
          label: "Commercial Goals",
          roles: ["super_admin", "finance_admin", "commercial_user", "viewer"]
        }
      ]
    },
    {
      label: "System",
      items: [
        { href: "/ai-analysis", label: "AI Analysis", roles: ["super_admin", "finance_admin"] },
        { href: "/agent-graph", label: "Agent Graph", roles: ["super_admin", "finance_admin"] },
        { href: "/workflow-graph", label: "Workflow Graph", roles: ["super_admin", "finance_admin"] }
      ]
    }
  ];
}

function getWorkspaceLabel(pathname: string) {
  if (pathname.startsWith("/tbr/races/")) {
    return "TBR / Race Workspace";
  }
  if (pathname.startsWith("/tbr/races")) {
    return "TBR / Races";
  }
  if (pathname.startsWith("/tbr/my-expenses")) {
    return "TBR / My Expenses";
  }
  if (pathname.startsWith("/tbr/expense-management")) {
    return "TBR Admin / Review Console";
  }
  if (pathname.startsWith("/tbr/invoice-hub")) {
    return "TBR Admin / Invoice Hub";
  }
  if (pathname.startsWith("/tbr/team-management")) {
    return "TBR Admin / Team Management";
  }
  if (pathname.startsWith("/tbr")) {
    return "TBR / Overview";
  }
  if (pathname.startsWith("/fsp")) {
    return "FSP";
  }
  if (pathname.startsWith("/commercial-goals")) {
    return pathname.startsWith("/commercial-goals/FSP") ? "Commercial Goals / FSP" : pathname.startsWith("/commercial-goals/TBR") ? "Commercial Goals / TBR" : "Commercial Goals";
  }
  if (pathname.startsWith("/costs")) {
    return pathname.startsWith("/costs/FSP") ? "Costs / FSP" : pathname.startsWith("/costs/TBR") ? "Costs / TBR" : "Costs";
  }
  if (pathname.startsWith("/payments")) {
    return pathname.startsWith("/payments/FSP") ? "Payments / FSP" : pathname.startsWith("/payments/TBR") ? "Payments / TBR" : "Payments";
  }
  if (pathname.startsWith("/documents")) {
    return pathname.startsWith("/documents/FSP") ? "Documents / FSP" : pathname.startsWith("/documents/TBR") ? "Documents / TBR" : "Documents";
  }
  if (pathname.startsWith("/ai-analysis")) {
    return "AI Analysis";
  }
  if (pathname.startsWith("/agent-graph")) {
    return "Agent Graph";
  }
  if (pathname.startsWith("/workflow-graph")) {
    return "Workflow Graph";
  }

  return "Overview";
}

function getInitials(fullName?: string) {
  if (!fullName) {
    return "LS";
  }

  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SessionShell({ children, user }: SessionShellProps) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const filterItem = (item: NavItem): NavItem | null => {
    if (user && !item.roles.includes(user.role)) {
      return null;
    }

    const filteredChildren = item.children
      ?.map((child) => filterItem(child))
      .filter((child): child is NavItem => child !== null);

    return {
      ...item,
      children: filteredChildren && filteredChildren.length > 0 ? filteredChildren : undefined
    };
  };

  const allowedGroups = getNavGroups(user?.role ?? null)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => filterItem(item)).filter((item): item is NavItem => item !== null)
    }))
    .filter((group) => group.items.length > 0);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-kicker">League Sports Co</span>
          <h1>Finance Operating System</h1>
          <p>
            Consolidated portfolio control for LSC, with TBR as the active operating cockpit and
            FSP kept structured for expansion.
          </p>
        </div>
        <nav>
          {allowedGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              <ul className="nav-list">
                {group.items.map((item) => (
                  <li className="nav-item" key={item.href}>
                    <Link className={isActive(item.href) ? "active" : ""} href={item.href}>
                      {item.label}
                    </Link>
                    {item.children ? (
                      <ul className="nav-sublist">
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link className={isActive(child.href) ? "active" : ""} href={child.href}>
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>{user?.fullName ?? "Signed in"}</strong>
          <span>{user ? `Role: ${user.role.replace(/_/g, " ")}` : "Authenticated operator"}</span>
        </div>
        <form action="/logout" method="post">
          <button className="action-button secondary sidebar-action" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="main">
        <div className="workspace-topbar">
          <div className="workspace-title-block">
            <span className="section-kicker">Current workspace</span>
            <strong>{getWorkspaceLabel(pathname)}</strong>
          </div>
          <div className="profile-chip">
            <span className="profile-avatar">{getInitials(user?.fullName)}</span>
            <span className="profile-copy">
              <strong>{user?.fullName ?? "Signed in user"}</strong>
              <span>{user ? user.role.replace(/_/g, " ") : "Authenticated session"}</span>
            </span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
