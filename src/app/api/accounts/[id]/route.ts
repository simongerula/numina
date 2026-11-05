import { handleRequest, InputError } from "@/lib/server/guard";
import { accountUpdateSchema } from "@/lib/schemas";
import { archiveAccount, updateAccount } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    const parsed = accountUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid account data");
    updateAccount(id, parsed.data);
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    archiveAccount(id);
    return { ok: true };
  });
}
