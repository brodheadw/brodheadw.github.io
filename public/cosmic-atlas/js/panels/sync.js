// Catalog refresh from the Mac Studio's published manifest.
export default {
  id: 'sync',
  title: 'Catalog sync',
  open: false,
  mount(el, atlas) {
    el.innerHTML = `<div class="notice">Catalogs are published by the Mac Studio pipeline and load automatically.</div>
      <div class="actions" style="margin-top:10px"><button class="primary" data-ref="sync">Sync catalog now</button>
      <label class="check" style="margin:0"><input data-ref="auto" type="checkbox" checked> Auto-refresh every 15 min</label></div>
      <div class="notice status" data-ref="status"></div>`
    const ref = n => el.querySelector(`[data-ref=${n}]`)
    ref('sync').onclick = () => atlas.syncCatalogs()
    setInterval(() => { if (ref('auto').checked) atlas.syncCatalogs() }, 15 * 60 * 1000)
    const show = s => { ref('status').textContent = s.syncStatus }
    atlas.on('sync', show)
    show(atlas.state)
  },
}
