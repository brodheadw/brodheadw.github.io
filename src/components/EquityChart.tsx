'use client'

import { useId, useState } from 'react'

export interface EquitySeries {
  name: string
  /** Growth-of-$1 values, aligned with `dates`. */
  values: number[]
}

interface Props {
  dates: string[]
  series: EquitySeries[]
  /** Series name to highlight in the accent colour (e.g. "CRISP (g=0.5)"). */
  highlight?: string
}

const W = 920
const H = 460
const PAD = { top: 20, right: 16, bottom: 34, left: 48 }

/**
 * Dependency-free log-scale equity chart. The y-axis is log10 because these are
 * growth-of-$1 curves compounding over ~15 years — a linear axis would crush
 * the early years into the floor. Everything is plain SVG so it matches the
 * site's no-charting-library aesthetic and ships nothing to the bundle.
 */
export default function EquityChart({ dates, series, highlight }: Props) {
  const clipId = useId()
  const [active, setActive] = useState<string | null>(null)

  const n = dates.length
  const allValues = series.flatMap((s) => s.values).filter((v) => v > 0)
  const loV = Math.min(...allValues)
  const hiV = Math.max(...allValues)
  const loL = Math.log10(loV)
  const hiL = Math.log10(hiV)

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const x = (i: number) => PAD.left + (i / (n - 1)) * plotW
  const y = (v: number) =>
    PAD.top + plotH - ((Math.log10(v) - loL) / (hiL - loL)) * plotH

  const path = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ')

  // Log gridlines at each power of 10 inside the range (e.g. $1, $3, $10).
  const ticks: number[] = []
  for (let p = Math.ceil(loL); p <= Math.floor(hiL); p++) ticks.push(10 ** p)
  // year labels: roughly every ~1/6 of the span
  const yearIdxs = Array.from({ length: 6 }, (_, k) =>
    Math.round((k / 5) * (n - 1)),
  )

  return (
    <figure className="emerge -mx-2 md:mx-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Growth of $1, log scale, out-of-sample equity curves"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
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
              ${t >= 1 ? t.toLocaleString() : t}
            </text>
          </g>
        ))}

        {/* x labels (years) */}
        {yearIdxs.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 12}
            textAnchor="middle"
            className="fill-[var(--color-fg-muted)] font-mono"
            fontSize={10}
          >
            {dates[i]?.slice(0, 4)}
          </text>
        ))}

        {/* curves */}
        <g clipPath={`url(#${clipId})`} fill="none">
          {series.map((s) => {
            const isHi = s.name === highlight
            const isActive = active === s.name
            const dim = active !== null && !isActive
            return (
              <path
                key={s.name}
                d={path(s.values)}
                stroke={isHi ? 'var(--color-accent)' : 'var(--color-fg-muted)'}
                strokeWidth={isHi || isActive ? 2.4 : 1}
                strokeOpacity={dim ? 0.18 : isHi || isActive ? 1 : 0.5}
                className="transition-[stroke-opacity,stroke-width] duration-300"
              />
            )
          })}
        </g>
      </svg>

      {/* legend doubles as hover control */}
      <figcaption className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s) => {
          const isHi = s.name === highlight
          return (
            <button
              key={s.name}
              type="button"
              onMouseEnter={() => setActive(s.name)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.name)}
              onBlur={() => setActive(null)}
              className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-fg-muted hover:text-fg transition-colors"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-3"
                style={{
                  background: isHi
                    ? 'var(--color-accent)'
                    : 'var(--color-fg-muted)',
                }}
              />
              {s.name}
            </button>
          )
        })}
      </figcaption>
    </figure>
  )
}
