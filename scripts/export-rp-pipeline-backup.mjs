import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_REF = "ssnqervwthlqvbewhtrd";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
}
if (!new URL(url).hostname.startsWith(`${EXPECTED_PROJECT_REF}.`)) {
  throw new Error(`Projet Supabase inattendu : ${new URL(url).hostname}`);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const tableNames = [
  "ai_event_requests",
  "state_action_types",
  "discord_dispatch_types",
  "discord_dispatch_templates",
  "discord_dispatch_snippet_pools",
  "discord_region_channels",
];

const tables = {};
for (const table of tableNames) {
  tables[table] = await readAll(table);
}

const { data: ruleParameters, error: rulesError } = await supabase
  .from("rule_parameters")
  .select("*")
  .in("key", [
    "ai_events_config",
    "ai_events_last_run",
    "process_due_edge_enabled",
  ])
  .order("key");
if (rulesError) throw new Error(`rule_parameters: ${rulesError.message}`);

const createdAt = new Date();
const backup = {
  format: "fon-rp-pipeline-backup-v1",
  project_ref: EXPECTED_PROJECT_REF,
  created_at: createdAt.toISOString(),
  tables,
  rule_parameters: ruleParameters ?? [],
};
const directory = path.resolve("artifacts", "rp-pipeline-backups");
const filename = `legacy-${createdAt.toISOString().replaceAll(":", "-")}.json`;
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, filename), `${JSON.stringify(backup, null, 2)}\n`, "utf8");

console.log(path.join(directory, filename));
for (const [table, rows] of Object.entries(tables)) {
  console.log(`${table}: ${rows.length}`);
}
