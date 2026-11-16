import { handleRequest, InputError } from "@/lib/server/guard";
import { budgetSettingsUpdateSchema } from "@/lib/schemas";
import { setBudgetingEnabled } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return handleRequest(req, async () => {
    const parsed = budgetSettingsUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid settings data");
    setBudgetingEnabled(parsed.data.enabled);
    return { ok: true, enabled: parsed.data.enabled };
  });
}
