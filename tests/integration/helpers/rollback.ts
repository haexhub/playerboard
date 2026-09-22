import type postgres from 'postgres'

class Rollback extends Error {}

/**
 * Runs `work` in a transaction that is always rolled back, so a test can seed
 * rows and assert against them without leaving anything in the local database.
 */
export const runIsolated = async <T>(
  sql: postgres.Sql,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> => {
  let out!: T
  try {
    await sql.begin(async (tx) => {
      out = await work(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  return out
}

/** Inserts a bare confirmed auth user and returns its id. */
export const createAuthUser = async (tx: postgres.TransactionSql): Promise<string> => {
  const [row] = await tx<{ id: string }[]>`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', ${'it-' + crypto.randomUUID() + '@example.com'}, '',
            now(), now(), now())
    returning id`
  return row!.id
}
