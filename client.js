/**
 * Composer balance pill.
 *
 * One `conversation.composer.dock` entry beside the turn/speed and token pills,
 * showing the signed-in account's remaining balance as a wallet icon and an
 * amount. The reading comes from the existing account Remote (the same Platform
 * balance the Account settings page shows), refreshed every minute and whenever
 * the window regains focus. No model request is made; signed-out installs and
 * failed reads render nothing.
 */
window.__ModuleLoader__.load({
  id: 'dsh-remaining-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace for tooltip copy. */
    const NS = 'balance-pill'
    /** Balance re-read period; focus and visibility changes read sooner. */
    const REFRESH_MS = 60000
    /** Host route that reports the signed-in account balance. */
    const BALANCE_ROUTE = '/dsh-balance-pill/balance'
    /** `<style>` element id owned by this plugin. */
    const STYLE_ID = 'dsh-balance-pill-style'

    const DICT = {
      zh: {
        balance: '账户余额',
        toppedUp: '充值余额',
        granted: '赠金余额',
        signedOut: '登录后显示余额',
        unavailable: '余额读取失败',
      },
      en: {
        balance: 'Account balance',
        toppedUp: 'Topped-up balance',
        granted: 'Granted balance',
        signedOut: 'Sign in to see your balance',
        unavailable: 'Balance unavailable',
      },
    }

    const CSS = `
.dsh-balance-anchor {
  display: inline-flex;
  min-width: 0;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
}
.dsh-balance-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: var(--dsw-radius-sm);
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  white-space: nowrap;
  cursor: default;
}
.dsh-balance-pill svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.dsh-balance-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-balance-label[data-negative] {
  color: var(--dsw-alias-state-warn-label, inherit);
}
`

    /** Add this plugin's stylesheet once per page. */
    function ensureStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** Remove the stylesheet on plugin teardown. */
    function dropStyles() {
      document.getElementById(STYLE_ID)?.remove()
    }

    /**
     * Copy lookup that survives a missing locale namespace.
     * @param t - slot-bound translator, when the locale service accepted the registration.
     * @returns translator that always yields operator-facing text.
     */
    function translator(t) {
      const fallback = (key) => DICT.zh[key] ?? key
      if (typeof t !== 'function') return fallback
      return (key) => {
        const value = t(key)
        return typeof value === 'string' && value !== key ? value : fallback(key)
      }
    }

    /** Currency glyph for a Platform wallet currency. */
    function currencyGlyph(currency) {
      return currency === 'CNY' ? '¥' : '$'
    }

    /**
     * Format one amount the way the Account settings balance rows do: two
     * decimals, positive sub-cent amounts shown as `<0.01`, negatives rounded
     * with a minimum displayed magnitude of 0.01.
     * @param amount - finite amount in wallet currency.
     * @param currency - wallet currency.
     * @returns display string such as `¥12.34`.
     */
    function formatAmount(amount, currency) {
      const glyph = currencyGlyph(currency)
      if (!Number.isFinite(amount)) return `${glyph}--`
      const magnitude = Math.abs(amount)
      if (magnitude === 0) return `${glyph}0.00`
      if (magnitude < 0.01) return `${amount < 0 ? '-' : ''}${glyph}<0.01`
      const cents = Math.trunc(magnitude * 100 + 1e-9) / 100
      const text = cents.toFixed(2)
      return amount < 0 ? `-${glyph}${text}` : `${glyph}${text}`
    }

    /**
     * Sum recharge and granted wallets per currency. Both are spendable credit,
     * so the pill heads with their total; the tooltip keeps the split.
     * @param balance - a ready balance outcome.
     * @returns non-negative per-currency totals in server order.
     */
    function totals(balance) {
      const sums = new Map()
      for (const wallet of [...balance.value, ...balance.bonusWallets]) {
        const amount = Number(wallet.balance)
        if (!Number.isFinite(amount)) continue
        sums.set(wallet.currency, (sums.get(wallet.currency) ?? 0) + amount)
      }
      return [...sums].map(([currency, amount]) => ({ currency, amount }))
    }

    /**
     * Build the hover/accessible reading: the headlined total plus the charged
     * and granted split the Account settings page shows.
     * @param wallets - ready balance outcome.
     * @param copy - translator.
     * @returns multi-line plain text.
     */
    function describe(wallets, copy) {
      const lines = [copy('balance')]
      for (const wallet of wallets.value) lines.push(`${copy('toppedUp')} ${formatAmount(Number(wallet.balance), wallet.currency)}`)
      for (const wallet of wallets.bonusWallets) lines.push(`${copy('granted')} ${formatAmount(Number(wallet.balance), wallet.currency)}`)
      return lines.join('\n')
    }

    /**
     * One shared balance source for the dock entry, so every registration reads
     * the same snapshot.
     * @param read - reads the current balance outcome from the account Remote.
     * @returns snapshot source plus start/dispose control.
     */
    function createBalance(read) {
      let snapshot = { status: 'loading', wallets: null }
      const listeners = new Set()
      let timer = null
      let inflight = null
      let disposed = false

      const publish = (next) => {
        snapshot = next
        for (const listener of [...listeners]) listener()
      }

      const refresh = () => {
        if (disposed) return Promise.resolve()
        if (inflight !== null) return inflight
        inflight = (async () => {
          try {
            const next = await read()
            if (!disposed) publish(next)
          } catch {
            if (!disposed) publish({ status: 'failed', wallets: null })
          } finally {
            inflight = null
          }
        })()
        return inflight
      }

      const onVisible = () => {
        if (document.visibilityState === 'visible') void refresh()
      }
      const onFocus = () => { void refresh() }

      return {
        source: {
          getSnapshot: () => snapshot,
          subscribe: (listener) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
        },
        start() {
          void refresh()
          timer = setInterval(() => { void refresh() }, REFRESH_MS)
          document.addEventListener('visibilitychange', onVisible)
          window.addEventListener('focus', onFocus)
        },
        dispose() {
          disposed = true
          if (timer !== null) clearInterval(timer)
          timer = null
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('focus', onFocus)
          listeners.clear()
        },
      }
    }

    /** Wallet outline with a coin: reads as money at 14px, inherits the pill color. */
    function WalletIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      },
        h('rect', {
          x: 1.9, y: 4.6, width: 12.2, height: 8.2, rx: 2.1,
          stroke: 'currentColor', strokeWidth: 1.3,
        }),
        h('path', {
          d: 'M4.2 4.6V3.9a1.4 1.4 0 0 1 1.4-1.4h5.2',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
        }),
        h('circle', {
          cx: 11.2, cy: 8.7, r: 1.5,
          stroke: 'currentColor', strokeWidth: 1.2,
        }),
      )
    }

    /**
     * The dock entry: icon plus the headlined balance, with the split on hover.
     * Loading, signed-out, and failed reads render nothing so the row keeps its
     * usual three pills.
     */
    function BalancePill(props) {
      const { useBalance, t } = props
      const snapshot = useBalance((value) => value)
      if (snapshot.status !== 'ready' || snapshot.wallets === null) return null
      const summed = totals(snapshot.wallets)
      if (summed.length === 0) return null
      const head = summed[0]
      const text = formatAmount(head.amount, head.currency)
      const title = describe(snapshot.wallets, translator(t))
      return h('span', { className: 'dsh-balance-anchor' },
        h('span', { className: 'dsh-balance-pill', title, 'aria-label': title },
          h(WalletIcon),
          h('span', { className: 'dsh-balance-label', 'data-negative': head.amount < 0 ? '' : undefined }, text),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ensureStyles()
        ctx.effect(() => () => { dropStyles() }, 'balance-pill: stylesheet')

        /**
         * Read the balance through the Host route. Returns null when the route is
         * missing or refuses, so the caller can fall back to the account Remote.
         */
        const readRoute = async () => {
          try {
            const response = await fetch(BALANCE_ROUTE, {
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) return null
            const payload = await response.json()
            if (payload?.ok !== true) return null
            if (payload.status === 'ready' && Array.isArray(payload.wallets)) {
              return {
                status: 'ready',
                wallets: {
                  status: 'ready',
                  value: payload.wallets,
                  bonusWallets: Array.isArray(payload.bonusWallets) ? payload.bonusWallets : [],
                },
              }
            }
            if (payload.status === 'signed-out') return { status: 'signed-out', wallets: null }
            return { status: 'failed', wallets: null }
          } catch {
            return null
          }
        }

        /** Read the same outcome straight from the account Remote. */
        const readRemote = async () => {
          const account = ctx.remote?.account
          if (account === undefined || typeof account.getBalance !== 'function') throw new Error('account remote unavailable')
          const version = (typeof process !== 'undefined' && process.env !== undefined
            && typeof process.env.DSH_CLIENT_VERSION === 'string')
            ? process.env.DSH_CLIENT_VERSION
            : 'balance-pill'
          const result = await account.getBalance({
            version,
            locale: ctx.locale.getSnapshot().active,
            // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
            timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
          })
          if (!result.ok) throw new Error('balance read failed')
          const value = result.value
          if (value === null || value === undefined) return { status: 'signed-out', wallets: null }
          if (value.status !== 'ready') return { status: 'failed', wallets: null }
          return { status: 'ready', wallets: value }
        }

        /** Host route first; the account Remote keeps the pill working without it. */
        const read = async () => {
          const viaRoute = await readRoute()
          return viaRoute ?? readRemote()
        }

        const balance = createBalance(read)
        ctx.effect(() => () => { balance.dispose() }, 'balance-pill: balance polling')
        balance.start()

        try {
          if (typeof ctx.locale.register === 'function') {
            ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'balance-pill: dictionaries')
          }
        } catch {
          /* the pill falls back to its built-in copy */
        }

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'balance',
          order: 2,
          locale: NS,
          inject: () => ({ hooks: { balance: balance.source } }),
        }, BalancePill))
      },
    }
  },
})
