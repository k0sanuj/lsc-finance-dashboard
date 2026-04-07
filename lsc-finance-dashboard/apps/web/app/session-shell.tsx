"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import type { AppUserRole } from "../lib/auth";

type NavLink = {
  href: Route;
  label: string;
  roles: AppUserRole[];
};

type NavSection = {
  label: string;
  links: NavLink[];
};

type CompanyNav = {
  href: Route;
  label: string;
  roles: AppUserRole[];
  sections: NavSection[];
};

type SessionShellProps = {
  children: React.ReactNode;
  user: {
    fullName: string;
    role: AppUserRole;
  } | null;
};

const ALL_ADMIN: AppUserRole[] = ["super_admin", "finance_admin"];
const ALL_ROLES: AppUserRole[] = ["super_admin", "finance_admin", "commercial_user", "viewer"];

function getTbrNav(): CompanyNav {
  return {
    href: "/tbr",
    label: "TBR",
    roles: ALL_ROLES,
    sections: [
      {
        label: "Operations",
        links: [
          { href: "/tbr/my-expenses", label: "My Expenses", roles: ALL_ADMIN },
          { href: "/tbr/races", label: "Races", roles: ALL_ADMIN },
          { href: "/tbr/expense-management", label: "Expense Review", roles: ALL_ADMIN },
          { href: "/tbr/invoice-hub", label: "Invoice Hub", roles: ALL_ADMIN },
          { href: "/tbr/team-management", label: "Team Management", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Finance",
        links: [
          { href: "/costs/TBR" as Route, label: "Costs", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/payments/TBR" as Route, label: "Payments", roles: ALL_ADMIN },
          { href: "/receivables/TBR" as Route, label: "Receivables", roles: ALL_ADMIN },
          { href: "/documents/TBR" as Route, label: "Documents", roles: ALL_ADMIN },
          { href: "/vendors" as Route, label: "Vendors", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/subscriptions" as Route, label: "Subscriptions", roles: [...ALL_ADMIN, "viewer"] },
          { href: "/cap-table" as Route, label: "Cap Table", roles: ALL_ADMIN },
          { href: "/litigation" as Route, label: "Litigation & Compliance", roles: ALL_ADMIN },
          { href: "/arena-ads" as Route, label: "Arena & Ads", roles: ALL_ADMIN },
          { href: "/tax-filings" as Route, label: "Tax & Filing", roles: ALL_ADMIN },
        ],
      },
      {
        label: "People",
        links: [
          { href: "/employees" as Route, label: "Employees", roles: ALL_ADMIN },
          { href: "/salary-payable" as Route, label: "Salary Payable", roles: ALL_ADMIN },
          { href: "/payroll-invoices" as Route, label: "Payroll Invoices", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Strategy",
        links: [
          { href: "/commercial-goals/TBR" as Route, label: "Commercial Goals", roles: ALL_ROLES },
          { href: "/ai-analysis", label: "AI Analysis", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getFspNav(): CompanyNav {
  return {
    href: "/fsp",
    label: "FSP",
    roles: ALL_ROLES,
    sections: [
      {
        label: "Sports",
        links: [
          { href: "/fsp/sports" as Route, label: "All Sports", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Finance",
        links: [
          { href: "/commercial-goals/FSP" as Route, label: "Commercial Goals", roles: ALL_ROLES },
          { href: "/documents/FSP" as Route, label: "Documents", roles: ALL_ADMIN },
          { href: "/fsp/sp-multiplier" as Route, label: "SP Multiplier", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getXtzNav(): CompanyNav {
  return {
    href: "/gig-workers" as Route,
    label: "XTZ India",
    roles: ALL_ADMIN,
    sections: [
      {
        label: "People",
        links: [
          { href: "/employees?company=XTZ" as Route, label: "Employees", roles: ALL_ADMIN },
          { href: "/salary-payable?company=XTZ" as Route, label: "Salary Payable", roles: ALL_ADMIN },
          { href: "/payroll-invoices" as Route, label: "Payroll Invoices", roles: ALL_ADMIN },
          { href: "/gig-workers" as Route, label: "Gig Workers", roles: ALL_ADMIN },
        ],
      },
      {
        label: "Expenses",
        links: [
          { href: "/xtz-expenses?view=submit" as Route, label: "Submit Expense", roles: [...ALL_ADMIN, "team_member"] },
          { href: "/xtz-expenses?view=review" as Route, label: "Expense Review", roles: ALL_ADMIN },
        ],
      },
    ],
  };
}

function getTeamMemberNav(): CompanyNav {
  return {
    href: "/tbr",
    label: "TBR",
    roles: ["team_member"],
    sections: [
      {
        label: "My Work",
        links: [
          { href: "/tbr/my-expenses", label: "My Expenses", roles: ["team_member"] },
          { href: "/tbr/races", label: "Races", roles: ["team_member"] },
        ],
      },
    ],
  };
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
  if (pathname.startsWith("/commercial-goals")) return "Commercial Goals";
  if (pathname.startsWith("/costs")) return "Costs";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/receivables")) return "Receivables";
  if (pathname.startsWith("/subscriptions")) return "Subscriptions";
  if (pathname.startsWith("/vendors")) return "Vendors";
  if (pathname.startsWith("/cap-table")) return "Cap Table";
  if (pathname.startsWith("/litigation")) return "Litigation & Compliance";
  if (pathname.startsWith("/xtz-expenses")) return "XTZ Expenses";
  if (pathname.startsWith("/gig-workers")) return "Gig Workers";
  if (pathname.startsWith("/fsp/sp-multiplier")) return "SP Multiplier";
  if (pathname.startsWith("/tax-filings")) return "Tax & Filing";
  if (pathname.startsWith("/arena-ads")) return "Arena & Ads";
  if (pathname.startsWith("/employees")) return "Employees";
  if (pathname.startsWith("/salary-payable")) return "Salary Payable";
  if (pathname.startsWith("/payroll-invoices")) return "Payroll Invoices";
  if (pathname.startsWith("/fsp/sports")) return "FSP Sports";
  if (pathname.startsWith("/messaging")) return "Cross-Dashboard Messages";
  if (pathname.startsWith("/audit-reports")) return "Audit Reports";
  if (pathname.startsWith("/project-checklist")) return "Project Checklist";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/ai-analysis")) return "AI Analysis";
  if (pathname.startsWith("/agent-graph")) return "Agent Graph";
  if (pathname.startsWith("/workflow-graph")) return "Workflow Graph";
  return "Portfolio Overview";
}

function getBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  if (pathname === "/" || pathname === "/login") return [];

  const crumbs: Array<{ label: string; href?: string }> = [];

  if (pathname.startsWith("/tbr/races/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Races", href: "/tbr/races" }, { label: "Race Detail" });
  } else if (pathname.startsWith("/tbr/expense-management/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Expense Review", href: "/tbr/expense-management" }, { label: "Submission" });
  } else if (pathname.startsWith("/tbr/")) {
    crumbs.push({ label: "TBR", href: "/tbr" });
    const sub = pathname.replace("/tbr/", "").split("/")[0];
    const labels: Record<string, string> = {
      races: "Races", "my-expenses": "My Expenses", "expense-management": "Expense Review",
      "invoice-hub": "Invoice Hub", "team-management": "Team Management",
    };
    if (labels[sub]) crumbs.push({ label: labels[sub] });
  } else if (pathname.startsWith("/costs/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Costs" });
  } else if (pathname.startsWith("/payments/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Payments" });
  } else if (pathname.startsWith("/receivables/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Receivables" });
  } else if (pathname.startsWith("/documents/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Documents" });
  } else if (pathname.startsWith("/commercial-goals/")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "Commercial Goals" });
  } else if (pathname.startsWith("/subscriptions")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Subscriptions" });
  } else if (pathname.startsWith("/vendors")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Vendors" });
  } else if (pathname.startsWith("/cap-table")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Cap Table" });
  } else if (pathname.startsWith("/litigation")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Litigation & Compliance" });
  } else if (pathname.startsWith("/xtz-expenses")) {
    crumbs.push({ label: "XTZ India" }, { label: "Expenses" });
  } else if (pathname.startsWith("/gig-workers")) {
    crumbs.push({ label: "XTZ India" }, { label: "Gig Workers" });
  } else if (pathname.startsWith("/fsp/sports")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "Sports" });
  } else if (pathname.startsWith("/fsp/sp-multiplier")) {
    crumbs.push({ label: "FSP", href: "/fsp" }, { label: "SP Multiplier" });
  } else if (pathname.startsWith("/employees")) {
    crumbs.push({ label: "People" }, { label: "Employees" });
  } else if (pathname.startsWith("/salary-payable")) {
    crumbs.push({ label: "People" }, { label: "Salary Payable" });
  } else if (pathname.startsWith("/payroll-invoices")) {
    crumbs.push({ label: "People" }, { label: "Payroll Invoices" });
  } else if (pathname.startsWith("/tax-filings")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Tax & Filing" });
  } else if (pathname.startsWith("/arena-ads")) {
    crumbs.push({ label: "Finance", href: "/" }, { label: "Arena & Ads" });
  } else if (pathname.startsWith("/messaging")) {
    crumbs.push({ label: "System" }, { label: "Cross-Dashboard Messages" });
  } else if (pathname.startsWith("/audit-reports")) {
    crumbs.push({ label: "System" }, { label: "Audit Reports" });
  } else if (pathname.startsWith("/project-checklist")) {
    crumbs.push({ label: "Project Checklist" });
  } else if (pathname.startsWith("/ai-analysis")) {
    crumbs.push({ label: "TBR", href: "/tbr" }, { label: "AI Analysis" });
  }

  return crumbs;
}

function getInitials(fullName?: string) {
  if (!fullName) return "LS";
  const parts = fullName.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function SessionShell({ children, user }: SessionShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Auto-expand company based on current path
  useEffect(() => {
    if (pathname.startsWith("/tbr") || pathname.startsWith("/costs") || pathname.startsWith("/payments") || pathname.startsWith("/receivables") || pathname.startsWith("/documents") || pathname.startsWith("/subscriptions") || pathname.startsWith("/vendors") || pathname.startsWith("/cap-table") || pathname.startsWith("/litigation") || pathname.startsWith("/arena-ads") || pathname.startsWith("/tax-filings") || pathname.startsWith("/employees") || pathname.startsWith("/salary-payable") || pathname.startsWith("/payroll-invoices") || pathname.startsWith("/commercial-goals") || pathname.startsWith("/ai-analysis")) {
      setExpandedCompany("TBR");
    } else if (pathname.startsWith("/fsp")) {
      setExpandedCompany("FSP");
    } else if (pathname.startsWith("/gig-workers") || pathname.startsWith("/xtz-expenses")) {
      setExpandedCompany("XTZ India");
    }
  }, [pathname]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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

  const role = user?.role ?? null;

  // Build company navs based on role
  const companies: CompanyNav[] = role === "team_member"
    ? [getTeamMemberNav()]
    : [getTbrNav(), getFspNav(), getXtzNav()];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isCompanyActive = (company: CompanyNav) => {
    if (isActive(company.href)) return true;
    return company.sections.some((s) => s.links.some((l) => isActive(l.href)));
  };

  const toggleCompany = (label: string) => {
    setExpandedCompany((prev) => (prev === label ? null : label));
  };

  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        type="button"
      >
        {sidebarOpen ? "\u2715" : "\u2630"}
      </button>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        onClick={closeSidebar}
        role="presentation"
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="Main navigation">
        <div className="brand-block">
          <div className="brand-row">
            <div>
              <span className="brand-kicker">League Sports Co</span>
              <h1>Finance OS</h1>
            </div>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              type="button"
            >
              {sidebarCollapsed ? "\u00BB" : "\u00AB"}
            </button>
          </div>
        </div>

        <nav>
          {/* Portfolio — always visible */}
          <div className="nav-group">
            <span className="nav-label">Portfolio</span>
            <ul className="nav-list">
              <li className="nav-item">
                <Link className={pathname === "/" ? "active" : ""} href="/">
                  Overview
                </Link>
              </li>
              <li className="nav-item">
                <Link className={isActive("/project-checklist") ? "active" : ""} href={"/project-checklist" as Route}>
                  Project Checklist
                </Link>
              </li>
            </ul>
          </div>

          {/* Company sections — expandable */}
          {companies.map((company) => {
            const expanded = expandedCompany === company.label;
            const active = isCompanyActive(company);

            return (
              <div className="nav-group" key={company.label}>
                <button
                  className={`nav-company-toggle ${active ? "active" : ""} ${expanded ? "expanded" : ""}`}
                  onClick={() => toggleCompany(company.label)}
                  type="button"
                  aria-expanded={expanded}
                >
                  <span className="nav-company-indicator">{expanded ? "\u25BC" : "\u25B6"}</span>
                  <span className="nav-company-name">{company.label}</span>
                  {active && !expanded ? <span className="nav-active-dot" /> : null}
                </button>

                {expanded && (
                  <div className="nav-company-content">
                    {/* Company overview link */}
                    <ul className="nav-list">
                      <li className="nav-item">
                        <Link className={pathname === company.href ? "active" : ""} href={company.href}>
                          Overview
                        </Link>
                      </li>
                    </ul>

                    {/* Sub-sections */}
                    {company.sections
                      .map((section) => ({
                        ...section,
                        links: section.links.filter((l) => !role || l.roles.includes(role)),
                      }))
                      .filter((section) => section.links.length > 0)
                      .map((section) => (
                        <div className="nav-subsection" key={section.label}>
                          <span className="nav-sublabel">{section.label}</span>
                          <ul className="nav-sublist">
                            {section.links.map((link) => (
                              <li key={link.href}>
                                <Link className={isActive(link.href) ? "active" : ""} href={link.href}>
                                  {link.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* System — only for admins */}
          {role && ALL_ADMIN.includes(role) && (
            <div className="nav-group">
              <span className="nav-label">System</span>
              <ul className="nav-list">
                <li className="nav-item">
                  <Link className={isActive("/agent-graph") ? "active" : ""} href="/agent-graph">
                    Agent Graph
                  </Link>
                </li>
                <li className="nav-item">
                  <Link className={isActive("/workflow-graph") ? "active" : ""} href="/workflow-graph">
                    Workflow Graph
                  </Link>
                </li>
                <li className="nav-item">
                  <Link className={isActive("/messaging") ? "active" : ""} href={"/messaging" as Route}>
                    Cross-Dashboard Messages
                  </Link>
                </li>
                <li className="nav-item">
                  <Link className={isActive("/audit-reports") ? "active" : ""} href={"/audit-reports" as Route}>
                    Audit Reports
                  </Link>
                </li>
              </ul>
            </div>
          )}
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

      <main className="main" id="main-content">
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
