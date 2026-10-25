import { readFileSync } from 'node:fs'
import YAML from 'yaml'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { fail } from './common.mjs'

export const document = YAML.parse(readFileSync(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'))
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema({ $id: 'xiro', components: document.components })
export const resolve = value => value?.$ref ? value.$ref.split('/').slice(1).reduce((v, key) => v[key], document) : value
export function validator(schema) { return ajv.compile({ ...schema, $ref: schema.$ref ? `xiro${schema.$ref}` : undefined, components: document.components }) }
// Local component references resolve against the operation's schema document.
function compile(schema) { return ajv.compile({ components: document.components, ...schema }) }
export const operations = Object.entries(document.paths).flatMap(([path, methods]) => Object.entries(methods).filter(([, op]) => op.operationId).map(([method, op]) => ({
  ...op, method, path, parameters: (op.parameters || []).map(resolve),
  validateBody: op.requestBody ? compile(op.requestBody.content['application/json'].schema) : null,
  responseValidators: Object.fromEntries(Object.entries(op.responses).flatMap(([status, response]) => {
    const schema = resolve(response).content?.['application/json']?.schema
    return schema ? [[status, compile(schema)]] : []
  })),
})))
export function validateRequest(req, operation) {
  if (operation.validateBody) {
    if (!operation.validateBody(req.body)) fail(422, 'VALIDATION_ERROR', '입력 값을 확인해 주세요.', { fields: operation.validateBody.errors.map(e => ({ path: e.instancePath, rule: e.keyword })) })
  } else if (req.body !== undefined && (req.body === null || Object.keys(req.body).length)) fail(422, 'VALIDATION_ERROR', '이 요청에는 본문을 보낼 수 없어요.')
  const allowedQuery = new Set(operation.parameters.filter(p => p.in === 'query').map(p => p.name))
  for (const key of Object.keys(req.query)) if (!allowedQuery.has(key)) fail(422, 'VALIDATION_ERROR', '지원하지 않는 검색 조건이에요.')
  for (const parameter of operation.parameters) {
    let value = parameter.in === 'header' ? req.get(parameter.name) : parameter.in === 'path' ? req.params[parameter.name] : req.query[parameter.name]
    if (value === undefined) { if (parameter.required) fail(parameter.in === 'header' ? 428 : 422, parameter.name === 'If-Match' ? 'PRECONDITION_REQUIRED' : 'VALIDATION_ERROR', `${parameter.name} 값이 필요해요.`); continue }
    if (parameter.schema.type === 'integer' && typeof value === 'string' && /^\d+$/.test(value)) value = Number(value)
    if (!compile(parameter.schema)(value)) fail(422, 'VALIDATION_ERROR', `${parameter.name} 값을 확인해 주세요.`)
  }
  if (req.query.from && req.query.to && req.query.from >= req.query.to) fail(422, 'VALIDATION_ERROR', '조회 기간을 확인해 주세요.')
}
