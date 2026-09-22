import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const url = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  migrations: {
    prefix: 'supabase',
    schema: 'public',
    table: 'drizzle_migrations',
  },
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
