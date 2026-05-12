export default function AboutPage() {
  return (
    <section className="max-w-3xl space-y-14 md:space-y-16">
      <header className="fade-up">
        <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-fg-muted mb-6">
          About
        </p>
        <h1 className="font-display text-5xl md:text-8xl leading-[0.92] tracking-tight">
          A short <span className="italic text-accent">note</span>.
        </h1>
      </header>

      <div className="space-y-6 text-lg md:text-xl text-fg/85 leading-relaxed fade-up fade-up-delay-1">
        <p>
          I&rsquo;m Will Brodhead &mdash; Fullstack SWE &amp; Quant at{' '}
          <a
            className="underline decoration-1 underline-offset-4 hover:text-accent transition-colors"
            href="https://gsmc.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Global Strategic Minerals Corporation
          </a>
          . UConn &lsquo;24.
        </p>
        <p>
          I build complex systems and high-throughput data pipelines in{' '}
          <span className="font-mono text-base text-accent">Rust</span>,{' '}
          <span className="font-mono text-base text-accent">C++</span>, and{' '}
          <span className="font-mono text-base text-accent">Python</span>.
          Predictive analytics, fintech, and machine learning are my specialties.
        </p>
        <p className="text-fg-muted">Based in Stamford, CT.</p>
      </div>

      <div className="border-t border-border pt-10 fade-up fade-up-delay-2">
        <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-fg-muted mb-6">
          Reach
        </p>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-4 font-mono text-sm">
          <dt className="text-fg-muted text-xs tracking-[0.15em] uppercase pt-1">
            Email
          </dt>
          <dd>
            <a
              href="mailto:brodheadw@gmail.com"
              className="text-fg hover:text-accent transition-colors"
            >
              brodheadw@gmail.com
            </a>
          </dd>
          <dt className="text-fg-muted text-xs tracking-[0.15em] uppercase pt-1">
            GitHub
          </dt>
          <dd>
            <a
              href="https://github.com/brodheadw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg hover:text-accent transition-colors"
            >
              brodheadw
            </a>
          </dd>
          <dt className="text-fg-muted text-xs tracking-[0.15em] uppercase pt-1">
            LinkedIn
          </dt>
          <dd>
            <a
              href="https://linkedin.com/in/brodheadw"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg hover:text-accent transition-colors"
            >
              brodheadw
            </a>
          </dd>
        </dl>
      </div>
    </section>
  )
}
