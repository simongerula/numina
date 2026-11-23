import { z } from "zod";

/** Strict input validation — the only entry point for user data into the DB. */

const id = z.string().uuid();

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  // JS Date silently rolls over impossible dates (2026-02-31 → Mar 3), so
  // parse in UTC and verify the round-trip components match the input.
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(`${s}T00:00:00Z`);
    return (
      !Number.isNaN(dt.getTime()) &&
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "invalid date");

/**
 * Amount arrives in cents from the client (integer). For deposit/withdraw it
 * must be positive; for adjustment it may be negative but never zero.
 */
const centsInt = z
  .number()
  .int("amount must be whole cents")
  .refine((n) => Math.abs(n) <= 1_000_000_000_00, "amount too large");

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort_order: z.number().int().optional(),
});

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  /** Soft-hide: archived accounts vanish from the dashboard but keep their movements. */
  archived: z.boolean().optional(),
});

export const movementCreateSchema = z
  .object({
    account_id: id,
    date: dateStr,
    type: z.enum(["deposit", "withdraw", "adjustment"]),
    /** cents: positive here; the sign is applied by type. */
    amount: centsInt,
    note: z.string().max(300).optional().default(""),
  })
  .refine(
    (v) => (v.type === "adjustment" ? v.amount !== 0 : v.amount > 0),
    "deposit/withdraw amounts must be positive"
  );

export const movementUpdateSchema = z.object({
  account_id: id.optional(),
  date: dateStr.optional(),
  type: z.enum(["deposit", "withdraw", "adjustment"]).optional(),
  amount: centsInt.optional(),
  note: z.string().max(300).optional(),
});

// Budgeting

const budgetCategoryKind = z.enum(["expense", "other"]);
const budgetEntryKind = z.enum(["income", "expense", "other"]);

export const budgetCategoryCreateSchema = z.object({
  kind: budgetCategoryKind,
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort_order: z.number().int().optional(),
});

export const budgetCategoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  /** Soft-hide: archived categories vanish from pickers but keep entry history. */
  archived: z.boolean().optional(),
});

/**
 * Amount arrives in cents, always positive — the sign is implied by the kind.
 * Income has no category (free-text note instead); expense/other require one.
 */
export const budgetEntryCreateSchema = z
  .object({
    kind: budgetEntryKind,
    category_id: id.nullish(),
    date: dateStr,
    amount: centsInt,
    note: z.string().max(300).optional().default(""),
  })
  .refine((v) => v.amount > 0, "amount must be positive")
  .refine(
    (v) => (v.kind === "income" ? !v.category_id : !!v.category_id),
    "income takes no category; expense/other require one"
  );

export const budgetEntryUpdateSchema = z.object({
  kind: budgetEntryKind.optional(),
  category_id: id.nullish(),
  date: dateStr.optional(),
  amount: centsInt.optional(),
  note: z.string().max(300).optional(),
});

// Savings goals

/**
 * One account feeding a goal, at an independent weight (percent of that
 * account's balance). Weights are per-account caps — several may be 100%, and
 * they need not sum to anything.
 */
const goalAllocation = z.object({
  account_id: id,
  weight: z.number().int().min(1, "weight must be 1–100").max(100, "weight must be 1–100"),
});

const goalAllocations = z
  .array(goalAllocation)
  .min(1, "select at least one account")
  .refine(
    (arr) => new Set(arr.map((a) => a.account_id)).size === arr.length,
    "each account can be used once"
  );

/** The target is money, so it arrives as positive integer cents like every amount. */
const positiveCents = centsInt.refine((n) => n > 0, "target must be positive");

export const savingsGoalCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  target: positiveCents,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort_order: z.number().int().optional(),
  allocations: goalAllocations,
});

export const savingsGoalUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  target: positiveCents.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  /** Soft archive once saved for: completed goals move to the archived list. */
  completed: z.boolean().optional(),
});

export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type MovementCreate = z.infer<typeof movementCreateSchema>;
export type MovementUpdate = z.infer<typeof movementUpdateSchema>;
export type BudgetCategoryCreate = z.infer<typeof budgetCategoryCreateSchema>;
export type BudgetCategoryUpdate = z.infer<typeof budgetCategoryUpdateSchema>;
export type BudgetEntryCreate = z.infer<typeof budgetEntryCreateSchema>;
export type BudgetEntryUpdate = z.infer<typeof budgetEntryUpdateSchema>;
export type SavingsGoalCreate = z.infer<typeof savingsGoalCreateSchema>;
export type SavingsGoalUpdate = z.infer<typeof savingsGoalUpdateSchema>;
