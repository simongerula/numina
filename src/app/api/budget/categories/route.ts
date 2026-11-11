import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetCategoryCreateSchema } from "@/lib/schemas";
import { createBudgetCategory } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRequest(req, async () => {
    const parsed = budgetCategoryCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid category data");
    const id = createBudgetCategory(parsed.data);
    return { id };
  });
}
