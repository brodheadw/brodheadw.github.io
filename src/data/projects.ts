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
    description: 'Real-time performance visualization tool for GGML-based LLM inference engines with nanosecond precision tracing and zero-recompilation monitoring.',
    image: '/ggmlviz.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/ggml-viz',
    tags: ['C++', 'Visualization', 'Machine Learning', 'Fork']
  },
  {
    id: '2',
    title: 'Pomegranate Growth Classification',
    description: 'Machine learning model for classifying pomegranate growth stages from images, achieving 99.57% accuracy using CNN.',
    image: '/project2.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/pomegranate',
    tags: ['Python', 'Machine Learning', 'Computer Vision', 'CNN']
  },
  {
    id: '3',
    title: 'Vim2',
    description: 'Vim-inspired text editor implemented in C++ with undo/redo functionality and text wrapping capabilities.',
    image: '/project3.png', // Add your project image to public folder
    githubUrl: 'https://github.com/brodheadw/Vim2',
    tags: ['C++', 'Text Editor', 'Systems Programming']
  }
]