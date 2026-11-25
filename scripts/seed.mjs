#!/usr/bin/env node
/**
 * Demo-data seeder — for screenshots, docs and local experimentation ONLY.
 *
 * It WIPES every row in the ledger / budget / goal tables and replaces them
 * with a deterministic, realistic-looking set of accounts, movements, budget
 * entries (with sub-incomes), categories and savings goals that exercises every
 * feature of the app:
 *
 *   - accounts (active + one archived) with balances trending over ~19 months
 *   - deposits, withdrawals and signed adjustments (so "profit" is non-zero)
 *   - a 12-month expense budget: income w/ sub-incomes, expenses by category,
 *     "other" spending, plus one archived category
 *   - active savings goals at mixed account weights + one completed goal
 *
 * The real ledger is user financial data: keep a copy before running this.
 * Nothing here touches the network.
 *
 * Usage:
 *   node scripts/seed.mjs                  # seed data/numina.db
 *   node scripts/seed.mjs --db ./demo.db   # seed another file
 *   node scripts/seed.mjs --force          # required if the DB already has data
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const USAGE = `Usage: node scripts/seed.mjs [--db <path>] [--force]

  --db <path>   database file to seed (default: data/numina.db)
  --force       overwrite when the database already has accounts

Wipes the ledger/budget/goal tables and writes demo data for screenshots.`;

// --- arguments -------------------------------------------------------------

let dbPath = null;
let force = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--force" || arg === "-f") force = true;
  else if (arg === "--db") dbPath = argv[++i];
  else if (arg.startsWith("--db=")) dbPath = arg.slice("--db=".length);
  else if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}\n\n${USAGE}`);
    process.exit(1);
  }
}
if (dbPath === undefined || dbPath === null) {
  dbPath = path.join(projectRoot, "data", "numina.db");
} else {
  dbPath = path.resolve(process.cwd(), dbPath);
}

// --- schema (single source of truth: src/lib/db/index.ts) -------------------

const indexSrc = readFileSync(path.join(projectRoot, "src", "lib", "db", "index.ts"), "utf8");
const schemaMatch = indexSrc.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/);
if (!schemaMatch) {
  console.error("Could not find SCHEMA_SQL in src/lib/db/index.ts — aborting.");
  process.exit(1);
}
const SCHEMA_SQL = schemaMatch[1];

// --- deterministic randomness ----------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x5eed2026);
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1));
const randStep = (min, max, step) => min + Math.round((rng() * (max - min)) / step) * step;
const dollars = (amount) => Math.round(amount * 100);

// --- open the database ------------------------------------------------------

mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(SCHEMA_SQL);

const existing = db.prepare("SELECT COUNT(*) AS n FROM accounts").get().n;
if (existing > 0 && !force) {
  console.error(
    `Refusing to overwrite ${dbPath}: it already contains ${existing} account(s).\n` +
      "Back the file up, then re-run with --force to replace its data with demo data."
  );
  process.exit(1);
}

// --- wipe -------------------------------------------------------------------

db.transaction(() => {
  for (const table of [
    "savings_goal_accounts",
    "savings_goals",
    "budget_entry_items",
    "budget_entries",
    "budget_categories",
    "movements",
    "accounts",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
})();

// --- prepared statements ----------------------------------------------------

const nowIso = new Date().toISOString();
const insertCategory = db.prepare(
  `INSERT INTO budget_categories (id, kind, name, color, sort_order, archived, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertAccount = db.prepare(
  `INSERT INTO accounts (id, name, color, sort_order, archived, created_at) VALUES (?, ?, ?, ?, ?, ?)`
);
const insertMovement = db.prepare(
  `INSERT INTO movements (id, account_id, date, type, amount_cents, note, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertEntry = db.prepare(
  `INSERT INTO budget_entries (id, kind, category_id, date, amount_cents, note, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertItem = db.prepare(
  `INSERT INTO budget_entry_items (id, entry_id, date, note, amount_cents, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertGoal = db.prepare(
  `INSERT INTO savings_goals (id, name, target_cents, color, sort_order, completed, completed_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertAllocation = db.prepare(
  `INSERT INTO savings_goal_accounts (goal_id, account_id, weight) VALUES (?, ?, ?)`
);

// --- calendar helpers -------------------------------------------------------

const now = new Date();
const MONTH_COUNT = 19; // ~19 months of ledger history, ending this month
const months = [];
for (let i = MONTH_COUNT - 1; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
}
const periodOf = (m) => `${m.year}-${String(m.month).padStart(2, "0")}`;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const dateOf = (m, day) =>
  `${periodOf(m)}-${String(Math.min(day, daysInMonth(m.year, m.month))).padStart(2, "0")}`;

// --- accounts ---------------------------------------------------------------

const accountDefs = [
  { key: "checking", name: "Everyday Checking", color: "#4f46e5" },
  { key: "savings", name: "High-Yield Savings", color: "#10b981" },
  { key: "fund", name: "Index Fund", color: "#8b5cf6" },
  { key: "emergency", name: "Emergency Fund", color: "#f59e0b" },
  { key: "cash", name: "Cash", color: "#06b6d4" },
  { key: "old", name: "Old Brokerage", color: "#64748b", archived: true },
];
const accountId = {};
const running = {};
accountDefs.forEach((def, i) => {
  accountId[def.key] = randomUUID();
  running[def.key] = 0;
  insertAccount.run(accountId[def.key], def.name, def.color, i, def.archived ? 1 : 0, nowIso);
});

// --- movements --------------------------------------------------------------

function move(key, date, type, amountDollars, note = "") {
  let signed;
  const magnitude = Math.round(Math.abs(amountDollars) * 100);
  if (type === "deposit") signed = magnitude;
  else if (type === "withdraw") signed = -magnitude;
  else signed = Math.round(amountDollars * 100); // adjustment: signed as given

  insertMovement.run(randomUUID(), accountId[key], date, type, signed, note, nowIso);
  running[key] += signed;
}

months.forEach((m, i) => {
  // Steady monthly saving across the three long-term accounts.
  move("savings", dateOf(m, 3), "deposit", randStep(500, 900, 50), "Monthly transfer");
  if (i % 3 === 2) move("savings", dateOf(m, 28), "adjustment", randStep(6, 40, 1), "Interest");

  move("fund", dateOf(m, 5), "deposit", randStep(1000, 1400, 50), "Auto-invest");
  if (i % 3 === 1) move("fund", dateOf(m, 26), "adjustment", randStep(120, 480, 10), "Market gain");

  move("emergency", dateOf(m, 7), "deposit", randStep(250, 400, 25), "Auto-save");

  // A little noise in checking and cash so their charts aren't flat.
  if (i % 2 === 0) move("checking", dateOf(m, 14), "withdraw", randStep(40, 220, 10), "Card purchase");
  else move("checking", dateOf(m, 14), "deposit", randStep(60, 180, 10), "Refund");

  if (i % 3 === 0) move("cash", dateOf(m, 18), "withdraw", randStep(20, 90, 10), "Cash out");
  else if (i % 5 === 2) move("cash", dateOf(m, 18), "deposit", randStep(60, 180, 10), "Sold an item");
});
move("cash", dateOf(months[0], 2), "deposit", 400, "Starting cash");

// One-off, story-shaped movements.
move("checking", dateOf(months[0], 1), "deposit", 2500, "Opening balance");
move("checking", dateOf(months[9], 25), "adjustment", -18, "Bank fee");
move("checking", dateOf(months[15], 25), "adjustment", 45, "Reimbursement");
move("savings", dateOf(months[2], 21), "deposit", 500, "Tax refund");
move("savings", dateOf(months[5], 16), "withdraw", 1200, "Car repair");
move("savings", dateOf(months[14], 9), "withdraw", 650, "Flight tickets");
move("fund", dateOf(months[4], 22), "adjustment", -380, "Market dip");
move("fund", dateOf(months[11], 22), "adjustment", -210, "Market dip");
move("fund", dateOf(months[16], 19), "deposit", 1500, "Year-end top-up");
move("emergency", dateOf(months[8], 11), "adjustment", 120, "Rounding");
move("old", dateOf(months[0], 12), "deposit", 2000, "Opening balance");
move("old", dateOf(months[3], 12), "withdraw", 800, "Transfer out");
move("old", dateOf(months[6], 12), "adjustment", 90, "Dividend");

// --- budget categories ------------------------------------------------------

const expenseCats = [
  ["Rent", "#f97316"],
  ["Power", "#f59e0b"],
  ["Gas", "#ec4899"],
  ["Water", "#06b6d4"],
  ["Internet", "#8b5cf6"],
  ["Groceries", "#10b981"],
  ["Transport", "#3b82f6"],
  ["Insurance", "#14b8a6"],
  ["Health", "#ef4444"],
  ["Gym", "#22c55e"],
];
const otherCats = [
  ["Coffee", "#84cc16"],
  ["Clothes", "#ec4899"],
  ["Tech", "#4f46e5"],
  ["Fun", "#f59e0b"],
  ["Books", "#8b5cf6"],
  ["Travel", "#0ea5e9"],
];
const categoryId = {};
expenseCats.forEach(([name, color], i) => {
  categoryId[name] = randomUUID();
  insertCategory.run(categoryId[name], "expense", name, color, i, name === "Gym" ? 1 : 0, nowIso);
});
otherCats.forEach(([name, color], i) => {
  categoryId[name] = randomUUID();
  insertCategory.run(categoryId[name], "other", name, color, i, 0, nowIso);
});

// --- budget entries (12 months, newest is the current month) ----------------

function income(date, note, amountDollars, items = []) {
  const id = randomUUID();
  insertEntry.run(id, "income", null, date, dollars(amountDollars), note, nowIso);
  for (const item of items) insertItem.run(randomUUID(), id, item.date, item.note, dollars(item.amount), nowIso);
  return id;
}
const expense = (cat, date, amountDollars, note = "") =>
  insertEntry.run(randomUUID(), "expense", categoryId[cat], date, dollars(amountDollars), note, nowIso);
const other = (cat, date, amountDollars, note = "") =>
  insertEntry.run(randomUUID(), "other", categoryId[cat], date, dollars(amountDollars), note, nowIso);

const subIncomeNotes = ["Sold sneakers", "Weekend gig", "Etsy sales", "Consulting call", "Sold a bike", "Tutoring"];

const entryMonths = months.slice(-13);
entryMonths.forEach((m, idx) => {
  const isCurrent = idx === entryMonths.length - 1;

  // Income
  if (isCurrent) {
    income(dateOf(m, 1), "Salary", 5200, [{ date: dateOf(m, 15), note: "Q4 bonus", amount: 600 }]);
    income(dateOf(m, 10), "Freelance", 0, [
      { date: dateOf(m, 12), note: "Sold old camera", amount: 320 },
      { date: dateOf(m, 20), note: "Logo design project", amount: 850 },
    ]);
  } else {
    income(dateOf(m, 1), "Salary", 5200);
    if (idx % 2 === 0) {
      const items = [];
      if (rng() < 0.6) {
        items.push({
          date: dateOf(m, 24),
          note: subIncomeNotes[randInt(0, subIncomeNotes.length - 1)],
          amount: randStep(80, 300, 10),
        });
      }
      income(dateOf(m, 12), "Freelance", randStep(150, 450, 10), items);
    }
  }
  if (idx % 3 === 0) income(dateOf(m, 20), "Dividends", randStep(60, 180, 5));

  // Expenses by category
  expense("Rent", dateOf(m, 2), 1750, "Monthly rent");
  expense("Power", dateOf(m, 8), randStep(70, 120, 1));
  expense("Gas", dateOf(m, 8), randStep(30, 60, 1));
  expense("Water", dateOf(m, 8), 35);
  expense("Internet", dateOf(m, 8), 70);
  expense("Groceries", dateOf(m, 6), randStep(240, 320, 10));
  expense("Groceries", dateOf(m, 20), randStep(200, 300, 10));
  expense("Transport", dateOf(m, 12), randStep(120, 200, 10), "Fuel & transit");
  expense("Insurance", dateOf(m, 15), 150, "Health insurance");
  if (idx >= 8) expense("Gym", dateOf(m, 18), 45, "Gym");
  if (idx % 4 === 0) expense("Health", dateOf(m, 17), randStep(40, 160, 10), "Pharmacy");

  // Other spending
  other("Coffee", dateOf(m, 10), randStep(25, 55, 1), "Coffee beans");
  other("Fun", dateOf(m, 22), randStep(30, 90, 5), "Night out");
  if (idx % 3 === 1) other("Books", dateOf(m, 16), randStep(15, 45, 5), "Paperback");
  if (idx % 5 === 2) other("Clothes", dateOf(m, 14), randStep(60, 180, 10), "New shirt");
  if (idx % 4 === 3) other("Tech", dateOf(m, 19), randStep(80, 400, 10), "Gadget");
  if (idx % 5 === 0) other("Travel", dateOf(m, 23), randStep(300, 900, 50), "Weekend away");
});

// --- savings goals ----------------------------------------------------------

const roundTo = (cents, unit) => Math.max(unit, Math.round(cents / unit) * unit);
const targetFor = (saved, progress) => roundTo(saved / progress, 100_00); // nearest $100

const weightedSaved = (allocations) =>
  allocations.reduce((sum, [key, weight]) => sum + Math.round(running[key] * (weight / 100)), 0);

const activeGoals = [
  {
    name: "Home Down Payment",
    color: "#6366f1",
    allocations: [["savings", 100], ["fund", 30]],
    progress: 0.58,
  },
  {
    name: "Wedding Fund",
    color: "#ec4899",
    allocations: [["savings", 50], ["fund", 20]],
    progress: 0.63,
  },
  {
    name: "Trip to Japan",
    color: "#f97316",
    allocations: [["cash", 100], ["savings", 20]],
    progress: 0.7,
  },
  {
    name: "New MacBook",
    color: "#8b5cf6",
    allocations: [["emergency", 20]],
    progress: 0.55,
  },
];

let sortOrder = 0;
for (const goal of activeGoals) {
  const saved = weightedSaved(goal.allocations);
  const goalId = randomUUID();
  insertGoal.run(goalId, goal.name, targetFor(saved, goal.progress), goal.color, sortOrder++, 0, null, nowIso);
  for (const [key, weight] of goal.allocations) insertAllocation.run(goalId, accountId[key], weight);
}

// One already-completed goal (soft-archived, restorable in the UI).
const completedGoalId = randomUUID();
insertGoal.run(
  completedGoalId,
  "Emergency Fund Goal",
  roundTo(running.emergency * 0.9, 100_00),
  "#f59e0b",
  sortOrder++,
  1,
  dateOf(months[months.length - 3], 5) + "T09:00:00.000Z",
  nowIso
);
insertAllocation.run(completedGoalId, accountId.emergency, 100);

// --- checkpoint + summary ---------------------------------------------------

try {
  db.pragma("wal_checkpoint(TRUNCATE)");
} catch {
  // A running server may hold a reader; the WAL just keeps the data until it's ready.
}

const summary = db
  .prepare(
    `SELECT a.name, a.archived, COALESCE(SUM(m.amount_cents), 0) AS balance
     FROM accounts a LEFT JOIN movements m ON m.account_id = a.id
     GROUP BY a.id ORDER BY a.archived, a.sort_order`
  )
  .all();
const counts = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM movements) AS movements,
            (SELECT COUNT(*) FROM budget_entries) AS entries,
            (SELECT COUNT(*) FROM budget_entry_items) AS items,
            (SELECT COUNT(*) FROM savings_goals) AS goals`
  )
  .get();

const fmt = (cents) =>
  (cents < 0 ? "-$" : "$") +
  (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`Seeded demo data into ${dbPath}\n`);
console.log("Accounts:");
for (const row of summary) {
  console.log(`  ${row.archived ? "(hidden) " : "         "}${row.name.padEnd(20)} ${fmt(row.balance)}`);
}
const total = summary.filter((r) => !r.archived).reduce((sum, r) => sum + r.balance, 0);
console.log(`  ${"Total net worth".padEnd(30)} ${fmt(total)}`);
console.log(
  `\n${counts.movements} movements · ${counts.entries} budget entries ` +
    `(${counts.items} sub-incomes) · ${counts.goals} savings goals`
);

console.log("\nSavings goals:");
for (const goal of activeGoals) {
  const saved = weightedSaved(goal.allocations);
  const target = targetFor(saved, goal.progress);
  console.log(
    `  ${goal.name.padEnd(20)} ${fmt(saved)} / ${fmt(target)}  (${Math.round((saved / target) * 100)}%)`
  );
}
const completedSaved = running.emergency;
const completedTarget = roundTo(running.emergency * 0.9, 100_00);
console.log(`  ${"Emergency Fund Goal".padEnd(20)} ${fmt(completedSaved)} / ${fmt(completedTarget)}  (completed)`);

console.log("\nOpen the app (pnpm dev) and take your screenshots. Re-run with the same seed for identical data.");

db.close();
