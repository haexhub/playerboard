import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import * as schema from '~~/db/schema'

type Db = PostgresJsDatabase<typeof schema>

const globalRef = globalThis as unknown as { __ifaPg?: ReturnType<typeof postgres> }

const getConnectionUrl = (): string => {
  const runtime = useRuntimeConfig()
  const url = runtime.supabaseDbUrl || process.env.SUPABASE_DB_URL
  if (!url) throw new Error('SUPABASE_DB_URL is not configured')
  return url as string
}

const getPool = () => {
  if (!globalRef.__ifaPg) {
    globalRef.__ifaPg = postgres(getConnectionUrl(), {
      max: 10,
      prepare: false,
    })
  }
  return globalRef.__ifaPg
}

export const useAdminDb = (): Db => drizzle(getPool(), { schema })

// Privileged routes bypass RLS through useAdminDb(), so they re-check the
// caller's trainer role themselves; 403 unless `userId` trains `teamId`.
export const requireTrainer = async (db: Db, teamId: string, userId: string): Promise<void> => {
  const [caller] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.teamId, teamId), eq(schema.memberships.userId, userId)))
    .limit(1)
  if (caller?.role !== 'trainer') {
    throw createError({ statusCode: 403, statusMessage: 'Only trainers of the team may do this' })
  }
}

export const useUserDb = async <T>(event: H3Event, work: (tx: Db) => Promise<T>): Promise<T> => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }
  const claims = {
    sub: userId,
    email: user.email,
    role: 'authenticated',
  }
  const db = drizzle(getPool(), { schema })
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true)`)
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`)
    return await work(tx as Db)
  })
}

export { schema }
