import { z } from "zod";

/** Strict input validation — the only entry point for user data into the DB. */

const id = z.string().uuid();

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(s + "T00:00:00").getTime()), "invalid date");

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

export type AccountCreate = z.infer<typeof accountCreateSchema>;
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;
export type MovementCreate = z.infer<typeof movementCreateSchema>;
export type MovementUpdate = z.infer<typeof movementUpdateSchema>;
