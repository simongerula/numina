import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetCategoryUpdateSchema } from "@/lib/schemas";
import { archiveBudgetCategory, updateBudgetCategory } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    const parsed = budgetCategoryUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid category data");
    updateBudgetCategory(id, parsed.data);
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    // Soft delete: archived categories keep their entry history.
    archiveBudgetCategory(id);
    return { ok: true };
  });
}
