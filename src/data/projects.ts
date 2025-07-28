export interface Project {
  id: string
  title: string
  description: string
  image: string
  githubUrl: string
  liveUrl?: string
  tags: string[]
}

export const projects: Project[] = [
  {
    id: '1',
    title: 'ggml-viz',
    description: 'A brief description of your first project. Replace this with your actual project details.',
    image: '/ggmlviz.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/ggml-viz',
    liveUrl: 'https://your-live-demo.com',
    tags: ['React', 'TypeScript', 'Next.js']
  },
  {
    id: '2',
    title: 'Example Project 2',
    description: 'A brief description of your second project. Replace this with your actual project details.',
    image: '/project2.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/your-repo-name-2',
    tags: ['Python', 'Machine Learning', 'AI']
  },
  {
    id: '3',
    title: 'Example Project 3',
    description: 'A brief description of your third project. Replace this with your actual project details.',
    image: '/project3.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/your-repo-name-3',
    liveUrl: 'https://your-live-demo-3.com',
    tags: ['JavaScript', 'Node.js', 'Express']
  }
]