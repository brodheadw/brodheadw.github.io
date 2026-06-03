import Link from 'next/link'
import EquityChart, { EquitySeries } from '@/components/EquityChart'
import LivePaper from '@/components/LivePaper'
import results from '@/data/crisp-results.json'

export const metadata = {
  title: 'CRISP — Portfolio Construction',
  description:
    'Reproducing the hierarchical and iterative mean-variance portfolio methods from Wuebben (2026), with a walk-forward backtest 2010–2026.',
}

const HIGHLIGHT = 'CRISP (g=0.5)'

interface Stat {
  ann_return: number
  ann_vol: number
  sharpe: number
  max_drawdown: number
  avg_turnover: number
}

type Meta = {
  tickers: string[]
  start: string
  end: string
  lookback: number
  rebalance_every: number
  cost_bps: number
  source?: string
}

const meta = results.meta as Meta
const stats = results.stats as Record<string, Stat>
const equity = results.equity as {
  dates: string[]
  series: Record<string, number[]>
}

/** Evenly downsample to at most `target` points so we ship ~hundreds, not
 *  thousands, of values to the client. The last point is always kept. */
function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = (arr.length - 1) / (target - 1)
  const out: T[] = []
  for (let i = 0; i < target; i++) out.push(arr[Math.round(i * step)])
  return out
}

const TARGET_POINTS = 320
const idxDates = downsample(
  equity.dates.map((_, i) => i),
  TARGET_POINTS,
)
const dates = idxDates.map((i) => equity.dates[i])

// Order series so the highlight draws last (on top); rest by final equity.
const seriesNames = Object.keys(equity.series).sort((a, b) => {
  if (a === HIGHLIGHT) return 1
  if (b === HIGHLIGHT) return -1
  const fa = equity.series[a].at(-1) ?? 0
  const fb = equity.series[b].at(-1) ?? 0
  return fa - fb
})
const chartSeries: EquitySeries[] = seriesNames.map((name) => ({
  name,
  values: idxDates.map((i) => equity.series[name][i]),
}))

const rows = Object.entries(stats).sort((a, b) => b[1].sharpe - a[1].sharpe)

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const num = (x: number) => x.toFixed(2)

export default function CrispPage() {
  return (
    <article className="space-y-16 md:space-y-24">
      <header className="emerge">
        <Link
          href="/"
          className="font-mono text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-accent transition-colors"
        >
          ← Work
        </Link>
        <h1 className="mt-6 font-display font-bold uppercase tracking-tight leading-[0.85] text-5xl md:text-[8rem]">
          CRISP
        </h1>
        <div className="mt-8 h-px w-20 bg-accent" />
        <p className="mt-8 max-w-2xl text-lg md:text-xl text-fg/90 leading-relaxed">
          A reproduction of the hierarchical and iterative mean-variance
          portfolio methods from{' '}
          <a
            href="https://arxiv.org/abs/2604.23833"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-4 hover:text-accent transition-colors"
          >
            Wuebben (2026)
          </a>{' '}
          — building on de Prado&rsquo;s Hierarchical Risk Parity and
          Cotton&rsquo;s Schur-complement allocation — benchmarked against the
          classical baselines in a walk-forward backtest.
        </p>
      </header>

      <section className="emerge space-y-6">
        <div className="flex items-baseline gap-6">
          <h2 className="font-display font-semibold uppercase tracking-tight text-3xl md:text-5xl">
            Live
          </h2>
          <div className="seam flex-1 translate-y-[-0.4em]" />
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
            ● paper
          </span>
        </div>
        <p className="max-w-2xl text-fg/80 leading-relaxed">
          A self-simulated paper portfolio running {HIGHLIGHT} forward on
          delayed public prices — a daily job marks it to market and rebalances
          on the backtest&rsquo;s cadence. Not a brokerage account.
        </p>
        <LivePaper />
      </section>

      <section className="emerge space-y-6">
        <div className="flex items-baseline gap-6">
          <h2 className="font-display font-semibold uppercase tracking-tight text-3xl md:text-5xl">
            Growth of $1
          </h2>
          <div className="seam flex-1 translate-y-[-0.4em]" />
        </div>
        <p className="max-w-2xl text-fg/80 leading-relaxed">
          Out-of-sample equity curves, log scale. {HIGHLIGHT} in{' '}
          <span className="text-accent">accent</span>; hover a name to isolate a
          method.
        </p>
        <EquityChart dates={dates} series={chartSeries} highlight={HIGHLIGHT} />
      </section>

      <section className="emerge space-y-6">
        <div className="flex items-baseline gap-6">
          <h2 className="font-display font-semibold uppercase tracking-tight text-3xl md:text-5xl">
            Performance
          </h2>
          <div className="seam flex-1 translate-y-[-0.4em]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-border text-fg-muted text-left">
                <th className="py-3 pr-4 font-normal">Method</th>
                <th className="py-3 px-3 font-normal text-right">Ann. Return</th>
                <th className="py-3 px-3 font-normal text-right">Ann. Vol</th>
                <th className="py-3 px-3 font-normal text-right">Sharpe</th>
                <th className="py-3 px-3 font-normal text-right">Max DD</th>
                <th className="py-3 pl-3 font-normal text-right">Turnover</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, s]) => {
                const hi = name === HIGHLIGHT
                return (
                  <tr
                    key={name}
                    className={`border-b border-border/60 ${
                      hi ? 'text-accent' : 'text-fg/90'
                    }`}
                  >
                    <td className="py-3 pr-4 whitespace-nowrap">{name}</td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {pct(s.ann_return)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {pct(s.ann_vol)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold">
                      {num(s.sharpe)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {pct(s.max_drawdown)}
                    </td>
                    <td className="py-3 pl-3 text-right tabular-nums">
                      {pct(s.avg_turnover)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="emerge space-y-6">
        <div className="flex items-baseline gap-6">
          <h2 className="font-display font-semibold uppercase tracking-tight text-3xl md:text-5xl">
            Setup
          </h2>
          <div className="seam flex-1 translate-y-[-0.4em]" />
        </div>
        <dl className="grid grid-cols-[8rem_1fr] md:grid-cols-[10rem_1fr] gap-y-4 text-sm md:text-base max-w-2xl">
          <dt className="text-fg-muted">Universe</dt>
          <dd className="font-mono text-fg/90">
            {meta.tickers.length} assets · {meta.tickers.join(' · ')}
          </dd>
          <dt className="text-fg-muted">Window</dt>
          <dd className="text-fg/90">
            {meta.start} → {meta.end}
          </dd>
          <dt className="text-fg-muted">Lookback</dt>
          <dd className="text-fg/90">{meta.lookback} trading days</dd>
          <dt className="text-fg-muted">Rebalance</dt>
          <dd className="text-fg/90">every {meta.rebalance_every} days</dd>
          <dt className="text-fg-muted">Cost</dt>
          <dd className="text-fg/90">{meta.cost_bps} bps / turnover</dd>
        </dl>
        <p className="pt-2">
          <a
            href="https://github.com/brodheadw/crisp-portfolio"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-accent transition-colors"
          >
            Source on GitHub →
          </a>
        </p>
      </section>
    </article>
  )
}
