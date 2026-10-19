import { redirect } from "next/navigation";
import { databaseStatus } from "@/server/db";

const safeNext = (v: string | undefined) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/**
 * Where the desktop window lands while the database waits for its update (it can't be signed in
 * yet): the root layout shows the update dialog in place of every page. Once updated, goes on.
 */
export default async function UpdatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (databaseStatus().state !== "pending") redirect(safeNext((await searchParams).next));
  return null;
}
