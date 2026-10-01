import type { SQLWrapper } from "drizzle-orm";
import type { RunnableQuery } from "drizzle-orm/runnable-query";

import type { Database } from ".";

/**
 * One statement inside an atomic batch.
 *
 * `RunnableQuery` rather than `SQL`, because D1's `batch` calls the query builders'
 * internal `_prepare()` to get a prepared statement; a bare `SQL` has no such method
 * and would fail at runtime rather than at compile time.
 *
 * `run()` is required because the `better-sqlite3` branch executes the builder
 * itself: see the transaction note in `runAtomicBatch`.
 *
 * Also intersected with `SQLWrapper` so the same value can be handed to APIs typed
 * against plain SQL.
 */
interface SqliteStatement extends RunnableQuery<unknown, "sqlite"> {
  run(): unknown;
}

export type SqliteBatchItem = SqliteStatement & SQLWrapper;

/** What one statement of a finished batch did. */
export interface AtomicStatementResult {
  /**
   * Rows the statement changed. `0` means it matched nothing, which for an update is
   * how "that row is gone" shows up. `-1` means the driver did not report a count.
   */
  changes: number;
}

/** The D1 handle exposes `batch`; `better-sqlite3` does not. */
interface BatchCapable {
  batch(statements: readonly SqliteBatchItem[]): Promise<unknown[]>;
}

function supportsBatch(db: Database): db is Database & BatchCapable {
  return typeof (db as Partial<BatchCapable>).batch === "function";
}

/**
 * D1 and `better-sqlite3` report a changed-row count under different names, so read
 * the ones that exist and be explicit about having found none.
 */
function readChanges(result: unknown): number {
  if (typeof result === "number") {
    return result;
  }
  if (typeof result !== "object" || result === null) {
    return -1;
  }
  const record = result as Record<string, unknown>;
  if (typeof record.changes === "number") {
    return record.changes;
  }
  if (typeof record.rowsAffected === "number") {
    return record.rowsAffected;
  }
  // A raw `D1Result` nests the count under `meta`.
  const meta = record.meta;
  if (typeof meta === "object" && meta !== null) {
    const metaChanges = (meta as Record<string, unknown>).changes;
    if (typeof metaChanges === "number") {
      return metaChanges;
    }
  }
  return -1;
}

/**
 * Runs `statements` so that either every one of them lands or none of them do.
 *
 * This exists because the two drivers disagree about how to be atomic, while the
 * repository functions are written against the wider `Database` type so the unit
 * suite can run them on `better-sqlite3`:
 *
 * - **D1** has no `BEGIN`/`COMMIT` from inside a Worker; Cloudflare rejects them. Its
 *   atomicity primitive is `batch()`, which Cloudflare executes as a single
 *   transaction: if any statement fails, none of them are applied. Note that D1's
 *   batch has already committed by the time this promise resolves, so `mustChange`
 *   can only be reported there, not enforced.
 * - **`better-sqlite3`**, used only by the unit suite, is the opposite: it has real
 *   `BEGIN`/`COMMIT` through `transaction()` and no batch at all. Its transactions
 *   are also synchronous, so this callback must not await anything: the transaction
 *   would commit the moment the callback returned its promise. The statements are
 *   therefore executed as `statement.run()` rather than awaited, which keeps the
 *   whole callback synchronous. Those builders were created from `db`, not from the
 *   transaction argument, which is still correct: `better-sqlite3` runs everything on
 *   one connection, so a statement executed while `transaction()` has the connection
 *   open is inside that transaction.
 *
 * A failure anywhere rejects the returned promise, and callers rely on that: a
 * partially applied batch is not a state this function will report as success.
 *
 * @param mustChange Index of a statement that has to change at least one row for
 * the batch to be considered applied. A statement that matched nothing throws, which
 * on `better-sqlite3` also rolls back the rest of the batch.
 */
export async function runAtomicBatch(
  db: Database,
  statements: readonly SqliteBatchItem[],
  mustChange?: number,
): Promise<AtomicStatementResult[]> {
  if (statements.length === 0) {
    return [];
  }

  if (supportsBatch(db)) {
    const results = (await db.batch(statements)).map((result) => ({
      changes: readChanges(result),
    }));
    assertChanged(results, mustChange);
    return results;
  }

  const results = db.transaction((tx) => {
    void tx;
    const executed: AtomicStatementResult[] = [];
    for (const statement of statements) {
      executed.push({ changes: readChanges(statement.run()) });
    }
    // Checked here, inside the transaction, so a statement that matched nothing
    // takes the rest of the batch down with it rather than committing a partial
    // change.
    assertChanged(executed, mustChange);
    return executed;
  });

  return results;
}

function assertChanged(results: readonly AtomicStatementResult[], mustChange: number | undefined): void {
  if (mustChange === undefined) {
    return;
  }
  const result = results[mustChange];
  if (result && result.changes === 0) {
    throw new Error(`Atomic batch statement ${mustChange} changed no rows`);
  }
}