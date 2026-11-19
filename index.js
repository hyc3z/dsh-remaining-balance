/**
 * Host half of the remaining-balance bundle.
 *
 * The browser half owns the pill and its usage panel; this half answers two
 * read-only JSON routes:
 *
 * | Method | Path                                | Effect                                        |
 * |--------|-------------------------------------|-----------------------------------------------|
 * | GET    | `/dsh-remaining-balance/balance`     | `{ ok, status, wallets?, bonusWallets? }`     |
 * | GET    | `/dsh-remaining-balance/usage`       | `{ ok, status, currencies? }` — today, by key |
 *
 * The balance comes from the `deepseekAccount` service (same source as the
 * Account settings page). Today's usage comes from the Platform usage endpoint
 * the Platform web app itself calls, authorized with the same account grant;
 * only currency totals, API-key names and model names cross the routes — never
 * a credential, token or API key. Nothing here makes a model request.
 *
 * @module dsh-remaining-balance
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Balance route the browser half reads. */
export const BALANCE_ROUTE = '/dsh-remaining-balance/balance'

/** Today's usage route; one Platform read is cached for this long. */
export const USAGE_ROUTE = '/dsh-remaining-balance/usage'

/** Cache lifetime for the usage read; the client also refreshes when reopened. */
const USAGE_TTL_MS = 60 * 1000

/** Nearest write interval for the diagnostics file. */
const DIAGNOSTIC_GAP_MS = 30 * 1000

/** Cordis services this plugin needs before `apply` runs. */
export const inject = ['webServer']

/**
 * Register both routes.
 * @param ctx - Host context with the `webServer` service.
 */
export function apply(ctx) {
  let account = null
  try {
    // The account service is optional: without it both routes report unavailable.
    ctx.inject(['deepseekAccount'], (sub) => {
      account = sub.deepseekAccount
      sub.effect(() => () => { account = null }, 'remaining-balance: account service')
    })
  } catch {
    /* a build without the account service keeps the routes and reports unavailable */
  }

  let writtenAt = 0
  const diagnose = (payload) => {
    const now = Date.now()
    if (now - writtenAt < DIAGNOSTIC_GAP_MS) return
    writtenAt = now
    void (async () => {
      try {
        const dir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'balance-pill')
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'diagnostics.json'), JSON.stringify({ at: new Date(now).toISOString(), ...payload }), 'utf8')
      } catch {
        /* diagnostics are optional */
      }
    })()
  }

  const cache = { at: 0, value: null }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: BALANCE_ROUTE,
    handler: async (request, response) => {
      const method = methodOf(request)
      if (method !== 'GET' && method !== 'HEAD') {
        respond(response, 405, { ok: false, error: 'method not allowed' }, false)
        return
      }
      let payload
      try {
        payload = await readBalance(account)
      } catch (error) {
        payload = { status: 'failed', error: String(error?.message ?? error) }
      }
      diagnose({ route: 'balance', status: payload.status })
      respond(response, 200, { ok: true, ...payload }, method === 'HEAD')
    },
  }), 'remaining-balance: balance route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: USAGE_ROUTE,
    handler: async (request, response) => {
      const method = methodOf(request)
      if (method !== 'GET' && method !== 'HEAD') {
        respond(response, 405, { ok: false, error: 'method not allowed' }, false)
        return
      }
      let payload
      try {
        if (cache.value !== null && Date.now() - cache.at < USAGE_TTL_MS) {
          payload = cache.value
        } else {
          payload = await readUsage(account)
          if (payload.status === 'ready' || payload.status === 'empty') {
            cache.at = Date.now()
            cache.value = payload
          }
        }
      } catch (error) {
        payload = { status: 'failed', error: String(error?.message ?? error) }
      }
      diagnose({ route: 'usage', status: payload.status })
      respond(response, 200, { ok: true, ...payload }, method === 'HEAD')
    },
  }), 'remaining-balance: usage route')
}

/**
 * Read the current account balance.
 * @param account - the optional `deepseekAccount` service.
 * @returns outcome plus wallet rows when ready.
 */
