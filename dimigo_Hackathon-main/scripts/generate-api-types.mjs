import { readFileSync, writeFileSync } from 'node:fs'
import YAML from 'yaml'
const { components } = YAML.parse(readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'))
function type(s) {
  if (s.$ref) return s.$ref.split('/').at(-1)
  if (s.anyOf || s.oneOf) return `(${(s.anyOf || s.oneOf).map(type).join(' | ')})`
  if (s.allOf) return `(${s.allOf.map(type).join(' & ')})`
  if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ')
  if (s.type === 'array') return `(${type(s.items)})[]`
  if (s.type === 'object') return `{ ${[...Object.entries(s.properties || {}).map(([key, value]) => `${JSON.stringify(key)}${s.required?.includes(key) ? '' : '?'}: ${type(value)}`), ...(s.additionalProperties === true ? ['[key: string]: unknown'] : [])].join('; ')} }`
  return ({ integer: 'number', number: 'number', boolean: 'boolean', string: 'string', null: 'null' })[s.type] || 'unknown'
}
writeFileSync(new URL('../src/types/api.ts', import.meta.url), '// Generated from docs/openapi.yaml by npm run generate:types.\n'+Object.entries(components.schemas).map(([name,s])=>`export type ${name} = ${type(s)}\n`).join(''))
