import { projects } from '@/data/projects'
import ProjectRow from '@/components/ProjectRow'
import Intro from '@/components/Intro'

export default function HomePage() {
  return (
    <Intro>
    <div className="space-y-32 md:space-y-44">
      <section className="min-h-screen flex flex-col items-center justify-center text-center pt-8 pb-12">
        <h1 className="emerge-hero font-display font-bold uppercase tracking-tight leading-[0.85] text-[2.75rem] sm:text-7xl md:text-[10rem] lg:text-[13rem]">
          <span className="block">William</span>
          <span className="block">Brodhead</span>
        </h1>

        <div className="mt-10 md:mt-14 flex items-center gap-3 md:gap-4 emerge">
          <div className="h-px w-6 md:w-24 bg-accent" />
          <p className="font-display font-normal uppercase tracking-[0.12em] md:tracking-[0.22em] text-sm md:text-base whitespace-nowrap">
            Measured. Relentless.
          </p>
          <div className="h-px w-6 md:w-24 bg-accent" />
        </div>

        <p className="mt-12 md:mt-14 max-w-2xl text-lg md:text-xl text-fg/85 leading-relaxed emerge">
          I write Rust, C++, and Python. High-throughput data
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

      <section id="work" className="emerge">
        <div className="flex items-baseline justify-between gap-6 border-b border-border pb-4">
          <h2 className="font-display uppercase tracking-tight text-3xl md:text-5xl">
            Work
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-fg-muted whitespace-nowrap">
            {String(projects.length).padStart(2, '0')} Projects
          </span>
        </div>
        <ul>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      </section>
    </div>
    </Intro>
  )
}
