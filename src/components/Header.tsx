import Link from 'next/link'

export default function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border py-5">
      <Link
        href="/"
        className="font-mono text-xs tracking-[0.25em] uppercase text-fg-muted hover:text-accent transition-colors"
      >
        WB <span className="text-fg-muted/40">/</span> brodheadw.github.io
      </Link>
      <nav className="flex items-center gap-6 md:gap-8 font-mono text-[11px] tracking-[0.2em] uppercase text-fg-muted">
        <Link href="/" className="hover:text-fg transition-colors">
          Index
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
          GH
        </a>
        <a
          href="https://linkedin.com/in/brodheadw"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-fg transition-colors"
        >
          LI
        </a>
        <a
          href="mailto:brodheadw@gmail.com"
          className="hover:text-fg transition-colors"
        >
          Mail
        </a>
      </nav>
    </header>
  )
}
