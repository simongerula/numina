import { handleRequest, InputError } from "@/lib/server/guard";
import { movementUpdateSchema } from "@/lib/schemas";
import { deleteMovement, updateMovement } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    const parsed = movementUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid movement data");
    updateMovement(id, parsed.data);
    return { ok: true };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return handleRequest(req, async () => {
    const { id } = await ctx.params;
    deleteMovement(id);
    return { ok: true };
  });
}
