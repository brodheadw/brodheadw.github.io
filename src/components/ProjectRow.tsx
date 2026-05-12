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
    <li className="group border-b border-border">
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block py-7 md:py-9"
      >
        <div className="flex items-baseline gap-4 md:gap-8">
          <span className="font-mono text-[11px] tracking-[0.2em] text-fg-muted w-8 shrink-0">
            {String(index).padStart(2, '0')}
          </span>
          <h3 className="font-display text-3xl md:text-6xl flex-1 leading-none transition-colors duration-300 group-hover:text-accent">
            {project.title}
          </h3>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted whitespace-nowrap">
            {project.tags.slice(0, 2).join(' · ')}
          </span>
          <span className="text-fg-muted group-hover:text-accent group-hover:translate-x-1 transition-all duration-300 inline-block">
            ↗
          </span>
        </div>

        <div className="row-collapse">
          <div>
            <div className="pt-6 pl-12 md:pl-16 flex flex-col md:flex-row gap-6 md:gap-10">
              {project.image && (
                <div className="relative w-full md:w-56 h-40 md:h-36 shrink-0 overflow-hidden border border-border">
                  <Image
                    src={project.image}
                    alt={project.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
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
