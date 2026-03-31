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
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN or DATABASE_URL must be set before seeding tranches.");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");

    // Get TBR company
    const companyRes = await client.query(`select id from companies where code = 'TBR'::company_code`);
    const companyId = companyRes.rows[0]?.id;
    if (!companyId) throw new Error("TBR company not found.");

    // Get existing contracts with sponsors
    const contractRes = await client.query(
      `select c.id, c.contract_name, c.contract_value, c.sponsor_or_customer_id, c.start_date,
              sc.name as sponsor_name
       from contracts c
       join sponsors_or_customers sc on sc.id = c.sponsor_or_customer_id
       where c.company_id = $1
       order by c.contract_value desc nulls last
       limit 5`,
      [companyId]
    );

    if (contractRes.rows.length === 0) {
      console.log("No contracts found for TBR — creating sample contracts and sponsors first.");

      // Create sample sponsors
      const sponsorIds = [];
      const sponsorNames = ["Apex Racing Partners", "BlueWave Capital", "NovaTech Industries", "Global Motors Corp"];
      for (const name of sponsorNames) {
        const existing = await client.query(
          `select id from sponsors_or_customers where name = $1 and company_id = $2`,
          [name, companyId]
        );
        if (existing.rows[0]) {
          sponsorIds.push(existing.rows[0].id);
        } else {
          const res = await client.query(
            `insert into sponsors_or_customers (company_id, name, entity_type)
             values ($1, $2, 'sponsor') returning id`,
            [companyId, name]
          );
          sponsorIds.push(res.rows[0].id);
        }
      }

      // Create sample contracts
      const contracts = [
        { name: "S4 Title Sponsorship", value: 2500000, sponsorIdx: 0, start: "2026-01-15" },
        { name: "S4 Technical Partnership", value: 800000, sponsorIdx: 1, start: "2026-02-01" },
        { name: "S4 Broadcast Sponsorship", value: 1200000, sponsorIdx: 2, start: "2026-01-20" },
        { name: "S4 Trackside Branding", value: 450000, sponsorIdx: 3, start: "2026-03-01" }
      ];

      contractRes.rows.length = 0;
      for (const c of contracts) {
        const res = await client.query(
          `insert into contracts (
             company_id, sponsor_or_customer_id, contract_name,
             contract_value, currency_code, start_date, end_date, contract_status
           ) values ($1, $2, $3, $4, 'USD', $5::date, ($5::date + interval '1 year')::date, 'active')
           returning id, contract_name, contract_value, sponsor_or_customer_id, start_date`,
          [companyId, sponsorIds[c.sponsorIdx], c.name, c.value, c.start]
        );
        contractRes.rows.push({ ...res.rows[0], sponsor_name: contracts[contractRes.rows.length - 1]?.name ?? c.name });
      }
    }

    // Get race events for event-linked triggers
    const raceRes = await client.query(
      `select id, name, event_start_date, event_end_date
       from race_events
       where company_id = $1 and event_start_date is not null
       order by event_start_date
       limit 8`,
      [companyId]
    );
    const races = raceRes.rows;

    // Clear any existing seeded tranches (idempotent)
    for (const contract of contractRes.rows) {
      await client.query(`delete from contract_tranches where contract_id = $1`, [contract.id]);
    }

    let totalCreated = 0;

    for (let ci = 0; ci < contractRes.rows.length; ci++) {
      const contract = contractRes.rows[ci];
      const contractValue = Number(contract.contract_value);
      const sponsorId = contract.sponsor_or_customer_id;

      // Each contract gets a different tranche pattern
      let tranches;
      if (ci === 0) {
        // Title Sponsorship: 4 tranches — on_signing + 3 event-linked
        tranches = [
          { label: "Signing bonus", pct: 25, trigger: "on_signing", raceId: null, date: null, offset: 0, status: "collected" },
          { label: "Pre-season activation", pct: 25, trigger: "on_date", raceId: null, date: "2026-03-01", offset: 0, status: "invoiced" },
          { label: "Mid-season milestone", pct: 25, trigger: races[3] ? "post_event" : "on_date", raceId: races[3]?.id ?? null, date: races[3] ? null : "2026-06-15", offset: 7, status: "active" },
          { label: "Season finale", pct: 25, trigger: races[7] ? "post_event" : "on_date", raceId: races[7]?.id ?? null, date: races[7] ? null : "2026-10-30", offset: 14, status: "scheduled" }
        ];
      } else if (ci === 1) {
        // Technical Partnership: 3 equal tranches — quarterly dates
        tranches = [
          { label: "Q1 delivery", pct: 33.33, trigger: "on_date", raceId: null, date: "2026-03-31", offset: 0, status: "invoiced" },
          { label: "Q2 delivery", pct: 33.33, trigger: "on_date", raceId: null, date: "2026-06-30", offset: 0, status: "scheduled" },
          { label: "Q3 final delivery", pct: 33.34, trigger: "on_date", raceId: null, date: "2026-09-30", offset: 0, status: "scheduled" }
        ];
      } else if (ci === 2) {
        // Broadcast Sponsorship: 5 event-linked tranches
        const eventIndices = [0, 1, 3, 5, 7];
        tranches = eventIndices.map((rIdx, i) => ({
          label: `Broadcast ${i + 1} — ${races[rIdx]?.name ?? `Race ${rIdx + 1}`}`,
          pct: 20,
          trigger: races[rIdx] ? "pre_event" : "on_date",
          raceId: races[rIdx]?.id ?? null,
          date: races[rIdx] ? null : `2026-0${(i + 2) > 9 ? "" : ""}${i + 2}-15`,
          offset: -3,
          status: i === 0 ? "collected" : i === 1 ? "invoiced" : i === 2 ? "active" : "scheduled"
        }));
      } else {
        // Trackside Branding: 2 tranches — 50/50 signing + mid-season
        tranches = [
          { label: "Upfront payment", pct: 50, trigger: "on_signing", raceId: null, date: null, offset: 0, status: "invoiced" },
          { label: "Mid-season payment", pct: 50, trigger: races[4] ? "post_event" : "on_date", raceId: races[4]?.id ?? null, date: races[4] ? null : "2026-07-01", offset: 5, status: "scheduled" }
        ];
      }

      for (let ti = 0; ti < tranches.length; ti++) {
        const t = tranches[ti];
        const amount = Number((contractValue * t.pct / 100).toFixed(2));

        const statusFields = {};
        if (t.status === "active" || t.status === "invoiced" || t.status === "collected") {
          statusFields.activated_at = "now() - interval '30 days'";
        }
        if (t.status === "invoiced" || t.status === "collected") {
          statusFields.invoiced_at = "now() - interval '15 days'";
        }
        if (t.status === "collected") {
          statusFields.collected_at = "now() - interval '5 days'";
        }

        // For invoiced/collected tranches, create a linked invoice
        let linkedInvoiceId = null;
        if (t.status === "invoiced" || t.status === "collected") {
          const invRes = await client.query(
            `insert into invoices (
               company_id, contract_id, sponsor_or_customer_id,
               direction, invoice_number, invoice_status,
               issue_date, due_date, currency_code, total_amount, notes
             ) values (
               $1, $2, $3, 'receivable',
               'TR-SEED-' || left($4::text, 8) || '-' || $5,
               $6,
               current_date - 15, current_date + 15, 'USD', $7,
               'Seeded tranche invoice — ' || $8
             ) returning id`,
            [
              companyId,
              contract.id,
              sponsorId,
              contract.id,
              ti + 1,
              t.status === "collected" ? "paid" : "issued",
              amount,
              t.label
            ]
          );
          linkedInvoiceId = invRes.rows[0]?.id;
        }

        await client.query(
          `insert into contract_tranches (
             contract_id, company_id, sponsor_or_customer_id,
             tranche_number, tranche_label, tranche_percentage, tranche_amount,
             trigger_type, trigger_race_event_id, trigger_date, trigger_offset_days,
             tranche_status, linked_invoice_id,
             activated_at, invoiced_at, collected_at,
             notes
           ) values (
             $1, $2, $3, $4, $5, $6, $7,
             $8::tranche_trigger_type, $9, $10::date, $11,
             $12::tranche_status, $13,
             ${t.status === "active" || t.status === "invoiced" || t.status === "collected" ? "now() - interval '30 days'" : "null"},
             ${t.status === "invoiced" || t.status === "collected" ? "now() - interval '15 days'" : "null"},
             ${t.status === "collected" ? "now() - interval '5 days'" : "null"},
             'Seeded sample tranche'
           )`,
          [
            contract.id,
            companyId,
            sponsorId,
            ti + 1,
            t.label,
            t.pct,
            amount,
            t.trigger,
            t.raceId,
            t.date,
            t.offset,
            t.status,
            linkedInvoiceId
          ]
        );

        totalCreated++;
      }
    }

    await client.query("commit");
    console.log(`Seeded ${totalCreated} contract tranches across ${contractRes.rows.length} contracts.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
