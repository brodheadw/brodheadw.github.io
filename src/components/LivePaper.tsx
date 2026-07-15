'use client'

import { useEffect, useId, useState } from 'react'

const PAPER_URL =
  'https://raw.githubusercontent.com/brodheadw/crisp-portfolio/main/paper/paper.json'

interface Holding {
  ticker: string
  weight: number
}

interface Paper {
  strategy: string
  inception: string | null
  as_of: string | null
  initial_capital: number
  value: number | null
  rebalances: number
  last_rebalance: string | null
  cadence_days: number
  holdings: Holding[]
  equity: { dates: string[]; series: number[] }
}

const W = 920
const H = 300
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }

function MiniChart({ dates, series }: { dates: string[]; series: number[] }) {
  const clipId = useId()
  const [hover, setHover] = useState<number | null>(null)
  const n = series.length
  const lo = Math.min(...series, 1)
  const hi = Math.max(...series, 1)
  const span = hi - lo || 1
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  // Index spacing: the feed is uniformly hourly (market hours only), so equal
  // steps per point skips closed-market gaps, like a standard intraday chart.
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - lo) / span) * plotH
  const path = series
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')

  const ticks = [lo, (lo + hi) / 2, hi]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label="Live paper-portfolio equity curve"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const xv = ((e.clientX - r.left) / r.width) * W
        const i = Math.round(((xv - PAD.left) / plotW) * (n - 1))
        setHover(Math.max(0, Math.min(n - 1, i)))
      }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={y(t) + 3}
            textAnchor="end"
            className="fill-[var(--color-fg-muted)] font-mono"
            fontSize={10}
          >
            {t.toFixed(2)}×
          </text>
        </g>
      ))}
      <g clipPath={`url(#${clipId})`}>
        {n === 1 ? (
          <circle cx={x(0)} cy={y(series[0])} r={3} fill="var(--color-accent)" />
        ) : (
          <path
            d={path}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
          />
        )}
      </g>
      {[0, n - 1].map((i) =>
        dates[i] ? (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : 'end'}
            className="fill-[var(--color-fg-muted)] font-mono"
            fontSize={10}
          >
            {dates[i]}
          </text>
        ) : null,
      )}

      {/* hover crosshair + readout */}
      {hover !== null && n > 1 && (() => {
        const hx = x(hover)
        const right = hx > W / 2
        const tx = Math.min(Math.max(hx + (right ? -8 : 8), PAD.left), W - PAD.right)
        const anchor = right ? 'end' : 'start'
        return (
          <g pointerEvents="none">
            <line
              x1={hx}
              x2={hx}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--color-fg-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <circle
              cx={hx}
              cy={y(series[hover])}
              r={4}
              fill="var(--color-accent)"
              stroke="var(--color-bg)"
              strokeWidth={1.5}
            />
            <text
              x={tx}
              y={PAD.top + 13}
              textAnchor={anchor}
              className="fill-[var(--color-fg)] font-mono"
              fontSize={13}
            >
              {series[hover].toFixed(4)}×
            </text>
            <text
              x={tx}
              y={PAD.top + 27}
              textAnchor={anchor}
              className="fill-[var(--color-fg-muted)] font-mono"
              fontSize={10}
            >
              {dates[hover]}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

export default function LivePaper() {
  const [data, setData] = useState<Paper | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(PAPER_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) {
    return (
      <p className="font-mono text-xs text-fg-muted">
        Live paper data is temporarily unavailable.
      </p>
    )
  }
  if (!data) {
    return (
      <p className="font-mono text-xs text-fg-muted animate-pulse">
        Loading live paper portfolio…
      </p>
    )
  }

  const growth = data.equity.series.at(-1) ?? 1
  const retPct = (growth - 1) * 100
  const up = retPct >= 0
  const top = data.holdings.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 font-mono text-sm">
        <span className="text-fg-muted">
          since <span className="text-fg/90">{data.inception ?? '—'}</span>
        </span>
        <span className="text-fg-muted">
          as of <span className="text-fg/90">{data.as_of ?? '—'}</span>
        </span>
        <span className="text-fg-muted">
          value{' '}
          <span className="text-fg/90 tabular-nums">
            {data.value != null
              ? `$${data.value.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`
              : '—'}
          </span>
        </span>
        <span className="text-fg-muted">
          return{' '}
          <span
            className="tabular-nums"
            style={{ color: up ? 'var(--color-fg)' : 'var(--color-accent)' }}
          >
            {up ? '+' : ''}
            {retPct.toFixed(2)}%
          </span>
        </span>
        <span className="text-fg-muted">
          rebalances{' '}
          <span className="text-fg/90 tabular-nums">{data.rebalances}</span>
        </span>
      </div>

      {data.equity.series.length <= 1 ? (
        <p className="font-mono text-xs text-fg-muted">
          Just opened. The curve fills in as the daily job runs.
        </p>
      ) : (
        <MiniChart dates={data.equity.dates} series={data.equity.series} />
      )}

      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
          Current target weights, top {top.length}
        </p>
        <ul className="space-y-1.5">
          {top.map((h) => {
            const w = h.weight * 100
            const long = h.weight >= 0
            return (
              <li
                key={h.ticker}
                className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-3 font-mono text-xs"
              >
                <span className="text-fg/90">{h.ticker}</span>
                <span className="relative h-2 bg-border/40">
                  <span
                    className="absolute inset-y-0 left-0"
                    style={{
                      width: `${Math.min(Math.abs(w) * 3, 100)}%`,
                      background: long
                        ? 'var(--color-fg-muted)'
                        : 'var(--color-accent)',
                    }}
                  />
                </span>
                <span className="text-right tabular-nums text-fg-muted">
                  {w >= 0 ? '+' : ''}
                  {w.toFixed(1)}%
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="font-mono text-[10px] text-fg-muted/70 leading-relaxed">
        Self-simulated on delayed public prices. Not a brokerage account, not
        investment advice. Rebalances every {data.cadence_days} trading days.
      </p>
    </div>
  )
}
