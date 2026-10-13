import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export function load(url, context, nextLoad) {
  if (!url.endsWith('.ts')) return nextLoad(url, context)
  const code = readFileSync(fileURLToPath(url), 'utf8')
  const { outputText } = ts.transpileModule(code, {
    fileName: fileURLToPath(url),
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return { format: 'module', shortCircuit: true, source: outputText }
}
