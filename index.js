/**
 * Host half of the balance pill bundle.
 *
 * The browser half owns the pill; this half answers one JSON route with the
 * signed-in account's balance, read through the same `deepseekAccount` service
 * the Account settings page and other plugins use:
 *
 * | Method | Path                          | Effect                                    |
 * |--------|-------------------------------|-------------------------------------------|
 * | GET    | `/dsh-balance-pill/balance`   | `{ ok, status, wallets?, bonusWallets? }` |
 *
 * Only outcomes and wallet amounts cross the route; no credential, key or token
 * is read, stored, or returned. One small diagnostics file records the last few
 * outcomes so a missing pill can be diagnosed without browser tooling. Nothing
 * here makes a model request.
 *
 * @module @local/balance-pill
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Route the browser half reads. */
export const BALANCE_ROUTE = '/dsh-balance-pill/balance'

/** Nearest write interval for the diagnostics file; the pill reads once a minute. */
const DIAGNOSTIC_GAP_MS = 30 * 1000

/** Cordis services this plugin needs before `apply` runs. */
export const inject = ['webServer']

/**
 * Register the balance route.
 *
 * @param ctx - Host context with the `webServer` service.
 */
export function apply(ctx) {
  let account = null
  try {
    // The account service is optional: without it the route reports unavailable.
    ctx.inject(['deepseekAccount'], (sub) => {
      account = sub.deepseekAccount
      sub.effect(() => () => { account = null }, 'balance-pill: account service')
    })
  } catch {
    /* a build without the account service keeps the route and reports unavailable */
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

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: BALANCE_ROUTE,
    handler: async (request, response) => {
      const method = String(request.method ?? 'GET').toUpperCase()
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
      diagnose({ status: payload.status })
      respond(response, 200, { ok: true, ...payload }, method === 'HEAD')
    },
  }), 'balance-pill: balance route')
}

/**
 * Read the current account balance.
 * @param account - the optional `deepseekAccount` service.
 * @returns outcome plus wallet rows when ready.
 */
async function readBalance(account) {
  if (account === null || typeof account.getBalance !== 'function') return { status: 'unavailable' }
  const value = await account.getBalance({
    version: 'balance-pill',
    locale: 'zh-CN',
    // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  })
  if (value === null || value === undefined) return { status: 'signed-out' }
  if (value.status !== 'ready') return { status: 'failed' }
  return { status: 'ready', wallets: value.value, bonusWallets: value.bonusWallets }
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
