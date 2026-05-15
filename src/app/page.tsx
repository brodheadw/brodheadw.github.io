import { projects } from '@/data/projects'
import ProjectRow from '@/components/ProjectRow'

export default function HomePage() {
  return (
    <div className="space-y-40 md:space-y-56">
      <section className="relative pt-6 md:pt-20 pb-12">
        <div className="moon" aria-hidden />

        <div className="relative z-10">
          <h1 className="font-display font-black uppercase tracking-[-0.02em] leading-[0.82] text-7xl sm:text-8xl md:text-[14rem] lg:text-[16rem] emerge emerge-1">
            <span className="block">William</span>
            <span className="block">Brodhead</span>
          </h1>

          <div className="mt-12 md:mt-16 flex items-center gap-4 emerge emerge-2">
            <div className="h-px w-12 md:w-24 bg-accent" />
            <p className="font-display font-bold uppercase tracking-[0.18em] text-base md:text-lg">
              Systems &amp; Quant
            </p>
          </div>

          <p className="mt-14 md:mt-16 max-w-2xl text-xl md:text-2xl text-fg/90 leading-snug emerge emerge-3">
            I write Rust, C++, and Python — high-throughput data
            pipelines, low-latency systems, and the occasional machine-learning
            rabbit hole.
          </p>

          <p className="mt-6 max-w-xl text-base md:text-lg text-fg-muted emerge emerge-4">
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
        </div>
      </section>

      <section className="relative z-10">
        <div className="flex items-baseline gap-6 mb-2">
          <h2 className="font-display font-black uppercase tracking-tight text-4xl md:text-7xl">
            Work
          </h2>
          <div className="seam flex-1 translate-y-[-0.5em]" />
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
