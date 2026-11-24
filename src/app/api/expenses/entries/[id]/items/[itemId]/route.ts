import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetEntryItemUpdateSchema } from "@/lib/schemas";
import { deleteBudgetEntryItem, updateBudgetEntryItem } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id, itemId } = await ctx.params;
    const parsed = budgetEntryItemUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid sub-income data");
    updateBudgetEntryItem(id, itemId, parsed.data);
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id, itemId } = await ctx.params;
    deleteBudgetEntryItem(id, itemId);
    return { ok: true };
  });
}
