export default function AboutPage() {
  return (
    <section className="relative max-w-3xl space-y-16 md:space-y-20">
      <header className="emerge emerge-1">
        <h1 className="font-display font-black uppercase tracking-tight leading-[0.85] text-6xl md:text-[10rem]">
          <span className="block">A short</span>
          <span className="block">note.</span>
        </h1>
        <div className="mt-10 h-px w-20 bg-accent" />
      </header>

      <div className="space-y-6 text-lg md:text-xl text-fg/90 leading-relaxed emerge emerge-2">
        <p>
          I&rsquo;m Will Brodhead. I work as a fullstack and quant engineer at{' '}
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
          I write Rust, C++, and Python — mostly high-throughput data
          pipelines and low-latency systems, with the occasional detour into
          machine learning when the problem warrants it.
        </p>
        <p className="text-fg-muted">Based in Stamford, Connecticut.</p>
      </div>

      <div className="pt-10 emerge emerge-3">
        <div className="seam mb-10" />
        <dl className="grid grid-cols-[6rem_1fr] md:grid-cols-[8rem_1fr] gap-y-5 text-sm md:text-base">
          <dt className="text-fg-muted pt-0.5">Email</dt>
          <dd>
            <a
              href="mailto:brodheadw@gmail.com"
              className="text-fg hover:text-accent transition-colors"
            >
              brodheadw@gmail.com
            </a>
          </dd>
          <dt className="text-fg-muted pt-0.5">GitHub</dt>
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
          <dt className="text-fg-muted pt-0.5">LinkedIn</dt>
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
