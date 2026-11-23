import { handleRequest, InputError } from "@/lib/server/guard";
import { savingsGoalCreateSchema } from "@/lib/schemas";
import { createSavingsGoal, listCompletedSavingsGoals, listSavingsGoals } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleRequest(req, () => ({
    goals: listSavingsGoals(),
    completed: listCompletedSavingsGoals(),
  }));
}

export async function POST(req: Request) {
  return handleRequest(req, async () => {
    const parsed = savingsGoalCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid goal data");
    const id = createSavingsGoal(parsed.data);
    return { id };
  });
}
