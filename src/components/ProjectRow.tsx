import Image from 'next/image'
import Link from 'next/link'
import { Project } from '@/data/projects'

interface Props {
  project: Project
  index: number
}

export default function ProjectRow({ project, index }: Props) {
  const href = project.liveUrl || project.githubUrl

  return (
    <li className="group border-t border-border last:border-b">
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block py-7 md:py-10"
      >
        <div className="flex items-baseline gap-5 md:gap-10">
          <span className="font-display font-bold text-fg-muted text-2xl md:text-4xl tabular-nums w-10 md:w-16 shrink-0 transition-colors duration-500 group-hover:text-accent">
            {String(index).padStart(2, '0')}
          </span>
          <h3 className="font-display font-black uppercase tracking-tight text-4xl md:text-6xl flex-1 leading-[0.92] transition-colors duration-500 group-hover:text-fg">
            {project.title}
          </h3>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted whitespace-nowrap">
            {project.tags.slice(0, 2).join(' · ')}
          </span>
        </div>

        <div className="row-collapse">
          <div>
            <div className="pt-7 pl-14 md:pl-24 flex flex-col md:flex-row gap-6 md:gap-10">
              {project.image && (
                <div className="relative w-full md:w-56 h-40 md:h-36 shrink-0 overflow-hidden border border-border">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-cover transition-transform duration-[1200ms] group-hover:scale-105"
                    sizes="(min-width: 768px) 224px, 100vw"
                  />
                </div>
              )}
              <div className="flex-1 max-w-xl">
                <p className="text-fg/85 leading-relaxed mb-4">
                  {project.description}
                </p>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">
                  {project.tags.join(' · ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}
