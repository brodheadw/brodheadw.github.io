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
    id: 'cosmic-atlas',
    title: 'Cosmic Atlas',
    description:
      'Interactive 3D galaxy atlas with DESI, IceCube and Fermi CSV layers, neutrino direction crossmatching and exploratory background-significance analysis.',
    githubUrl: 'https://github.com/brodheadw/brodheadw.github.io/tree/main/public/cosmic-atlas',
    liveUrl: 'https://brodheadw.github.io/cosmic-atlas/',
    tags: ['Astronomy', '3D', 'Neutrinos', 'Data Visualization'],
  },
  {
    id: 'crisp-portfolio',
    title: 'CRISP',
    description:
      'Reproducing the hierarchical and iterative mean-variance portfolio methods from Wuebben (2026), namely CRISP, HRP-mu, and the Cotton-Schur baseline, with a walk-forward backtest across a 15-asset cross-asset basket, 2010 to 2026.',
    githubUrl: 'https://github.com/brodheadw/crisp-portfolio',
    caseStudyUrl: '/crisp',
    tags: ['Python', 'Quant', 'Portfolio Theory', 'Backtest'],
  },
  {
    id: 'tokensperday',
    title: 'Tokens Per Day',
    description:
      'The AI inference demand index. Tracks how many LLM tokens the world processes daily: a defensible reported floor built from non-overlapping public disclosures, with quarterly history and implied estimates on top.',
    githubUrl: 'https://github.com/brodhead-unlimited/tokensperday',
    liveUrl: 'https://tokensperday.com',
    tags: ['Data', 'AI', 'Index'],
  },
  {
    id: 'careless-credit',
    title: 'Careless Credit',
    description:
      'Ranks all 663 credit cards in the CFPB\'s Terms of Credit Card Plans survey by what each is worth to you in dollars per year: rewards and intro savings minus interest and fees, with balances estimated from the Survey of Consumer Finances. No affiliate links.',
    githubUrl: 'https://github.com/brodheadw/careless-credit',
    liveUrl: 'https://williams-mac-studio.tail0a3e03.ts.net',
    tags: ['React', 'Python', 'Consumer Finance', 'Data'],
  },
  {
    id: 'ggml-viz',
    title: 'ggml-viz',
    description:
      'Tracer and desktop viewer for ggml programs like llama.cpp: preload it into the binary you already have and see every compute graph, every op and its time, and what memory was allocated.',
    image: '/images/ggml-viz/viewer.webp',
    githubUrl: 'https://github.com/brodheadw/ggml-viz',
    caseStudyUrl: '/ggml-viz',
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
]
