import Link from 'next/link'

export default function Header() {
  return (
    <header className="emerge relative z-40 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border py-6 bg-bg">
      <Link
        href="/"
        className="font-display uppercase tracking-tight text-lg md:text-xl hover:text-accent transition-colors"
      >
        Brodhead
      </Link>
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 md:gap-8 text-sm text-fg-muted">
        <Link href="/" className="hover:text-fg transition-colors">
          Work
        </Link>
        <Link href="/about" className="hover:text-fg transition-colors">
          About
        </Link>
        <a
          href="https://github.com/brodheadw"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          GitHub
        </a>
        <a
          href="https://linkedin.com/in/brodheadw"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          LinkedIn
        </a>
        <a
          href="mailto:brodheadw@gmail.com"
          className="hover:text-fg transition-colors"
        >
          Email
        </a>
      </nav>
    </header>
  )
}
