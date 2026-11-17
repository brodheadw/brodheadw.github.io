import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'ggml-viz: Seeing Inside LLM Inference',
  description:
    'A tracer and desktop viewer for ggml programs such as llama.cpp: every compute graph, every op and its time, recorded from the binary you already have.',
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="emerge space-y-6">
      <div className="flex items-baseline gap-6">
        <h2 className="font-display font-semibold uppercase tracking-tight text-3xl md:text-5xl">
          {title}
        </h2>
        <div className="seam flex-1 translate-y-[-0.4em]" />
      </div>
      {children}
    </section>
  )
}

function Shot({
  src,
  width,
  height,
  alt,
  caption,
}: {
  src: string
  width: number
  height: number
  alt: string
  caption: string
}) {
  return (
    <figure className="space-y-3">
      <Image
        src={src}
        width={width}
        height={height}
        alt={alt}
        className="w-full h-auto border border-border"
      />
      <figcaption className="font-mono text-[11px] tracking-[0.08em] text-fg-muted">
        {caption}
      </figcaption>
    </figure>
  )
}

const RUN = `# build
git clone --recursive https://github.com/brodheadw/ggml-viz.git
cd ggml-viz && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j

# trace any llama.cpp binary, unmodified
GGML_VIZ_OUTPUT=trace.ggmlviz GGML_VIZ_MEMORY_TRACKING=1 \\
  LD_PRELOAD=build/src/libggml_viz_hook.so \\
  ./llama-simple -m model.gguf -n 32 "The capital of France is"
# macOS: DYLD_INSERT_LIBRARIES=build/src/libggml_viz_hook.dylib

# view it (or --live trace.ggmlviz to follow a run as it writes)
./build/bin/ggml-viz trace.ggmlviz`

export default function GgmlVizPage() {
  return (
    <article className="space-y-16 md:space-y-24">
      <header className="emerge">
        <Link
          href="/"
          className="font-mono text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-accent transition-colors"
        >
          ← Work
        </Link>
        <h1 className="mt-6 font-display font-bold uppercase tracking-tight leading-[0.85] text-5xl md:text-[8rem]">
          ggml-viz
        </h1>
        <div className="mt-8 h-px w-20 bg-accent" />
        <p className="mt-8 max-w-2xl text-lg md:text-xl text-fg/90 leading-relaxed">
          A tracer and desktop viewer for programs built on{' '}
          <a
            href="https://github.com/ggml-org/ggml"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-4 hover:text-accent transition-colors"
          >
            ggml
          </a>
          , the tensor library under llama.cpp and whisper.cpp. Preload a hook
          into the binary you already have and it records every compute graph,
          every op and how long it took, and what memory ggml allocated,
          without rebuilding anything or changing the program&rsquo;s output.
        </p>
      </header>

      <section className="emerge">
        <Shot
          src="/images/ggml-viz/viewer.webp"
          width={1600}
          height={1000}
          alt="The ggml-viz viewer with a TinyLlama trace loaded: compute graph, tensor inspector, memory panel and timeline"
          caption="TinyLlama 1.1B (Q4_K_M) generating 32 tokens through llama.cpp on CPU: 32 graphs, 26,240 timed ops, 1.5 s."
        />
      </section>

      <Section title="The Graph">
        <p className="max-w-2xl text-fg/80 leading-relaxed">
          Each forward pass is a ggml compute graph. The hook records every
          node with its op and inputs when the graph starts, so the viewer
          redraws the real data flow: one graph at a time, top to bottom in
          execution order, every node placed just above the first op that
          uses it. Zoomed out, a transformer block reads off the screen:
          the norm, the Q, K and V projections fanning out, their writes
          into the KV cache, attention, then the feed-forward chain.
        </p>
        <Shot
          src="/images/ggml-viz/graph-block.webp"
          width={1200}
          height={669}
          alt="Graph View zoomed out on the first transformer block of the prompt graph"
          caption="Graph View, prompt graph, first block. Purple is matrix multiplication; the slider steps through the 32 recorded graphs."
        />
      </Section>

      <Section title="Where the Time Goes">
        <p className="max-w-2xl text-fg/80 leading-relaxed">
          Per-op timing comes from ggml&rsquo;s own scheduler callback, so
          the times are the scheduler&rsquo;s real node boundaries rather
          than estimates. The timeline shows them in order; the Op Timings tab
          ranks them. On this run the answer is plain: the feed-forward
          matmuls of each layer dominate the prompt.
        </p>
        <Shot
          src="/images/ggml-viz/timeline.webp"
          width={1200}
          height={107}
          alt="Timeline zoomed to 100x showing one layer's ops: Qcur, attn_out, ffn_gate, ffn_up, ffn_out"
          caption="Timeline at 100x: one layer of the prompt, the feed-forward matmuls taking most of it."
        />
        <Shot
          src="/images/ggml-viz/op-timings.webp"
          width={1200}
          height={327}
          alt="Op Timings tab listing the slowest ops: ffn_out, ffn_gate and ffn_up of each layer at 2.5 to 3.6 ms"
          caption="Op Timings: the slowest ops of the whole run."
        />
      </Section>

      <Section title="How It Works">
        <dl className="grid grid-cols-[8rem_1fr] md:grid-cols-[10rem_1fr] gap-y-4 text-sm md:text-base max-w-2xl">
          <dt className="text-fg-muted">Capture</dt>
          <dd className="text-fg/90">
            <span className="font-mono">LD_PRELOAD</span> on Linux,{' '}
            <span className="font-mono">DYLD_INTERPOSE</span> on macOS; the
            hook wraps ggml&rsquo;s graph compute, scheduler and tensor
            allocation calls.
          </dd>
          <dt className="text-fg-muted">Ops</dt>
          <dd className="text-fg/90">
            The scheduler&rsquo;s eval callback, chained with any callback
            the program already set.
          </dd>
          <dt className="text-fg-muted">Memory</dt>
          <dd className="text-fg/90">
            Every tensor ggml places in a buffer, including weights llama.cpp
            maps from the model file. Recorded in the trace; the viewer&rsquo;s
            memory panel is not built yet.
          </dd>
          <dt className="text-fg-muted">Format</dt>
          <dd className="text-fg/90">
            Events pass through a lock-free ring buffer into GGMLVIZ, a small
            binary format the viewer reads after the run or live as it grows.
          </dd>
          <dt className="text-fg-muted">Cost</dt>
          <dd className="text-fg/90">
            Timing every op makes the scheduler run one node at a time: this
            run took 1.8 s traced against 1.3 s untraced, with identical
            output.
          </dd>
          <dt className="text-fg-muted">Tested</dt>
          <dd className="text-fg/90">
            llama.cpp on CPU, Linux and macOS. Metal, CUDA and Windows are
            untried.
          </dd>
        </dl>
      </Section>

      <Section title="Run It">
        <pre className="overflow-x-auto border border-border bg-bg-elev p-5 font-mono text-xs md:text-sm leading-relaxed text-fg/90">
          {RUN}
        </pre>
        <p className="pt-2">
          <a
            href="https://github.com/brodheadw/ggml-viz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs tracking-[0.2em] uppercase text-fg-muted hover:text-accent transition-colors"
          >
            Source on GitHub →
          </a>
        </p>
      </Section>
    </article>
  )
}
