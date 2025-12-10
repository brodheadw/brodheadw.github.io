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
    title: 'Gitlaxy',
    description: '3D visualization tool that creates a traversable point cloud of your Git repository with fly mode controls and customizable spaceship navigation.',
    image: '/gitlaxy.png',
    githubUrl: 'https://github.com/brodheadw/gitlaxy',
    tags: ['TypeScript', 'Three.js', 'React', '3D Visualization']
  },
  {
    id: '2',
    title: 'ggml-viz',
    description: 'Real-time performance visualization tool for GGML-based LLM inference engines with nanosecond precision tracing and zero-recompilation monitoring.',
    image: '/ggmlviz.png',
    githubUrl: 'https://github.com/brodheadw/ggml-viz',
    tags: ['C++', 'Visualization', 'Machine Learning', 'Fork']
  },
  {
    id: '3',
    title: 'Pomegranate Growth Classification',
    description: 'Machine learning model for classifying pomegranate growth stages from images, achieving 99.57% accuracy using CNN.',
    image: '/project2.png',
    githubUrl: 'https://github.com/brodheadw/pomegranate',
    tags: ['Python', 'Machine Learning', 'Computer Vision', 'CNN']
  },
  {
    id: '4',
    title: 'Vim2',
    description: 'Vim-inspired text editor implemented in C++ with undo/redo functionality and text wrapping capabilities.',
    image: '/project3.png',
    githubUrl: 'https://github.com/brodheadw/Vim2',
    tags: ['C++', 'Text Editor', 'Systems Programming']
  }
]