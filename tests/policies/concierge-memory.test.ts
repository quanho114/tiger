import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { FIXTURE_USERS, seedFixtureUsers } from '../fixtures/auth-users.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'

const { Pool } = pg

function createPool(): pg.Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  })
}

async function runAs(
  pool: pg.Pool,
  role: 'anon' | 'authenticated',
  userId: string | undefined,
  callback: (client: pg.PoolClient) => Promise<void>
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ])
    await callback(client)
    await client.query('ROLLBACK')
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function expectPermissionDenied(
  client: pg.PoolClient,
  sql: string,
  values: unknown[] = []
): Promise<void> {
  await client.query('SAVEPOINT memory_policy_test')
  try {
    await client.query(sql, values)
    expect.fail('Expected the client query to be denied')
  } catch (error: unknown) {
    await client.query('ROLLBACK TO SAVEPOINT memory_policy_test')
    expect(error instanceof Error ? error.message : String(error)).toMatch(/permission denied|row-level security/i)
  }
}

describe('Concierge V2 memory RLS policies', () => {
  let pool: pg.Pool

  async function clearMemoryFixtures(): Promise<void> {
    const userIds = [FIXTURE_USERS.customerA.id, FIXTURE_USERS.customerB.id]
    await pool.query('DELETE FROM public.user_ai_memory_suppressions WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.user_ai_memories WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.user_ai_memory_settings WHERE user_id = ANY($1::uuid[])', [userIds])
  }

  beforeAll(async () => {
    pool = createPool()
    await assertIsolatedTestDatabase(pool)
    await seedFixtureUsers(pool)
    await clearMemoryFixtures()
    await pool.query(
      `INSERT INTO public.user_ai_memory_settings (user_id, enabled, consent_version, memory_epoch)
       VALUES ($1, true, 1, 0), ($2, true, 1, 0)`,
      [FIXTURE_USERS.customerA.id, FIXTURE_USERS.customerB.id]
    )
    await pool.query(
      `INSERT INTO public.user_ai_memories (
         user_id, memory_type, memory_key, value, source, confidence, observed_at, schema_version
       ) VALUES ($1, 'preference', 'likes-grilled-beef', '{"food":"Bò nướng"}'::jsonb, 'explicit', 100, now(), 1)`,
      [FIXTURE_USERS.customerA.id]
    )
  })

  afterAll(async () => {
    if (pool) {
      await clearMemoryFixtures()
      await pool.end()
    }
  })

  it('denies guest reads and direct mutations', async () => {
    await runAs(pool, 'anon', undefined, async (client) => {
      await expectPermissionDenied(client, 'SELECT * FROM public.user_ai_memories')
      await expectPermissionDenied(
        client,
        `INSERT INTO public.user_ai_memory_settings (user_id, enabled, consent_version, memory_epoch)
         VALUES ('${FIXTURE_USERS.customerA.id}', true, 1, 0)`
      )
    })
  })

  it('shows each authenticated customer only their own allowed records', async () => {
    await runAs(pool, 'authenticated', FIXTURE_USERS.customerA.id, async (client) => {
      const settings = await client.query('SELECT enabled, memory_epoch FROM public.user_ai_memory_settings')
      const facts = await client.query('SELECT memory_key FROM public.user_ai_memories')

      expect(settings.rows).toEqual([{ enabled: true, memory_epoch: 0 }])
      expect(facts.rows).toEqual([{ memory_key: 'likes-grilled-beef' }])
    })

    await runAs(pool, 'authenticated', FIXTURE_USERS.customerB.id, async (client) => {
      const settings = await client.query('SELECT enabled, memory_epoch FROM public.user_ai_memory_settings')
      const facts = await client.query('SELECT memory_key FROM public.user_ai_memories')

      expect(settings.rows).toEqual([{ enabled: true, memory_epoch: 0 }])
      expect(facts.rows).toEqual([])
    })
  })

  it('denies direct authenticated writes even for the record owner', async () => {
    await runAs(pool, 'authenticated', FIXTURE_USERS.customerA.id, async (client) => {
      await expectPermissionDenied(
        client,
        `INSERT INTO public.user_ai_memories (
           user_id, memory_type, memory_key, value, source, confidence, observed_at, schema_version
         ) VALUES (
           '${FIXTURE_USERS.customerA.id}', 'preference', 'likes-soup', '{"food":"Canh"}'::jsonb, 'explicit', 100, now(), 1
         )`
      )
      await expectPermissionDenied(
        client,
        `DELETE FROM public.user_ai_memories
         WHERE user_id = '${FIXTURE_USERS.customerA.id}'`
      )
    })
  })
})
