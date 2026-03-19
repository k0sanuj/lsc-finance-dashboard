"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
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
  collapsed?: boolean;
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
      label: "TBR Operations",
      items: [
        { href: "/tbr/my-expenses", label: "My Expenses", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/races", label: "Races", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/expense-management", label: "Expense Review", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/invoice-hub", label: "Invoice Hub", roles: ["super_admin", "finance_admin"] },
        { href: "/tbr/team-management", label: "Team Management", roles: ["super_admin", "finance_admin"] }
      ]
    },
    {
      label: "Finance",
      items: [
        { href: "/costs/TBR" as Route, label: "Costs", roles: ["super_admin", "finance_admin", "viewer"] },
        { href: "/payments/TBR" as Route, label: "Payments", roles: ["super_admin", "finance_admin"] },
        { href: "/documents/TBR" as Route, label: "Documents", roles: ["super_admin", "finance_admin"] }
      ]
    },
    {
      label: "Strategy",
      items: [
        {
          href: "/commercial-goals/TBR" as Route,
          label: "Commercial Goals",
          roles: ["super_admin", "finance_admin", "commercial_user", "viewer"]
        },
        { href: "/ai-analysis", label: "AI Analysis", roles: ["super_admin", "finance_admin"] }
      ]
    },
    {
      label: "System",
      items: [
        { href: "/agent-graph", label: "Agent Graph", roles: ["super_admin", "finance_admin"] },
        { href: "/workflow-graph", label: "Workflow Graph", roles: ["super_admin", "finance_admin"] }
      ],
      collapsed: true
    }
  ];
}

type BreadcrumbSegment = { label: string; href?: string };

function getBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [];

  if (pathname === "/" || pathname === "/login") return crumbs;

  if (pathname.startsWith("/tbr/races/")) {
    crumbs.push({ label: "TBR", href: "/tbr" });
    crumbs.push({ label: "Races", href: "/tbr/races" });
    crumbs.push({ label: "Race Detail" });
  } else if (pathname.startsWith("/tbr/expense-management/")) {
    crumbs.push({ label: "TBR", href: "/tbr" });
    crumbs.push({ label: "Expense Review", href: "/tbr/expense-management" });
    crumbs.push({ label: "Submission Detail" });
  } else if (pathname.startsWith("/tbr/")) {
    crumbs.push({ label: "TBR", href: "/tbr" });
    const sub = pathname.replace("/tbr/", "").split("/")[0];
    const labels: Record<string, string> = {
      races: "Races",
      "my-expenses": "My Expenses",
      "expense-management": "Expense Review",
      "invoice-hub": "Invoice Hub",
      "team-management": "Team Management"
    };
    if (labels[sub]) crumbs.push({ label: labels[sub] });
  } else if (pathname.startsWith("/costs/")) {
    const company = pathname.split("/")[2];
    crumbs.push({ label: "Finance" });
    crumbs.push({ label: `Costs / ${company || ""}` });
  } else if (pathname.startsWith("/payments/")) {
    const company = pathname.split("/")[2];
    crumbs.push({ label: "Finance" });
    crumbs.push({ label: `Payments / ${company || ""}` });
  } else if (pathname.startsWith("/documents/")) {
    const company = pathname.split("/")[2];
    crumbs.push({ label: "Finance" });
    crumbs.push({ label: `Documents / ${company || ""}` });
  } else if (pathname.startsWith("/commercial-goals/")) {
    const company = pathname.split("/")[2];
    crumbs.push({ label: "Strategy" });
    crumbs.push({ label: `Commercial Goals / ${company || ""}` });
  } else if (pathname.startsWith("/ai-analysis")) {
    crumbs.push({ label: "Strategy" });
    crumbs.push({ label: "AI Analysis" });
  }

  return crumbs;
}

function getWorkspaceLabel(pathname: string) {
  if (pathname.startsWith("/tbr/races/")) return "Race Workspace";
  if (pathname.startsWith("/tbr/races")) return "Races";
  if (pathname.startsWith("/tbr/my-expenses")) return "My Expenses";
  if (pathname.startsWith("/tbr/expense-management/")) return "Submission Review";
  if (pathname.startsWith("/tbr/expense-management")) return "Expense Review";
  if (pathname.startsWith("/tbr/invoice-hub")) return "Invoice Hub";
  if (pathname.startsWith("/tbr/team-management")) return "Team Management";
  if (pathname.startsWith("/tbr")) return "TBR Overview";
  if (pathname.startsWith("/fsp")) return "FSP";
  if (pathname.startsWith("/commercial-goals")) {
    return pathname.includes("/FSP") ? "Commercial Goals / FSP" : pathname.includes("/TBR") ? "Commercial Goals / TBR" : "Commercial Goals";
  }
  if (pathname.startsWith("/costs")) {
    return pathname.includes("/FSP") ? "Costs / FSP" : pathname.includes("/TBR") ? "Costs / TBR" : "Costs";
  }
  if (pathname.startsWith("/payments")) {
    return pathname.includes("/FSP") ? "Payments / FSP" : pathname.includes("/TBR") ? "Payments / TBR" : "Payments";
  }
  if (pathname.startsWith("/documents")) {
    return pathname.includes("/FSP") ? "Documents / FSP" : pathname.includes("/TBR") ? "Documents / TBR" : "Documents";
  }
  if (pathname.startsWith("/ai-analysis")) return "AI Analysis";
  if (pathname.startsWith("/agent-graph")) return "Agent Graph";
  if (pathname.startsWith("/workflow-graph")) return "Workflow Graph";
  return "Portfolio Overview";
}

function getInitials(fullName?: string) {
  if (!fullName) return "LS";
  const parts = fullName.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function SessionShell({ children, user }: SessionShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const filterItem = (item: NavItem): NavItem | null => {
    if (user && !item.roles.includes(user.role)) return null;
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

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div className="app-shell">
      {/* Mobile sidebar toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        type="button"
      >
        {sidebarOpen ? "\u2715" : "\u2630"}
      </button>

      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={closeSidebar}
        role="presentation"
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
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
            {breadcrumbs.length > 0 && (
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                {breadcrumbs.map((crumb, i) => (
                  <span key={i}>
                    <span className="breadcrumb-sep">/</span>
                    {crumb.href ? (
                      <Link href={crumb.href as Route}>{crumb.label}</Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
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
