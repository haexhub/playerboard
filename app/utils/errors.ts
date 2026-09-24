const field = (err: unknown, key: string): unknown =>
  typeof err === 'object' && err !== null ? (err as Record<string, unknown>)[key] : undefined

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

/** SQLSTATE (or PostgREST code) carried by a supabase-js error; undefined for other errors. */
export const pgErrorCode = (err: unknown): string | undefined => nonEmptyString(field(err, 'code'))

export const errorMessage = (err: unknown, fallback: string): string =>
  nonEmptyString(field(field(err, 'data'), 'statusMessage')) ??
  nonEmptyString(field(err, 'statusMessage')) ??
  nonEmptyString(field(err, 'message')) ??
  fallback

/** Postgres unique_violation from supabase-js, or a 409 from one of our API routes. */
export const isUniqueViolation = (err: unknown): boolean =>
  pgErrorCode(err) === '23505' || field(err, 'statusCode') === 409

/** PostgREST answers 2xx with no rows when RLS filters every row of an update/delete. */
export const assertRowsAffected = (rows: unknown[] | null): void => {
  if (!rows?.length) throw new Error('Änderung wurde nicht übernommen.')
}
