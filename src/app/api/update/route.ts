import { NextResponse } from "next/server";
import { z } from "zod";
import { applyUpdate, backupBeforeUpdate } from "@/server/services/database-update";
import { UserError } from "@/server/services/workspaces";

const input = z.object({
  step: z.enum(["backup", "update"]),
  email: z.string().max(320).optional(),
  password: z.string().max(200).optional(),
});

/**
 * POST /api/update { step, email?, password? } → { file } | { ok }
 * The database update dialog: "backup" saves a full copy of the database file (the desktop app
 * uses its own backup center instead), "update" applies the pending migrations. Access is checked
 * in services/database-update.ts.
 */
export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { step, ...credentials } = parsed.data;
  try {
    if (step === "backup") return NextResponse.json({ file: await backupBeforeUpdate(req, credentials) });
    await applyUpdate(req, credentials);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
