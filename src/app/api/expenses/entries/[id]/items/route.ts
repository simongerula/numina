import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetEntryItemCreateSchema } from "@/lib/schemas";
import { createBudgetEntryItem } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    const parsed = budgetEntryItemCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid sub-income data");
    const itemId = createBudgetEntryItem(id, parsed.data);
    return { id: itemId };
  });
}
