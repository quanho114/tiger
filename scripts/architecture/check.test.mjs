import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { checkArchitecture } from './check.mjs'

function check(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tiger-architecture-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  for (const [filename, content] of Object.entries(files)) {
    const target = path.join(directory, filename)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return checkArchitecture(directory).errors
}

test('permits composition, shared contracts, and type-only back references', (t) => {
  assert.deepEqual(
    check(t, {
      'src/app/App.tsx': "import '@/features/cart'; export type App = {}",
      'src/features/cart/index.ts': "import type { App } from './view'; export type Cart = App",
      'src/features/cart/view.ts': "import type { Cart } from './index'; export type App = Cart[]",
      'src/shared/lib/api.ts': "export type { Receipt } from '@contracts/orders'",
      'supabase/functions/_shared/contracts/orders.ts': 'export type Receipt = { id: string }',
    }),
    []
  )
})

test('rejects upward dependencies through aliases, relative imports, and re-exports', (t) => {
  const errors = check(t, {
    'src/app/App.ts': 'export const app = 1',
    'src/features/cart/index.ts': "import '../../app/App'",
    'src/shared/ui/index.ts': "export * from '@/features/cart'",
  })
  assert.equal(errors.length, 2)
  assert.match(errors.join('\n'), /features cannot depend on app/)
  assert.match(errors.join('\n'), /shared code cannot depend on app or features/)
})

test('blocks backend runtime imports even through dynamic and type imports', (t) => {
  const errors = check(t, {
    'src/features/cart/index.ts':
      "import('../../../supabase/functions/_shared/auth'); type Auth = import('../../../supabase/functions/_shared/auth').Auth",
    'supabase/functions/_shared/auth.ts': 'export type Auth = {}',
  })
  assert.equal(errors.length, 2)
  assert.ok(errors.every((error) => error.includes('frontend may only share backend contracts')))
})

test('rejects runtime cycles through barrel exports', (t) => {
  const errors = check(t, {
    'src/features/cart/index.ts': "export * from './provider'",
    'src/features/cart/provider.ts': "import './index'",
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Runtime import cycle/)
})

test('keeps contracts portable and handlers independent from HTTP entrypoints', (t) => {
  const errors = check(t, {
    'supabase/functions/_shared/contracts/orders.ts': "import '../auth'",
    'supabase/functions/_shared/auth.ts': 'export const auth = 1',
    'supabase/functions/public-api/index.ts': 'export const handler = 1',
    'supabase/functions/public-api/orders.ts': "import { handler } from './index'",
  })
  assert.equal(errors.length, 2)
  assert.match(errors.join('\n'), /contracts must remain portable/)
  assert.match(errors.join('\n'), /never an HTTP entrypoint/)
})

test('rejects access to cart internals from another feature', (t) => {
  const errors = check(t, {
    'src/features/catalog/api.ts': "import '@/features/cart/storage'",
    'src/features/cart/storage.ts': 'export const storage = 1',
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /cart public API/)
})

test('resolves aliases from the actual TypeScript config, including inherited paths', (t) => {
  const errors = check(t, {
    'tsconfig.base.json': JSON.stringify({
      compilerOptions: {
        moduleResolution: 'bundler',
        paths: { '@server/*': ['./supabase/functions/_shared/*'] },
      },
    }),
    'tsconfig.app.json': JSON.stringify({ extends: './tsconfig.base.json' }),
    'src/features/cart/index.ts': "import { auth } from '@server/auth'",
    'supabase/functions/_shared/auth.ts': 'export const auth = 1',
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /frontend may only share backend contracts/)
})

test('checks dynamic imports with options and TypeScript import-equals syntax', (t) => {
  const errors = check(t, {
    'src/shared/lib/api.ts':
      "import feature = require('@/features/cart'); import('@/features/cart', { with: { type: 'json' } })",
    'src/features/cart/index.ts': 'export const cart = 1',
  })
  assert.equal(errors.length, 2)
  assert.ok(errors.every((error) => error.includes('shared code cannot depend on app or features')))
})
