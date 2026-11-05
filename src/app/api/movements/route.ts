import { handleRequest, InputError } from "@/lib/server/guard";
import { movementCreateSchema } from "@/lib/schemas";
import { createMovement } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRequest(req, async () => {
    const parsed = movementCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid movement data");
    const id = createMovement(parsed.data);
    return { id };
  });
}
