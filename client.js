/**
 * Remaining-balance pill.
 *
 * One `conversation.composer.dock` entry beside the turn/speed and token pills:
 * a wallet icon and the signed-in account's remaining balance. Clicking it opens
 * a small panel with today's cost per API key and model, laid out like the
 * built-in statistics dialogs and read from the platform usage data the
 * DeepSeek Platform usage page shows. The reading refreshes every minute and
 * whenever the window regains focus; the panel refreshes when reopened.
 *
 * Both values come from the Host half's routes, which use the account service.
 * No model request is made; signed-out installs and failed reads render nothing.
 */
window.__ModuleLoader__.load({
  id: 'dsh-remaining-balance',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    /** Portal so the panel lives outside the composer's layout and clipping. */
    let createPortal = null
    try {
      const reactDom = require('react-dom')
      if (typeof reactDom?.createPortal === 'function') createPortal = reactDom.createPortal
    } catch {
      /* the inline fallback still renders the panel */
    }

    /** Locale namespace for tooltip and panel copy. */
    const NS = 'remaining-balance'
    /** Balance re-read period; focus and visibility changes read sooner. */
    const REFRESH_MS = 60000
    /** Usage cache lifetime inside one page. */
    const USAGE_TTL_MS = 60000
    /** Routes served by the Host half. */
    const BALANCE_ROUTE = '/dsh-remaining-balance/balance'
    const USAGE_ROUTE = '/dsh-remaining-balance/usage'
    /** Panel width; the placement math keeps it inside the viewport. */
    const PANEL_WIDTH = 300
    /** `<style>` element id owned by this plugin. */
    const STYLE_ID = 'dsh-remaining-balance-style'

    const DICT = {
      zh: {
        balance: '账户余额',
        toppedUp: '充值余额',
        granted: '赠金余额',
        usage: '今日用量',
        loading: '正在读取…',
        empty: '今天还没有用量',
        failed: '暂时读不到今日用量',
        signedOut: '登录后查看用量',
        range: '今日 00:00–24:00',
        updated: '更新于',
        open: '查看今日用量',
      },
      en: {
        balance: 'Account balance',
        toppedUp: 'Topped-up balance',
        granted: 'Granted balance',
        usage: "Today's usage",
        loading: 'Loading…',
        empty: 'No usage today',
        failed: "Today's usage is unavailable",
        signedOut: 'Sign in to see usage',
        range: 'Today 00:00–24:00',
        updated: 'Updated',
        open: "Show today's usage",
      },
    }

    const CSS = `
.dsh-rb-anchor {
  display: inline-flex;
  min-width: 0;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
}
.dsh-rb-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  padding: 1px 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-rb-pill svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.dsh-rb-pill[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
@media (hover: hover) {
  .dsh-rb-pill:hover {
    background: var(--dsw-alias-interactive-bg-hover);
    color: var(--dsw-alias-label-secondary);
  }
}
.dsh-rb-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-rb-label[data-negative] {
  color: var(--dsw-alias-state-warn-label, inherit);
}
.dsh-rb-panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: 300px;
  max-width: min(440px, calc(100vw - 24px));
  max-height: min(360px, calc(100dvh - 24px));
  overflow-x: hidden;
  overflow-y: auto;
  pointer-events: auto;
  padding: 16px;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dsh-rb-section + .dsh-rb-section {
  margin-top: 14px;
}
.dsh-rb-title {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
.dsh-rb-titlelabel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dsh-rb-titlelabel svg {
  width: 14px;
  height: 14px;
  flex: none;
}
.dsh-rb-titlevalue {
  font-variant-numeric: tabular-nums;
}
.dsh-rb-rule {
  margin-bottom: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-rb-details {
  display: grid;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-rb-details dt,
.dsh-rb-details dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-rb-details dd {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dsh-rb-sub {
  font-size: 11px;
  line-height: 16px;
}
.dsh-rb-details dt.dsh-rb-sub {
  padding-left: 10px;
}
.dsh-rb-note {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-rb-foot {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
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
      return currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `
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
     * @returns per-currency totals in server order.
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
     * Build the hover/accessible balance reading: the headlined total plus the
     * charged and granted split the Account settings page shows.
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
     * @param read - reads the current balance outcome from the Host route.
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

    /**
     * Today's usage reader with a short cache, refreshed when the panel reopens.
     * @returns loader used by the panel.
     */
    function createUsage() {
      let cached = null
      let cachedAt = 0
      let inflight = null
      return {
        load() {
          if (cached !== null && Date.now() - cachedAt < USAGE_TTL_MS) return Promise.resolve(cached)
          if (inflight !== null) return inflight
          inflight = (async () => {
            try {
              const response = await fetch(USAGE_ROUTE, {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { accept: 'application/json' },
              })
              if (!response.ok) throw new Error('usage route answered ' + response.status)
              const payload = await response.json()
              if (payload?.ok !== true) throw new Error('usage route refused')
              const value = {
                status: typeof payload.status === 'string' ? payload.status : 'failed',
                currencies: Array.isArray(payload.currencies) ? payload.currencies : [],
                refreshedAt: Date.now(),
              }
              if (value.status === 'ready' || value.status === 'empty') {
                cached = value
                cachedAt = Date.now()
              }
              return value
            } finally {
              inflight = null
            }
          })()
          return inflight
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
     * Panel body: today's total and the per-key, per-model split.
     * @param props - usage result and translator.
     */
    function UsagePanelBody(props) {
      const { usage, copy } = props
      if (usage.status === 'loading') return h('div', { className: 'dsh-rb-note' }, copy('loading'))
      if (usage.status === 'signed-out') return h('div', { className: 'dsh-rb-note' }, copy('signedOut'))
      if (usage.status === 'empty') return h('div', { className: 'dsh-rb-note' }, copy('empty'))
      if (usage.status !== 'ready') return h('div', { className: 'dsh-rb-note' }, copy('failed'))
      return h('div', null, usage.currencies.map((section) => h('div', { className: 'dsh-rb-section', key: section.currency },
        h('div', { className: 'dsh-rb-title' },
          h('span', { className: 'dsh-rb-titlelabel' }, h(WalletIcon), h('span', null, copy('usage'))),
          h('span', { className: 'dsh-rb-titlevalue' }, formatAmount(section.total, section.currency)),
        ),
        h('div', { className: 'dsh-rb-rule' }),
        h('dl', { className: 'dsh-rb-details' },
          section.keys.map((row) => [
            h('dt', { key: row.id + ':name' }, row.name),
            h('dd', { key: row.id + ':amount' }, formatAmount(row.amount, section.currency)),
            ...row.models.filter((model) => model.amount > 0).flatMap((model) => [
              h('dt', { key: row.id + ':' + model.model, className: 'dsh-rb-sub' }, model.model),
              h('dd', { key: row.id + ':' + model.model + ':amount', className: 'dsh-rb-sub' }, formatAmount(model.amount, section.currency)),
            ]),
          ]),
        ),
      )))
    }

    /**
     * The dock entry: the pill plus its click-opened usage panel.
     * Loading, signed-out, and failed balance reads render nothing so the row
     * keeps its usual three pills.
     * @param props - injected balance hook, usage loader, and translator.
     */
    function BalancePill(props) {
      const { useBalance, usage, t } = props
      const snapshot = useBalance((value) => value)
      const [open, setOpen] = React.useState(false)
      const [placement, setPlacement] = React.useState(null)
      const [result, setResult] = React.useState({ status: 'loading' })
      const anchor = React.useRef(null)
      const panel = React.useRef(null)
      const openedAt = React.useRef(0)
      const copy = translator(t)

      React.useEffect(() => {
        if (!open) return undefined
        let cancelled = false
        setResult({ status: 'loading' })
        usage.load()
          .then((value) => { if (!cancelled) setResult(value) })
          .catch(() => { if (!cancelled) setResult({ status: 'failed', currencies: [] }) })
        return () => { cancelled = true }
      }, [open, usage])

      React.useEffect(() => {
        if (!open) return undefined
        const recent = () => Date.now() - openedAt.current < 350
        const onPointerDown = (event) => {
          if (recent()) return
          const target = event.target
          if (panel.current?.contains(target) === true) return
          if (anchor.current?.contains(target) === true) return
          setOpen(false)
        }
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
        // The click that opens the panel may scroll a container while it settles;
        // ignoring the first moments keeps one click from closing what it opened.
        const onScroll = (event) => {
          if (recent()) return
          if (event.target === document || event.target === document.documentElement) setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        window.addEventListener('scroll', onScroll, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('scroll', onScroll, true)
        }
      }, [open])

      if (snapshot.status !== 'ready' || snapshot.wallets === null) return null
      const summed = totals(snapshot.wallets)
      if (summed.length === 0) return null
      const head = summed[0]
      const text = formatAmount(head.amount, head.currency)
      const title = describe(snapshot.wallets, copy)

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        openedAt.current = Date.now()
        const rect = anchor.current?.getBoundingClientRect()
        if (rect !== undefined && rect !== null) {
          const left = Math.min(Math.max(8, rect.left + rect.width / 2 - PANEL_WIDTH / 2), window.innerWidth - PANEL_WIDTH - 8)
          setPlacement({ left, bottom: window.innerHeight - rect.top + 8 })
        }
        setOpen(true)
      }

      const panelElement = open && placement !== null ? h('div', {
        className: 'dsh-rb-panel',
        role: 'dialog',
        'aria-label': copy('usage'),
        ref: panel,
        style: { left: placement.left + 'px', bottom: placement.bottom + 'px' },
      },
        h(UsagePanelBody, { usage: result, copy }),
        h('div', { className: 'dsh-rb-foot' },
          h('span', null, copy('range')),
          h('span', null, copy('updated') + ' ' + new Date((result.refreshedAt ?? Date.now())).toTimeString().slice(0, 5)),
        ),
      ) : null

      return h('span', { className: 'dsh-rb-anchor', ref: anchor },
        h('button', {
          type: 'button',
          className: 'dsh-rb-pill',
          title,
          'aria-label': copy('open'),
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: toggle,
        },
          h(WalletIcon),
          h('span', { className: 'dsh-rb-label', 'data-negative': head.amount < 0 ? '' : undefined }, text),
        ),
        panelElement !== null && createPortal !== null ? createPortal(panelElement, document.body) : panelElement,
      )
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ensureStyles()
        ctx.effect(() => () => { dropStyles() }, 'remaining-balance: stylesheet')

        /** Balance route first, then the account Remote as a fallback. */
        const readBalance = async () => {
          try {
            const response = await fetch(BALANCE_ROUTE, {
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
            if (response.ok) {
              const payload = await response.json()
              if (payload?.ok === true) {
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
                if (payload.status === 'failed' || payload.status === 'unavailable') return { status: 'failed', wallets: null }
              }
            }
          } catch {
            /* fall through to the Remote */
          }
          const account = ctx.remote?.account
          if (account === undefined || account === null || typeof account.getBalance !== 'function') {
            throw new Error('account remote unavailable')
          }
          const version = (typeof process !== 'undefined' && process.env !== undefined
            && typeof process.env.DSH_CLIENT_VERSION === 'string')
            ? process.env.DSH_CLIENT_VERSION
            : 'remaining-balance'
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

        const balance = createBalance(readBalance)
        ctx.effect(() => () => { balance.dispose() }, 'remaining-balance: balance polling')
        balance.start()

        try {
          if (typeof ctx.locale.register === 'function') {
            ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'remaining-balance: dictionaries')
          }
        } catch {
          /* the pill falls back to its built-in copy */
        }

        const usage = createUsage()
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'balance',
          order: 2,
          locale: NS,
          inject: () => ({ hooks: { balance: balance.source }, usage }),
        }, BalancePill))
      },
    }
  },
})
