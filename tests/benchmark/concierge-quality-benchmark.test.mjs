import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { benchmarkEndpoint, runBenchmark, scenarios } from '../../scripts/concierge-quality-benchmark.mjs'

test('dry-run scenarios cover grounded and no-tool paths without network', async () => {
  const report = await runBenchmark({ llm: { orchestrateTurn: async () => ({ reply_text: 'Chào bạn', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) } })
  assert.equal(report.summary.passed, scenarios.length)
  assert.equal(report.summary.provider_requests, 0)
  assert.ok(report.results.every(result => result.passed))
  const selected = await runBenchmark({ llm: { orchestrateTurn: async () => ({ reply_text: 'Chào bạn', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) }, caseIds: ['group-budget'] })
  assert.deepEqual(selected.results.map(result => result.id), ['group-budget'])
})

test('blocks non-loopback endpoints and embedded credentials', () => {
  for (const url of ['https://api.example.com/v1', 'http://localhost.evil.invalid/v1',
    'http://token@localhost:20128/v1', 'http://localhost:20128/admin']) {
    assert.throws(() => benchmarkEndpoint(url))
  }
  assert.equal(benchmarkEndpoint('http://localhost:20128/v1').pathname, '/v1')
})

const server = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, 'Bearer synthetic-test-key')
  if (request.url === '/v1/models') {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ data: [{ id: 'synthetic-model' }] }))
    return
  }
  assert.equal(request.url, '/v1/chat/completions')
  assert.equal(request.method, 'POST')
  let body = ''
  for await (const chunk of request) body += chunk.toString()
  assert.equal(JSON.parse(body).stream, false)
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ choices: [{ message: { content: 'Chào bạn', tool_calls: [] } }],
    usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } }))
})
after(() => server.close())

async function invoke(args, environment) {
  const child = spawn(process.execPath, ['scripts/concierge-quality-benchmark.mjs', ...args], {
    cwd: new URL('../..', import.meta.url), env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', text => { stdout += text })
  child.stderr.setEncoding('utf8').on('data', text => { stderr += text })
  const exitCode = await new Promise(resolve => child.on('close', resolve))
  assert.equal(exitCode, 0, stderr)
  assert.ok(!stdout.includes('synthetic-test-key'))
  assert.ok(!stderr.includes('synthetic-test-key'))
  return JSON.parse(stdout)
}

test('connects to an owned local OpenAI-compatible mock, never printing credentials', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const localUrl = `http://127.0.0.1:${server.address().port}/v1`
  const environment = { ...process.env, ENVIRONMENT: 'local', DENO_DEPLOYMENT_ID: '',
    CONCIERGE_LLM_DEV_BASE_URL: localUrl, BENCHMARK_LLM_BASE_URL: localUrl,
    BENCHMARK_LLM_API_KEY: 'synthetic-test-key', BENCHMARK_LLM_MODEL: 'synthetic-model' }
  assert.deepEqual((await invoke(['--list-models'], environment)).models, ['synthetic-model'])
  const report = await invoke(['--confirm-live'], environment)
  assert.equal(report.summary.passed, scenarios.length)
  assert.ok(report.summary.provider_requests > 0)
  assert.ok(report.summary.provider_requests <= 16)
  assert.ok(report.summary.p95_model_scenario_ms >= report.summary.p50_model_scenario_ms)
  assert.ok(report.results.every(result => !('message' in result)))
})
