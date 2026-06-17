import { projects } from '@/data/projects'
import ProjectRow from '@/components/ProjectRow'

export default function HomePage() {
  return (
    <div className="space-y-32 md:space-y-44">
      <section className="min-h-screen flex flex-col items-center justify-center text-center pt-8 pb-12">
        <h1 className="emerge-hero font-display font-bold uppercase tracking-tight leading-[0.85] text-[2.75rem] sm:text-7xl md:text-[10rem] lg:text-[13rem]">
          <span className="block">William</span>
          <span className="block">Brodhead</span>
        </h1>

        <div className="mt-10 md:mt-14 flex items-center gap-4 emerge">
          <div className="h-px w-12 md:w-24 bg-accent" />
          <p className="font-display font-normal uppercase tracking-[0.22em] text-sm md:text-base">
            Systems &amp; Quant
          </p>
          <div className="h-px w-12 md:w-24 bg-accent" />
        </div>

        <p className="mt-12 md:mt-14 max-w-2xl text-lg md:text-xl text-fg/85 leading-relaxed emerge">
          I write Rust, C++, and Python — high-throughput data
          pipelines, low-latency systems, and the occasional machine-learning
          rabbit hole.
        </p>

        <p className="mt-6 max-w-xl text-base md:text-lg text-fg-muted emerge">
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
        <div className="flex items-baseline gap-6 mb-2 emerge">
          <h2 className="font-display font-semibold uppercase tracking-tight text-4xl md:text-7xl">
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
