// src/app/page.tsx
import ProjectCard from '@/components/ProjectCard'
import { projects } from '@/data/projects'

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-3xl font-semibold mb-4">Will&#39;s Portfolio</h2>
        <p>This is a collection of some of my projects.</p>
      </section>

      <section>
        <h2 className="text-3xl font-semibold mb-8">Projects</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </div>
  )
}