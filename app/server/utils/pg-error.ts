export type PgError = { code?: string; constraint_name?: string; message?: string }

// drizzle-orm >= 0.44 wraps every driver failure in a DrizzleQueryError whose
// `message` is only "Failed query: <sql> params: <values>" and whose `code` is
// undefined; the postgres.js error carrying the SQLSTATE `code` sits on `cause`.
// Read DB error details through this so SQLSTATE checks keep working and the
// SQL/params (invitation tokens!) never reach a client-facing message.
export const pgError = (err: unknown): PgError => {
  const cause = (err as { cause?: unknown } | null | undefined)?.cause
  return (cause ?? err ?? {}) as PgError
}
