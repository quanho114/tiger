import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const contractsRoot = 'supabase/functions/_shared/contracts/'
const sourceExtensions = /\.[cm]?[jt]sx?$/
const testFile = /(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/

function sourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(filename)
      : sourceExtensions.test(filename)
        ? [filename]
        : []
  })
}

function moduleReferences(source) {
  const references = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node
      const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause
      const typeOnly =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          'elements' in bindings &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly))
      references.push({ node: node.moduleSpecifier, typeOnly: Boolean(typeOnly) })
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      references.push({ node: node.argument.literal, typeOnly: true })
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      references.push({ node: node.moduleReference.expression, typeOnly: node.isTypeOnly })
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length >= 1
    ) {
      references.push({ node: node.arguments[0], typeOnly: false })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return references.filter(({ node }) => ts.isStringLiteralLike(node))
}

export function checkArchitecture(rootDirectory) {
  const root = path.resolve(rootDirectory)
  const relative = (filename) => path.relative(root, filename).split(path.sep).join('/')
  const defaultOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: {
      '@/*': [path.join(root, 'src/*')],
      '@contracts': [path.join(root, contractsRoot, 'index.ts')],
      '@contracts/*': [path.join(root, contractsRoot, '*')],
    },
    allowImportingTsExtensions: true,
  }
  function resolutionConfig(filename) {
    const configPath = path.join(root, filename)
    if (!fs.existsSync(configPath)) return defaultOptions
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile)
    if (error) throw new Error(`Cannot read architecture resolution config: ${configPath}`)
    return ts.parseJsonConfigFileContent(config, ts.sys, root, undefined, configPath).options
  }
  const frontendOptions = resolutionConfig('tsconfig.app.json')
  const backendOptions = resolutionConfig('tsconfig.server.json')
  const frontendCache = ts.createModuleResolutionCache(root, (name) => name, frontendOptions)
  const backendCache = ts.createModuleResolutionCache(root, (name) => name, backendOptions)
  const files = [
    ...sourceFiles(path.join(root, 'src')),
    ...sourceFiles(path.join(root, 'supabase/functions')),
  ].filter((filename) => !testFile.test(relative(filename)) && !filename.endsWith('.d.ts'))
  const errors = []
  const runtimeGraph = new Map()

  for (const filename of files) {
    const from = relative(filename)
    const isFrontend = from.startsWith('src/')
    const options = isFrontend ? frontendOptions : backendOptions
    const cache = isFrontend ? frontendCache : backendCache
    const source = ts.createSourceFile(
      filename,
      fs.readFileSync(filename, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const edges = []
    if (from.startsWith('src/') && !/^src\/(?:app\/|features\/|shared\/|main\.tsx$)/.test(from)) {
      errors.push(`${from}: code belongs in app/, features/, or shared/`)
    }
    for (const { node, typeOnly } of moduleReferences(source)) {
      const specifier = node.text
      const location = `${from}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
      const resolved = ts.resolveModuleName(
        specifier,
        filename,
        options,
        ts.sys,
        cache
      ).resolvedModule
      const to = resolved ? relative(resolved.resolvedFileName) : null
      const local = to && !to.startsWith('../') && !to.includes('node_modules/')
      if (
        from.startsWith('src/') &&
        (/^(?:node:|pg$)/.test(specifier) ||
          (local && !to.startsWith('src/') && !to.startsWith(contractsRoot)))
      )
        errors.push(`${location}: frontend may only share backend contracts (${specifier})`)
      if (
        from.startsWith('src/shared/') &&
        local &&
        to.startsWith('src/') &&
        !to.startsWith('src/shared/')
      ) {
        errors.push(`${location}: shared code cannot depend on app or features (${specifier})`)
      }
      if (from.startsWith('src/shared/lib/') && local && /^src\/shared\/(?:ui|hooks)\//.test(to)) {
        errors.push(
          `${location}: shared infrastructure cannot depend on UI or hooks (${specifier})`
        )
      }
      if (from.startsWith('src/features/') && local && to.startsWith('src/app/')) {
        errors.push(`${location}: features cannot depend on app composition (${specifier})`)
      }
      if (from.startsWith('supabase/functions/') && local && to.startsWith('src/')) {
        errors.push(`${location}: backend cannot depend on frontend (${specifier})`)
      }
      if (
        from.startsWith(contractsRoot) &&
        (local ? !to.startsWith(contractsRoot) : specifier !== 'zod')
      ) {
        errors.push(
          `${location}: contracts must remain portable; only contracts and zod are allowed (${specifier})`
        )
      }
      if (local && /^supabase\/functions\/[^/]+\/index\.ts$/.test(to) && to !== from) {
        errors.push(
          `${location}: use a handler or context module, never an HTTP entrypoint (${specifier})`
        )
      }
      if (
        local &&
        !from.startsWith('src/features/cart/') &&
        /^src\/features\/cart\/(?:cartContext|CartProvider|cartReducer|storage)\./.test(to)
      ) {
        errors.push(`${location}: use the cart public API (${specifier})`)
      }
      if (local && !typeOnly) edges.push(to)
    }
    runtimeGraph.set(from, edges)
  }

  // Type-only dependencies do not initialize modules and cannot create runtime cycles.
  const visited = new Set()
  const active = new Set()
  const stack = []
  function visit(module) {
    if (active.has(module)) {
      errors.push(
        `Runtime import cycle: ${[...stack.slice(stack.indexOf(module)), module].join(' -> ')}`
      )
      return
    }
    if (visited.has(module)) return
    visited.add(module)
    active.add(module)
    stack.push(module)
    for (const dependency of runtimeGraph.get(module) ?? []) visit(dependency)
    stack.pop()
    active.delete(module)
  }
  for (const module of runtimeGraph.keys()) visit(module)
  return { filesChecked: files.length, errors }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const result = checkArchitecture(root)
  if (result.errors.length) {
    console.error(result.errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`Architecture checks passed (${result.filesChecked} source files).`)
  }
}
