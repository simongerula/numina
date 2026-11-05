import { handleRequest, InputError } from "@/lib/server/guard";
import { accountCreateSchema } from "@/lib/schemas";
import { createAccount, listAccounts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleRequest(req, () => ({ accounts: listAccounts() }));
}

export async function POST(req: Request) {
  return handleRequest(req, async () => {
    const parsed = accountCreateSchema.safeParse(await req.json());
    if (!parsed.success) throw new InputError("Invalid account data");
    const id = createAccount(parsed.data);
    return { id };
  });
}
