import { projects } from '@/data/projects'
import ProjectRow from '@/components/ProjectRow'

export default function HomePage() {
  return (
    <div className="space-y-32 md:space-y-40">
      <section className="pt-6 md:pt-16">
        <h1 className="font-display uppercase tracking-tight leading-[0.85] text-6xl sm:text-7xl md:text-[9.5rem] drift drift-1">
          <span className="block">William</span>
          <span className="block">Brodhead</span>
        </h1>

        <div className="mt-10 md:mt-12 flex items-center gap-4 drift drift-2">
          <div className="h-px w-12 md:w-20 bg-accent" />
          <p className="font-display uppercase tracking-[0.15em] text-sm md:text-base">
            Systems &amp; Quant
          </p>
        </div>

        <p className="mt-12 md:mt-14 max-w-2xl text-lg md:text-2xl text-fg/90 leading-snug drift drift-3">
          I write Rust, C++, and Python — high-throughput data
          pipelines, low-latency systems, and the occasional machine-learning
          rabbit hole.
        </p>

        <p className="mt-6 max-w-xl text-fg-muted drift drift-4">
          Currently at{' '}
          <a
            href="https://gsmc.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg hover:text-accent underline decoration-1 underline-offset-4 transition-colors"
          >
            Global Strategic Minerals Corporation
          </a>
          . Stamford, Connecticut.
        </p>
      </section>

      <section>
        <div className="flex items-baseline gap-6 mb-2">
          <h2 className="font-display uppercase tracking-tight text-3xl md:text-5xl">
            Work
          </h2>
          <div className="seam flex-1 translate-y-[-0.4em]" />
          <span className="font-mono text-xs text-fg-muted tabular-nums">
            {String(projects.length).padStart(2, '0')}
          </span>
        </div>
        <ul>
          {projects.map((project, i) => (
            <ProjectRow key={project.id} project={project} index={i + 1} />
          ))}
        </ul>
      </section>
    </div>
  )
}
