import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const sep = line.indexOf("=");
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch (e) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

async function main() {
  await loadEnvFile(path.join(process.cwd(), ".env.local"));
  const connStr = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connStr) throw new Error("DATABASE_URL_ADMIN or DATABASE_URL required.");

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    await client.query("begin");

    // --- XTZ India entity ---
    const xtzRes = await client.query(`select id from companies where code = 'XTZ'::company_code`);
    let xtzId = xtzRes.rows[0]?.id;
    if (!xtzId) {
      const ins = await client.query(
        `insert into companies (code, name) values ('XTZ'::company_code, 'XTZ India') returning id`
      );
      xtzId = ins.rows[0].id;
      console.log("Created XTZ India company.");
    }

    // Get TBR and LSC and FSP IDs
    const companies = await client.query(`select id, code from companies`);
    const companyMap = Object.fromEntries(companies.rows.map(r => [r.code, r.id]));
    const tbrId = companyMap["TBR"];
    const lscId = companyMap["LSC"];
    const fspId = companyMap["FSP"];

    // --- Vendors ---
    const vendorData = [
      { name: "E1 Series (Licensing)", type: "production_partner", entities: [tbrId], terms: "Net 30" },
      { name: "Wavecast Productions", type: "production_partner", entities: [tbrId], terms: "Net 45" },
      { name: "Marina Bay Venue", type: "venue", entities: [tbrId], terms: "50% deposit" },
      { name: "Jeddah Corniche Circuit", type: "venue", entities: [tbrId], terms: "60% deposit" },
      { name: "FreshPrep Catering", type: "catering", entities: [tbrId], terms: "Net 15" },
      { name: "Google Workspace", type: "saas", entities: [lscId], terms: "Annual" },
      { name: "Vercel Inc.", type: "saas", entities: [lscId], terms: "Monthly" },
      { name: "Neon Database", type: "saas", entities: [lscId], terms: "Monthly" },
      { name: "Figma", type: "saas", entities: [fspId, lscId], terms: "Annual" },
      { name: "Slack", type: "saas", entities: [lscId], terms: "Monthly" },
      { name: "QuickBooks", type: "saas", entities: [lscId], terms: "Monthly" },
      { name: "Notion", type: "saas", entities: [lscId, fspId], terms: "Annual" },
      { name: "BoatWorks Equipment Co.", type: "equipment", entities: [tbrId], terms: "Net 30" },
      { name: "Apex Legal Advisors", type: "legal", entities: [lscId, tbrId], terms: "Net 30" },
      { name: "TravelStar Agency", type: "travel", entities: [tbrId], terms: "Prepaid" }
    ];

    for (const v of vendorData) {
      const existing = await client.query(`select id from vendors where name = $1`, [v.name]);
      let vendorId = existing.rows[0]?.id;
      if (!vendorId) {
        const res = await client.query(
          `insert into vendors (name, vendor_type, payment_terms) values ($1, $2::vendor_type, $3) returning id`,
          [v.name, v.type, v.terms]
        );
        vendorId = res.rows[0].id;
      }
      for (const entityId of v.entities) {
        await client.query(
          `insert into vendor_entity_links (vendor_id, company_id)
           values ($1, $2)
           on conflict (vendor_id, company_id) do nothing`,
          [vendorId, entityId]
        );
      }
    }
    console.log(`Seeded ${vendorData.length} vendors.`);

    // --- Subscriptions ---
    const subData = [
      { name: "Google Workspace", provider: "Google", co: lscId, shared: true, monthly: 72, annual: 864, cycle: "monthly", cat: "communication", nextBill: "2026-05-01" },
      { name: "Vercel Pro", provider: "Vercel Inc.", co: lscId, shared: true, monthly: 20, annual: 240, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "Neon Database", provider: "Neon", co: lscId, shared: true, monthly: 69, annual: 828, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "Figma Team", provider: "Figma", co: fspId, shared: true, monthly: 45, annual: 540, cycle: "monthly", cat: "design", nextBill: "2026-05-01" },
      { name: "Slack Business+", provider: "Slack", co: lscId, shared: true, monthly: 62.50, annual: 750, cycle: "monthly", cat: "communication", nextBill: "2026-05-01" },
      { name: "QuickBooks Online", provider: "Intuit", co: lscId, shared: false, monthly: 80, annual: 960, cycle: "monthly", cat: "finance", nextBill: "2026-05-01" },
      { name: "Notion Team", provider: "Notion", co: lscId, shared: true, monthly: 40, annual: 480, cycle: "monthly", cat: "communication", nextBill: "2026-05-01" },
      { name: "GitHub Team", provider: "GitHub", co: lscId, shared: true, monthly: 19, annual: 228, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "Linear", provider: "Linear", co: lscId, shared: true, monthly: 32, annual: 384, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "Anthropic API", provider: "Anthropic", co: lscId, shared: true, monthly: 150, annual: 1800, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "AWS S3", provider: "Amazon", co: lscId, shared: true, monthly: 25, annual: 300, cycle: "monthly", cat: "infrastructure", nextBill: "2026-05-01" },
      { name: "Gemini API", provider: "Google", co: lscId, shared: true, monthly: 50, annual: 600, cycle: "monthly", cat: "analytics", nextBill: "2026-05-01" }
    ];

    for (const s of subData) {
      const existing = await client.query(`select id from subscriptions where name = $1 and company_id = $2`, [s.name, s.co]);
      if (!existing.rows[0]) {
        await client.query(
          `insert into subscriptions (name, provider, company_id, is_shared, monthly_cost, annual_cost, billing_cycle, category, next_billing_date)
           values ($1, $2, $3, $4, $5, $6, $7::billing_cycle, $8::subscription_category, $9::date)`,
          [s.name, s.provider, s.co, s.shared, s.monthly, s.annual, s.cycle, s.cat, s.nextBill]
        );
      }
    }
    console.log(`Seeded ${subData.length} subscriptions.`);

    // --- Gig Workers ---
    const gigWorkers = [
      { name: "Raj Patel", loc: "Mumbai, India", cc: "IN", role: "Content Moderator", method: "upi", freq: "monthly", rate: 25000, cur: "INR", tax: 0.10 },
      { name: "Priya Sharma", loc: "Delhi, India", cc: "IN", role: "Data Analyst", method: "bank_transfer", freq: "monthly", rate: 40000, cur: "INR", tax: 0.10 },
      { name: "Amit Kumar", loc: "Bangalore, India", cc: "IN", role: "Backend Developer", method: "bank_transfer", freq: "bi_weekly", rate: 60000, cur: "INR", tax: 0.10 },
      { name: "David Ochieng", loc: "Nairobi, Kenya", cc: "KE", role: "Field Agent", method: "mobile_money", freq: "weekly", rate: 45000, cur: "KES", tax: 0.05 },
      { name: "Grace Wanjiku", loc: "Mombasa, Kenya", cc: "KE", role: "Community Manager", method: "mobile_money", freq: "monthly", rate: 55000, cur: "KES", tax: 0.05 },
      { name: "Sanjay Reddy", loc: "Hyderabad, India", cc: "IN", role: "QA Tester", method: "upi", freq: "per_task", rate: 1500, cur: "INR", tax: 0.10 }
    ];

    for (const w of gigWorkers) {
      const existing = await client.query(`select id from gig_workers where name = $1 and company_id = $2`, [w.name, xtzId]);
      if (!existing.rows[0]) {
        await client.query(
          `insert into gig_workers (company_id, name, location, country_code, role_type, payment_method, payment_frequency, rate_amount, rate_currency, tax_withholding_rate)
           values ($1, $2, $3, $4, $5, $6::gig_payment_method, $7::gig_payment_frequency, $8, $9, $10)`,
          [xtzId, w.name, w.loc, w.cc, w.role, w.method, w.freq, w.rate, w.cur, w.tax]
        );
      }
    }
    console.log(`Seeded ${gigWorkers.length} gig workers.`);

    // --- Cap Table ---
    const capEntries = [
      { co: lscId, holder: "Anuj Kumar Singh", type: "founder", cls: "common", shares: 5000000, vested: 5000000, price: 0.001 },
      { co: lscId, holder: "Co-Founder 2", type: "founder", cls: "common", shares: 3000000, vested: 3000000, price: 0.001 },
      { co: lscId, holder: "ESOP Pool", type: "pool", cls: "esop_pool", shares: 1500000, vested: 0, price: 0 },
      { co: lscId, holder: "Angel Investor A", type: "investor", cls: "preferred_a", shares: 500000, vested: 500000, price: 1.00 },
      { co: lscId, holder: "Saurav (Advisor)", type: "advisor", cls: "esop_pool", shares: 100000, vested: 25000, price: 0, vestStart: "2026-01-01", vestEnd: "2030-01-01", cliff: 12, total: 48, ref: "Saurav Share Grant Agreement" }
    ];

    for (const e of capEntries) {
      const existing = await client.query(`select id from cap_table_entries where company_id = $1 and holder_name = $2`, [e.co, e.holder]);
      if (!existing.rows[0]) {
        await client.query(
          `insert into cap_table_entries (company_id, holder_name, holder_type, share_class, shares_held, shares_vested, exercise_price, vesting_start_date, vesting_end_date, vesting_cliff_months, vesting_total_months, agreement_reference)
           values ($1, $2, $3, $4::share_class, $5, $6, $7, $8::date, $9::date, $10, $11, $12)`,
          [e.co, e.holder, e.type, e.cls, e.shares, e.vested, e.price, e.vestStart ?? null, e.vestEnd ?? null, e.cliff ?? null, e.total ?? null, e.ref ?? null]
        );
      }
    }
    console.log(`Seeded ${capEntries.length} cap table entries.`);

    // --- Litigation costs ---
    const litigationData = [
      { co: lscId, ref: "CASE-2026-001", name: "IP Dispute — TBR Branding", cost_type: "counsel_fees", amount: 35000, desc: "Outside counsel retainer" },
      { co: lscId, ref: "CASE-2026-001", name: "IP Dispute — TBR Branding", cost_type: "filing_fees", amount: 2500, desc: "Court filing" },
      { co: tbrId, ref: "CASE-2026-002", name: "Venue Damage Claim — Doha", cost_type: "settlement", amount: 15000, desc: "Foil damage settlement" },
      { co: lscId, ref: "CASE-2026-003", name: "Employment Dispute", cost_type: "counsel_fees", amount: 12000, desc: "Employment law counsel" }
    ];

    for (const l of litigationData) {
      await client.query(
        `insert into litigation_costs (company_id, case_reference, case_name, cost_type, amount, description)
         values ($1, $2, $3, $4::litigation_cost_type, $5, $6)`,
        [l.co, l.ref, l.name, l.cost_type, l.amount, l.desc]
      );
    }

    // Litigation reserves
    const reserveData = [
      { co: lscId, ref: "CASE-2026-001", name: "IP Dispute — TBR Branding", exposure: 250000, reserve: 100000, insurance: 75000 },
      { co: tbrId, ref: "CASE-2026-002", name: "Venue Damage Claim — Doha", exposure: 50000, reserve: 20000, insurance: 0 },
      { co: lscId, ref: "CASE-2026-003", name: "Employment Dispute", exposure: 80000, reserve: 40000, insurance: 0 }
    ];

    for (const r of reserveData) {
      const existing = await client.query(`select id from litigation_reserves where case_reference = $1 and company_id = $2`, [r.ref, r.co]);
      if (!existing.rows[0]) {
        await client.query(
          `insert into litigation_reserves (company_id, case_reference, case_name, estimated_exposure, reserve_amount, insurance_coverage)
           values ($1, $2, $3, $4, $5, $6)`,
          [r.co, r.ref, r.name, r.exposure, r.reserve, r.insurance]
        );
      }
    }
    console.log("Seeded litigation data.");

    // --- SP Multiplier (FSP) ---
    const existingSp = await client.query(`select id from sp_multipliers where company_id = $1`, [fspId]);
    if (!existingSp.rows[0]) {
      await client.query(
        `insert into sp_multipliers (company_id, multiplier_ratio, trigger_threshold, notes)
         values ($1, 1.5, 100000, 'Default SP multiplier for FSP launch')`,
        [fspId]
      );
    }
    console.log("Seeded SP multiplier config.");

    await client.query("commit");
    console.log("Finance V2 seed complete.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
