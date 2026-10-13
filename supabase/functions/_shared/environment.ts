export function readEnv(name: string): string | undefined {
  return (typeof Deno !== 'undefined' ? Deno.env.get(name) : process.env[name])?.trim() || undefined
}

export function allowsLocalDefaults(): boolean {
  if (readEnv('DENO_DEPLOYMENT_ID') || readEnv('NODE_ENV') === 'production' || readEnv('ENVIRONMENT') === 'production') {
    return false
  }
  return readEnv('NODE_ENV') === 'test' || readEnv('NODE_ENV') === 'development' || readEnv('ENVIRONMENT') === 'local'
}

export function configuredValue(name: string, value: string | undefined, localDefault: string): string {
  if (value?.trim()) return value.trim()
  if (allowsLocalDefaults()) return localDefault
  throw new Error(`Missing required server configuration: ${name}`)
}

export function signingSecret(name: string, localDefault: string): string {
  return configuredValue(name, readEnv(name) || readEnv('SUPABASE_SERVICE_ROLE_KEY'), localDefault)
}
