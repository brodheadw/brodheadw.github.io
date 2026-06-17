import Link from 'next/link'
import { Project } from '@/data/projects'

interface Props {
  project: Project
}

export default function ProjectRow({ project }: Props) {
  // An on-site case study stays internal (no new tab); otherwise link out.
  const internal = Boolean(project.caseStudyUrl)
  const href = project.caseStudyUrl || project.liveUrl || project.githubUrl
  const external = internal ? {} : { target: '_blank', rel: 'noopener noreferrer' }

  return (
    <li className="group border-b border-border last:border-b-0">
      <Link href={href} {...external} className="block py-7 md:py-8">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display tracking-tight text-2xl md:text-4xl transition-colors duration-300 group-hover:text-accent">
            {project.title}
          </h3>
          <span className="hidden sm:block shrink-0 font-mono text-[10px] md:text-[11px] uppercase tracking-[0.18em] text-fg-muted">
            {project.tags.slice(0, 3).join('  ·  ')}
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-6">
          <p className="max-w-2xl text-sm md:text-[15px] text-fg-muted leading-relaxed">
            {project.description}
          </p>
          <span
            aria-hidden
            className="shrink-0 font-mono text-lg leading-none text-fg-muted transition-all duration-300 group-hover:text-accent group-hover:translate-x-1"
          >
            →
          </span>
        </div>
      </Link>
    </li>
  )
}
