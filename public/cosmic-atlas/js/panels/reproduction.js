// Summary of the Boötes III IceCube reproduction (data/bootes_analysis.json), linking to the full page.
export default {
  id: 'reproduction',
  title: 'Boötes III · IceCube reproduction',
  mount(el, atlas) {
    el.innerHTML = '<div class="info">Loading reproduction results…</div><div class="actions" style="margin-top:10px"><a class="btnlink" href="bootes.html">Open full analysis →</a></div>'
    const out = el.firstElementChild
    atlas.on('data', d => {
      if (!d.repro) { out.textContent = 'Reproduction results not published yet.'; return }
      const t = d.repro.trials, o = d.repro.observed
      out.innerHTML = `Re-ran Ji &amp; Wang (2026) on IceCube's public 10-year data.<br>TS <b>${o.ts.toFixed(1)}</b> · ${o.ns.toFixed(0)} signal events · ` +
        `local <b>${t.sigma_local.toFixed(1)}σ</b> · after 3-target trials <b>${t.sigma_post.toFixed(1)}σ</b><br>` +
        `<small>Paper: TS 12.2 · 17 events · 3.4σ local · 3.1σ post-trial. ${t.n.toLocaleString()} scrambled skies.</small>`
    })
  },
}
