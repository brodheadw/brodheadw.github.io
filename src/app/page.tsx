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

        <p className="mt-10 md:mt-14 font-display font-normal uppercase tracking-[0.12em] md:tracking-[0.22em] text-sm md:text-base whitespace-nowrap emerge">
          Measured. Relentless.
        </p>

        <p className="mt-6 max-w-xl text-base md:text-lg text-fg-muted emerge">
          Primary Commodity Fund, Global Strategic Minerals Corporation
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
