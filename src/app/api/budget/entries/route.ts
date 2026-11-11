import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetEntryCreateSchema } from "@/lib/schemas";
import { createBudgetEntry } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRequest(req, async () => {
    const parsed = budgetEntryCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid entry data");
    const id = createBudgetEntry(parsed.data);
    return { id };
  });
}
