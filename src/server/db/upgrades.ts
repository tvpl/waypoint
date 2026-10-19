import "server-only";
import type Database from "better-sqlite3";

/**
 * Changes to stored content that a SQL migration can't express — e.g. rewriting plan documents
 * when PLAN_SCHEMA_VERSION goes up. The database update (./migrations.ts) runs each one once,
 * right after the SQL migration named in `after` and in the same transaction, so it always sees
 * the schema it was written for. Never edit or remove an upgrade that has shipped: add a new one.
 *
 *   {
 *     id: "plan-documents-v2",
 *     after: "0016_…",               // the newest migration in drizzle/ when it was written
 *     description: "Converte os plans para o formato 2",
 *     run(c) { … },                  // plain better-sqlite3 calls; throw to roll everything back
 *   }
 */
export type DataUpgrade = {
  id: string;
  /** Tag of the SQL migration (drizzle/meta/_journal.json) this upgrade runs after. */
  after: string;
  /** Shown in the update dialog (UI copy, pt-BR). */
  description: string;
  run(c: Database.Database): void;
};

export const DATA_UPGRADES: DataUpgrade[] = [];
