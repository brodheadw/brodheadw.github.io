export interface Project {
  id: string
  title: string
  description: string
  image?: string
  githubUrl: string
  liveUrl?: string
  /** Internal route on this site (e.g. a case-study page). Takes priority. */
  caseStudyUrl?: string
  tags: string[]
}

export const projects: Project[] = [
  {
    id: 'crisp-portfolio',
    title: 'CRISP',
    description:
      'Reproducing the hierarchical and iterative mean-variance portfolio methods from Wuebben (2026) — CRISP, HRP-mu, and the Cotton-Schur baseline — with a walk-forward backtest across a 15-asset cross-asset basket, 2010–2026.',
    githubUrl: 'https://github.com/brodheadw/crisp-portfolio',
    caseStudyUrl: '/crisp',
    tags: ['Python', 'Quant', 'Portfolio Theory', 'Backtest'],
  },
  {
    id: 'ggml-viz',
    title: 'ggml-viz',
    description:
      'Real-time visualization tool for GGML-based LLM inference engines (llama.cpp, whisper.cpp) with nanosecond-precision tracing and zero-recompilation monitoring.',
    image: '/ggmlviz.png',
    githubUrl: 'https://github.com/brodheadw/ggml-viz',
    tags: ['C++', 'GGML', 'Visualization', 'ML Infra'],
  },
  {
    id: 'gitlaxy',
    title: 'Gitlaxy',
    description:
      '3D traversable point-cloud of any Git repository, with fly-mode controls and customizable spaceship navigation. Inspired by Gitlantis.',
    image: '/gitlaxy.png',
    githubUrl: 'https://github.com/brodheadw/gitlaxy',
    liveUrl: 'https://brodheadw.github.io/gitlaxy/',
    tags: ['TypeScript', 'Three.js', 'React', '3D'],
  },
  {
    id: 'pomegranate',
    title: 'Pomegranate',
    description:
      'Image classification of pomegranate growth stages. CNN, SSD, Faster R-CNN, and YOLOv5 trained on the Mendeley Pomegranate dataset. 99.57% accuracy with a traditional CNN.',
    githubUrl: 'https://github.com/brodheadw/pomegranate',
    tags: ['Python', 'PyTorch', 'Computer Vision', 'CNN'],
  },
  {
    id: 'vim2',
    title: 'Vim2',
    description:
      'A Vim-inspired terminal text editor implemented in C++ from scratch, with undo/redo and text-wrapping.',
    githubUrl: 'https://github.com/brodheadw/Vim2',
    tags: ['C++', 'Systems', 'Text Editor'],
  },
]
