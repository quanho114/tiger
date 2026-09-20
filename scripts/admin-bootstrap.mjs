#!/usr/bin/env node

/**
 * Tiger 345 - Trusted Admin CLI Bootstrap Script
 * Strictly guarded to local/trusted environments.
 * Uses 'pg' pool to interact directly with PostgreSQL database.
 */

import pg from 'pg'

const { Pool } = pg

const TARGET_HOST = process.env.PGHOST || '127.0.0.1'
const TARGET_PORT = Number(process.env.PGPORT || 54322)
const DB_NAME = process.env.PGDATABASE || 'postgres'
const DB_USER = process.env.PGUSER || 'postgres'
const DB_PASSWORD = process.env.PGPASSWORD || 'postgres'

// Loopback guard
if (TARGET_HOST !== '127.0.0.1' && TARGET_HOST !== 'localhost') {
  console.error(
    `❌ ERROR: Target host is '${TARGET_HOST}'. admin-bootstrap is strictly guarded to run only on 127.0.0.1 or localhost!`
  )
  process.exit(1)
}

const pool = new Pool({
  host: TARGET_HOST,
  port: TARGET_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
})

const [command, arg1, arg2, arg3] = process.argv.slice(2)

function usage() {
  console.log(`Tiger 345 - Admin CLI Bootstrap Tool
Usage:
  node scripts/admin-bootstrap.mjs create <email> <password> <display_name>
  node scripts/admin-bootstrap.mjs list
  node scripts/admin-bootstrap.mjs deactivate <email>
  node scripts/admin-bootstrap.mjs activate <email>
`)
  process.exit(1)
}

async function main() {
  try {
    switch (command) {
      case 'create': {
        const email = arg1
        const password = arg2
        const displayName = arg3

        if (!email || !password || !displayName) {
          console.error('❌ ERROR: Missing arguments. Usage: create <email> <password> <display_name>')
          process.exit(1)
        }

        console.log(`🔒 Creating/promoting admin user: ${email}...`)

        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          // 1. Check if user already exists in auth.users
          const existingUser = await client.query(
            'SELECT id FROM auth.users WHERE email = $1',
            [email]
          )

          let userId
          if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id
            console.log(`Found existing auth.users record: ${userId}`)
          } else {
            // Create user in auth.users with encrypted password
            const newUser = await client.query(
              `INSERT INTO auth.users (
                instance_id,
                id,
                aud,
                role,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at,
                updated_at
              ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                gen_random_uuid(),
                'authenticated',
                'authenticated',
                $1,
                crypt($2, gen_salt('bf')),
                now(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('full_name', $3::text),
                now(),
                now()
              ) RETURNING id`,
              [email, password, displayName]
            )
            userId = newUser.rows[0].id
            console.log(`Created new auth.users record: ${userId}`)
          }

          // 2. Insert or update admin_profiles
          await client.query(
            `INSERT INTO public.admin_profiles (user_id, display_name, active)
             VALUES ($1, $2, true)
             ON CONFLICT (user_id) DO UPDATE
             SET display_name = EXCLUDED.display_name,
                 active = true,
                 updated_at = now()`,
            [userId, displayName]
          )

          await client.query('COMMIT')
          console.log(`✅ Admin '${email}' (${displayName}) successfully provisioned and active.`)
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        } finally {
          client.release()
        }
        break
      }

      case 'list': {
        const res = await pool.query(`
          SELECT
            a.id AS profile_id,
            u.email,
            a.display_name,
            a.active,
            a.created_at
          FROM public.admin_profiles a
          JOIN auth.users u ON u.id = a.user_id
          ORDER BY a.created_at ASC
        `)

        console.log('📋 Registered Administrators:')
        if (res.rows.length === 0) {
          console.log('  (No administrators registered yet)')
        } else {
          console.table(res.rows)
        }
        break
      }

      case 'deactivate': {
        const email = arg1
        if (!email) {
          console.error('❌ ERROR: Missing email. Usage: deactivate <email>')
          process.exit(1)
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          // Check if target is currently active
          const targetRes = await client.query(
            `SELECT a.active
             FROM public.admin_profiles a
             JOIN auth.users u ON u.id = a.user_id
             WHERE u.email = $1`,
            [email]
          )

          if (targetRes.rows.length === 0) {
            console.error(`❌ ERROR: Administrator with email '${email}' not found.`)
            process.exit(1)
          }

          const targetIsActive = targetRes.rows[0].active

          // Count total active admins
          const countRes = await client.query(
            'SELECT count(*) as count FROM public.admin_profiles WHERE active = true'
          )
          const activeCount = Number(countRes.rows[0].count)

          if (targetIsActive && activeCount <= 1) {
            console.error(
              `❌ ERROR: Cannot deactivate '${email}'. It is the LAST active administrator!\n` +
              'A minimum of one active administrator is required to maintain system governance.'
            )
            process.exit(2)
          }

          await client.query(
            `UPDATE public.admin_profiles
             SET active = false, updated_at = now()
             WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`,
            [email]
          )

          await client.query('COMMIT')
          console.log(`✅ Admin '${email}' has been deactivated.`)
        } catch (err) {
          await client.query('ROLLBACK')
          throw err
        } finally {
          client.release()
        }
        break
      }

      case 'activate': {
        const email = arg1
        if (!email) {
          console.error('❌ ERROR: Missing email. Usage: activate <email>')
          process.exit(1)
        }

        const res = await pool.query(
          `UPDATE public.admin_profiles
           SET active = true, updated_at = now()
           WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)
           RETURNING id`,
          [email]
        )

        if (res.rows.length === 0) {
          console.error(`❌ ERROR: Administrator with email '${email}' not found.`)
          process.exit(1)
        }

        console.log(`✅ Admin '${email}' has been activated.`)
        break
      }

      default:
        usage()
    }
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message)
  process.exit(1)
})
