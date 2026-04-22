import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type SearchHitKind =
  | "vendor"
  | "employee"
  | "race"
  | "invoice-intake"
  | "payroll-invoice"
  | "deal"
  | "subscription"
  | "sponsor"
  | "document"
  | "payment"
  | "fsp-sport"
  | "race-season";

export type SearchHit = {
  id: string;
  kind: SearchHitKind;
  label: string;
  subtitle?: string;
  href: string;
};

/**
 * Fuzzy-ish search across the top entity tables. Uses ILIKE for case-insensitive
 * substring match — fast, index-friendly, no ranking. Each sub-query returns
 * up to `perTypeLimit` rows so one noisy entity doesn't drown the others.
 *
 * All reads go through queryRows (app_read role). Soft-deleted rows are excluded
 * per the WHERE deleted_at IS NULL convention.
 *
 * Returns [] if the database backend isn't live (seed mode) or the query is
 * too short.
 */
export async function searchEntities(
  rawQuery: string,
  opts: { perTypeLimit?: number } = {}
): Promise<SearchHit[]> {
  if (getBackend() !== "database") return [];

  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const perType = opts.perTypeLimit ?? 5;
  const pattern = `%${q}%`;

  // Detect 4-digit year in query — triggers the race-season synthetic hit
  const yearMatch = q.match(/\b(20\d{2})\b/);
  const matchedYear = yearMatch ? Number(yearMatch[1]) : null;

  // Each sub-query owns its own catch so one broken table doesn't kill the
  // whole palette. We log but return [] for failed sources.
  const [
    vendors,
    employees,
    races,
    intakes,
    payrollInvoices,
    deals,
    subscriptions,
    sponsors,
    documents,
    payments,
    fspSports,
    raceSeason,
  ] =
    await Promise.all([
      queryRows<{ id: string; name: string; vendor_type: string | null; currency_code: string }>(
        `select id, name, vendor_type::text, currency_code
         from vendors
         where name ilike $1
         order by updated_at desc nulls last, name
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; full_name: string; designation: string | null; company_code: string }>(
        `select e.id, e.full_name, e.designation, c.code::text as company_code
         from employees e
         join companies c on c.id = e.company_id
         where e.full_name ilike $1
         order by e.updated_at desc nulls last, e.full_name
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; name: string; season_year: number; location: string | null }>(
        `select id, name, season_year, location
         from race_events
         where name ilike $1 or location ilike $1
         order by season_year desc, name
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; vendor_name: string; invoice_number: string | null; intake_status: string }>(
        `select id, vendor_name, invoice_number, intake_status::text
         from invoice_intakes
         where vendor_name ilike $1 or invoice_number ilike $1
         order by submitted_at desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; invoice_number: string; issuer_legal_name: string | null; status: string }>(
        `select id, invoice_number, issuer_legal_name, status::text
         from payroll_invoices
         where invoice_number ilike $1 or issuer_legal_name ilike $1
         order by invoice_date desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; deal_name: string; department: string; stage: string }>(
        `select id, deal_name, department, stage::text
         from deal_pipeline
         where deal_name ilike $1
         order by updated_at desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; name: string; provider: string; status: string }>(
        `select id, name, provider, status::text
         from subscriptions
         where name ilike $1 or provider ilike $1
         order by updated_at desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      queryRows<{ id: string; name: string; company_code: string; counterparty_type: string }>(
        `select s.id, s.name, c.code::text as company_code, s.counterparty_type::text
         from sponsors_or_customers s
         join companies c on c.id = s.company_id
         where s.name ilike $1
         order by s.updated_at desc nulls last, s.name
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      // Documents by source_name OR by the vendor/sponsor on the linked invoice
      queryRows<{
        id: string;
        source_name: string;
        document_type: string;
        company_code: string | null;
        vendor_hint: string | null;
      }>(
        `select sd.id, sd.source_name, sd.document_type::text,
                c.code::text as company_code,
                coalesce(ii.vendor_name, soc.name) as vendor_hint
         from source_documents sd
         left join companies c on c.id = sd.company_id
         left join invoice_intakes ii on ii.source_document_id = sd.id
         left join invoices inv on inv.source_document_id = sd.id
         left join sponsors_or_customers soc on soc.id = inv.sponsor_or_customer_id
         where sd.source_name ilike $1
            or ii.vendor_name ilike $1
            or soc.name ilike $1
         order by sd.updated_at desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      // Payments — match by sponsor name on linked invoice, or description, or reference
      queryRows<{
        id: string;
        amount: string;
        currency_code: string;
        direction: string;
        payment_status: string;
        sponsor_name: string | null;
        company_code: string | null;
        payment_date: string | null;
      }>(
        `select p.id, p.amount::text, p.currency_code, p.direction::text,
                p.payment_status::text,
                soc.name as sponsor_name,
                c.code::text as company_code,
                p.payment_date::text
         from payments p
         left join invoices inv on inv.id = p.invoice_id
         left join sponsors_or_customers soc on soc.id = inv.sponsor_or_customer_id
         left join companies c on c.id = p.company_id
         where soc.name ilike $1
            or p.description ilike $1
            or p.reference_number ilike $1
         order by p.payment_date desc nulls last
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      // FSP sports — display_name, sport_code, league_name
      queryRows<{
        id: string;
        sport_code: string;
        display_name: string;
        league_name: string | null;
      }>(
        `select id, sport_code::text, display_name, league_name
         from fsp_sports
         where display_name ilike $1
            or sport_code::text ilike $1
            or league_name ilike $1
         order by display_name
         limit $2`,
        [pattern, perType]
      ).catch(() => []),

      // Race season — synthetic: if query looks like a year, return a
      // single navigation hit that takes the user to the season-year races.
      (async (): Promise<
        Array<{ year: number; raceCount: number }>
      > => {
        if (matchedYear === null) return [];
        const rows = await queryRows<{ c: number }>(
          `select count(*)::int as c from race_events where season_year = $1`,
          [matchedYear]
        ).catch(() => [] as Array<{ c: number }>);
        const count = rows[0]?.c ?? 0;
        if (count === 0) return [];
        return [{ year: matchedYear, raceCount: count }];
      })(),
    ]);

  const hits: SearchHit[] = [];

  for (const v of vendors) {
    hits.push({
      id: `vendor:${v.id}`,
      kind: "vendor",
      label: v.name,
      subtitle: [v.vendor_type?.replace(/_/g, " "), v.currency_code].filter(Boolean).join(" · "),
      href: `/vendors?highlight=${v.id}`,
    });
  }
  for (const e of employees) {
    hits.push({
      id: `employee:${e.id}`,
      kind: "employee",
      label: e.full_name,
      subtitle: [e.designation, e.company_code].filter(Boolean).join(" · "),
      href: `/employees?company=${e.company_code}&highlight=${e.id}`,
    });
  }
  for (const r of races) {
    hits.push({
      id: `race:${r.id}`,
      kind: "race",
      label: r.name,
      subtitle: [r.location, String(r.season_year)].filter(Boolean).join(" · "),
      href: `/tbr/races/${r.id}`,
    });
  }
  for (const i of intakes) {
    hits.push({
      id: `invoice-intake:${i.id}`,
      kind: "invoice-intake",
      label: i.vendor_name,
      subtitle: [i.invoice_number, i.intake_status.replace(/_/g, " ")].filter(Boolean).join(" · "),
      href: `/tbr/invoice-hub?highlight=${i.id}`,
    });
  }
  for (const p of payrollInvoices) {
    hits.push({
      id: `payroll-invoice:${p.id}`,
      kind: "payroll-invoice",
      label: p.invoice_number,
      subtitle: [p.issuer_legal_name, p.status].filter(Boolean).join(" · "),
      href: `/payroll-invoices/${p.id}`,
    });
  }
  for (const d of deals) {
    hits.push({
      id: `deal:${d.id}`,
      kind: "deal",
      label: d.deal_name,
      subtitle: [d.department, d.stage].filter(Boolean).join(" · "),
      href: `/deal-pipeline`,
    });
  }
  for (const s of subscriptions) {
    hits.push({
      id: `subscription:${s.id}`,
      kind: "subscription",
      label: s.name,
      subtitle: [s.provider, s.status].filter(Boolean).join(" · "),
      href: `/subscriptions`,
    });
  }
  for (const s of sponsors) {
    hits.push({
      id: `sponsor:${s.id}`,
      kind: "sponsor",
      label: s.name,
      subtitle: [s.counterparty_type, s.company_code].filter(Boolean).join(" · "),
      href: `/commercial-goals/${s.company_code}`,
    });
  }
  for (const d of documents) {
    hits.push({
      id: `document:${d.id}`,
      kind: "document",
      label: d.source_name,
      subtitle: [
        d.document_type.replace(/_/g, " "),
        d.vendor_hint ?? undefined,
        d.company_code ?? undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      href: d.company_code ? `/documents/${d.company_code}` : `/documents/TBR`,
    });
  }
  for (const p of payments) {
    const fmtAmount = `${p.currency_code} ${Number(p.amount).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    })}`;
    hits.push({
      id: `payment:${p.id}`,
      kind: "payment",
      label: p.sponsor_name
        ? `${p.sponsor_name} — ${fmtAmount}`
        : `Payment ${fmtAmount}`,
      subtitle: [
        p.direction,
        p.payment_status.replace(/_/g, " "),
        p.payment_date ?? undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      href: p.company_code ? `/payments/${p.company_code}` : `/payments/TBR`,
    });
  }
  for (const s of fspSports) {
    hits.push({
      id: `fsp-sport:${s.id}`,
      kind: "fsp-sport",
      label: s.display_name,
      subtitle: [s.league_name ?? undefined, s.sport_code].filter(Boolean).join(" · "),
      href: `/fsp/sports/${s.sport_code}`,
    });
  }
  for (const rs of raceSeason) {
    hits.push({
      id: `race-season:${rs.year}`,
      kind: "race-season",
      label: `TBR ${rs.year} season`,
      subtitle: `${rs.raceCount} ${rs.raceCount === 1 ? "race" : "races"}`,
      href: `/tbr/races?year=${rs.year}`,
    });
  }

  return hits;
}
