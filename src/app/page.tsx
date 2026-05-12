import { projects } from '@/data/projects'
import ProjectRow from '@/components/ProjectRow'

export default function HomePage() {
  return (
    <div className="space-y-28 md:space-y-36">
      <section className="pt-4 md:pt-12">
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.25em] uppercase text-fg-muted mb-12 fade-up">
          <span>Stamford, CT</span>
          <span>MMXXVI</span>
        </div>

        <h1 className="font-display tracking-tight leading-[0.9] text-6xl sm:text-7xl md:text-[8.5rem] fade-up fade-up-delay-1">
          <span className="block">Will Brodhead.</span>
          <span className="block italic text-fg-muted">Fullstack SWE</span>
          <span className="block">
            <span className="italic">&amp;</span>{' '}
            <span className="text-accent">Quant</span>.
          </span>
        </h1>

        <p className="mt-14 md:mt-16 max-w-2xl text-lg md:text-2xl text-fg/85 leading-snug fade-up fade-up-delay-2">
          I build complex systems and high-throughput data pipelines in{' '}
          <span className="font-mono text-base md:text-lg text-accent">Rust</span>
          ,{' '}
          <span className="font-mono text-base md:text-lg text-accent">C++</span>
          , and{' '}
          <span className="font-mono text-base md:text-lg text-accent">
            Python
          </span>
          . Predictive analytics, fintech, and machine learning are my
          specialties.
        </p>

        <p className="mt-6 max-w-xl text-fg-muted fade-up fade-up-delay-3">
          Currently building at{' '}
          <a
            href="https://gsmc.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg hover:text-accent underline decoration-1 underline-offset-4 transition-colors"
          >
            Global Strategic Minerals Corporation
          </a>
          .
        </p>
      </section>

      <section>
        <header className="flex items-baseline justify-between border-b border-border pb-3 mb-1">
          <h2 className="font-mono text-[11px] tracking-[0.25em] uppercase text-fg-muted">
            Selected Work
          </h2>
          <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-fg-muted">
            {String(projects.length).padStart(2, '0')} /{' '}
            {String(projects.length).padStart(2, '0')}
          </span>
        </header>
        <ul>
          {projects.map((project, i) => (
            <ProjectRow key={project.id} project={project} index={i + 1} />
          ))}
        </ul>
      </section>
    </div>
  )
}
