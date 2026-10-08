/**
 * Apply supabase/migrations/*.sql to the database named by SUPABASE_DB_URL, then check the result.
 *
 *   npx tsx --env-file=.env scripts/db-migrate.mts
 *
 * The connection string is read from the environment and never printed. The migrations are idempotent, so
 * running this twice is safe. Needs `pg` (npm i --no-save pg).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env (Supabase > Connect > Connection string > URI).");
  process.exit(1);
}

const dir = path.resolve(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.error(`Could not connect: ${(e as Error).message}`);
  console.error("If this says ENOTFOUND or ETIMEDOUT on db.<ref>.supabase.co, your network may lack IPv6: use the Session pooler string instead.");
  process.exit(1);
}

try {
  for (const f of files) {
    process.stdout.write(`applying ${f} ... `);
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, f), "utf8"));
      await client.query("commit");
      console.log("ok");
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw e;
    }
  }

  // Verify: every table exists with RLS on, browsers have no write policies, the functions exist.
  const tables = ["profiles", "progress", "saves", "ai_usage", "feedback", "counters", "rate_limits"];
  const rls = await client.query("select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = any($1)", [tables]);
  const policies = await client.query("select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename");
  const fns = await client.query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = any($1)", [["rate_limit_hit", "ai_usage_add", "ai_spend", "counter_bump", "admin_users", "progress_by_user_section", "handle_new_user"]]);
  const trigger = await client.query("select 1 from pg_trigger where tgname = 'on_auth_user_created'");

  console.log("\nTables (RLS on?):");
  for (const t of tables) console.log(`  ${t.padEnd(12)} ${rls.rows.find((r) => r.tablename === t)?.rowsecurity ? "RLS on" : rls.rows.some((r) => r.tablename === t) ? "RLS OFF  <-- problem" : "MISSING  <-- problem"}`);
  console.log("\nPolicies (should be SELECT only, for authenticated):");
  for (const p of policies.rows) console.log(`  ${p.tablename}: ${p.policyname} [${p.cmd}] ${p.roles}`);
  const writes = policies.rows.filter((p) => p.cmd !== "SELECT");
  console.log(`\nFunctions: ${fns.rows.length}/7 ${fns.rows.length === 7 ? "ok" : "<-- problem"}`);
  console.log(`New-user trigger: ${trigger.rowCount ? "ok" : "MISSING <-- problem"}`);
  console.log(`Write policies for browsers: ${writes.length === 0 ? "none (correct)" : `${writes.length} <-- problem`}`);
} finally {
  await client.end();
}
