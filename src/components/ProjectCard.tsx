import Image from 'next/image'
import Link from 'next/link'
import { FaGithub, FaExternalLinkAlt } from 'react-icons/fa'
import { Project } from '@/data/projects'

interface ProjectCardProps {
  project: Project
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {project.liveUrl ? (
        <Link
          href={project.liveUrl}
          className="relative h-48 w-full block cursor-pointer"
        >
          <Image
            src={project.image}
            alt={project.title}
            fill
            className="object-cover hover:opacity-90 transition-opacity"
          />
        </Link>
      ) : (
        <div className="relative h-48 w-full">
          <Image
            src={project.image}
            alt={project.title}
            fill
            className="object-cover"
          />
        </div>
      )}
      
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-2">{project.title}</h3>
        <p className="text-gray-600 mb-4">{project.description}</p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
        
        <div className="flex gap-4">
          <Link
            href={project.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            <FaGithub size={16} />
            <span>Code</span>
          </Link>
          
          {project.liveUrl && (
            <Link
              href={project.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <FaExternalLinkAlt size={14} />
              <span>Live Demo</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}