async function readBalance(account) {
  if (account === null || typeof account.getBalance !== 'function') return { status: 'unavailable' }
  const value = await account.getBalance({
    version: 'remaining-balance',
    locale: 'zh-CN',
    // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  })
  if (value === null || value === undefined) return { status: 'signed-out' }
  if (value.status !== 'ready') return { status: 'failed' }
  return { status: 'ready', wallets: value.value, bonusWallets: value.bonusWallets }
}

/**
 * Read today's cost per API key and model from Platform.
 *
 * The Platform usage endpoint requires a whole local day: `start` is local
 * midnight (seconds), `end` is the next local midnight, `tz` is the offset in
 * seconds east. Any narrower window answers `INVALID_PARAM`.
 *
 * @param account - the optional `deepseekAccount` service.
 * @returns ready currencies, an empty day, or a failure outcome.
 */
async function readUsage(account) {
  if (account === null || typeof account.getPlatformSession !== 'function') return { status: 'unavailable' }
  const session = await account.getPlatformSession()
  if (session === null) return { status: 'signed-out' }
  const tz = -new Date().getTimezoneOffset() * 60
  const start = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000)
  const end = start + 86400
  const query = new URLSearchParams({ start: String(start), end: String(end), tz: String(tz) })
  const url = session.origin + '/api/v0/usage/by_api_key/cost?' + query.toString()
  const headers = {
    accept: 'application/json',
    'x-dsh-auth-token': session.token,
    'x-client-bundle-id': '',
    'x-client-platform': 'desktop-win',
    'x-client-version': process.env.DSH_CLIENT_VERSION ?? 'remaining-balance',
    'x-client-locale': 'zh_CN',
    'x-client-timezone-offset': String(tz),
    ...session.requestHeaders,
  }
  const response = await fetch(url, { headers, redirect: 'error' })
  if (!response.ok) return { status: 'failed', error: 'usage http ' + response.status }
  const payload = await response.json()
  const biz = payload?.data
  if (!biz || biz.biz_code !== 0 || biz.biz_data === null) {
    return { status: 'failed', error: biz?.biz_msg ?? 'usage refused' }
  }
  const currencies = summarizeUsage(biz.biz_data)
  return { status: currencies.length === 0 ? 'empty' : 'ready', start, end, tz, currencies }
}

/**
 * Fold the Platform series into per-currency, per-key, per-model costs.
 * @param bizData - Platform `biz_data` payload.
 * @returns currencies with positive totals only.
 */
function summarizeUsage(bizData) {
  const currencies = []
  for (const entry of Array.isArray(bizData.data) ? bizData.data : []) {
    const currency = typeof entry.currency === 'string' ? entry.currency : 'CNY'
    const keys = new Map()
    for (const series of Array.isArray(entry.series) ? entry.series : []) {
      const apiKey = series.api_key ?? {}
      const id = apiKey.tracking_id ?? apiKey.name ?? 'unknown'
      const row = keys.get(id) ?? {
        id,
        name: typeof apiKey.name === 'string' && apiKey.name.length > 0
          ? apiKey.name
          : apiKey.key_type === 'DSH' ? 'DeepSeek Harness' : String(id).slice(0, 8),
        keyType: typeof apiKey.key_type === 'string' ? apiKey.key_type : '',
        models: new Map(),
      }
      const model = typeof series.model === 'string' ? series.model : 'unknown'
      let amount = 0
      for (const bucket of Array.isArray(series.buckets) ? series.buckets : []) {
        const cost = Number(bucket.cost)
        if (Number.isFinite(cost)) amount += cost
      }
      row.models.set(model, (row.models.get(model) ?? 0) + amount)
      keys.set(id, row)
    }
    const rows = [...keys.values()]
      .map((row) => ({
        id: row.id,
        name: row.name,
        keyType: row.keyType,
        models: [...row.models]
          .map(([model, amount]) => ({ model, amount }))
          .sort((a, b) => b.amount - a.amount),
        amount: [...row.models.values()].reduce((sum, amount) => sum + amount, 0),
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    if (rows.length === 0) continue
    currencies.push({
      currency,
      total: rows.reduce((sum, row) => sum + row.amount, 0),
      keys: rows,
    })
  }
  return currencies
}

/**
 * Normalize the request method.
 * @param request - incoming HTTP request.
 * @returns upper-case method.
 */
function methodOf(request) {
  return String(request.method ?? 'GET').toUpperCase()
}

/**
 * Write one JSON response.
 * @param response - response to complete.
 * @param status - HTTP status code.
 * @param payload - JSON-serializable body.
 * @param headOnly - omit the body (HEAD requests).
 */
function respond(response, status, payload, headOnly) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(headOnly ? undefined : body)
}
