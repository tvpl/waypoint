import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { ensureDesktopUser, isDesktop } from "@/server/desktop";
import { desktopSecurity } from "@/server/desktop-security";
import { getDb, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { AuthForm } from "../auth-form";
import { UnlockForm } from "../unlock-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  if (isDesktop()) {
    // Desktop app: the lock screen when the app lock is on, otherwise straight in.
    if (!desktopSecurity().lock) redirect(`/api/desktop/session?next=${encodeURIComponent(next ?? "/")}`);
    const user = getDb().select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, await ensureDesktopUser())).get();
    return <UnlockForm name={user?.name ?? "você"} next={next} />;
  }
  return <AuthForm mode="login" next={next} />;
}
