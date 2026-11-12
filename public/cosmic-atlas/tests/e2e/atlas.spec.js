import { test, expect } from '@playwright/test'
import { WORKSPACES } from '../../js/workspaces/index.js'
import { formatDistance } from '../../js/astro/units.js'
const workspaceIds = ['explore', 'neutrinos', 'dark-matter', 'gamma', 'bootes', 'solar', 'earth', 'custom']

async function openAtlas(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__atlas?.ready === true)
  await page.evaluate(async () => { if (window.__atlas.whenReady) await window.__atlas.whenReady })
  await expect(page.locator('#sceneError')).toBeHidden()
  await expect(page.locator('#universe')).toBeVisible()
  if (await page.locator('#about').evaluate(dialog => dialog.open)) await page.locator('#aboutExplore').click()
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const previousMetrics = await page.evaluateHandle(() => window.__atlas.metrics)
  const expected = await page.evaluate(() => ({ view: window.__atlas.store.getState().view, distance: window.__atlas.store.getState().camera.distance }))
  const expectedScale = expected.view === 'sky' ? 'ALL SKY' : formatDistance(expected.distance)
  try {
    await page.waitForFunction(({ previous, expectedScale, view }) => {
      const atlas = window.__atlas, state = atlas.store.getState(), goal = state.camera, rig = atlas.renderer.getRig(), metrics = atlas.metrics
      const targetError = Math.hypot(...goal.target.map((value, index) => value - rig.target[index])) / goal.distance
      const expectedMode = view === 'sky' ? 'HAMMER / ALL SKY' : 'SPATIAL ATLAS'
      return state.view === view && metrics && metrics !== previous && targetError < 1e-6 &&
        Math.abs(rig.distance / goal.distance - 1) < 1e-5 && Math.abs(metrics.distance / goal.distance - 1) < 1e-5 &&
        Math.abs(rig.yaw - goal.yaw) < 1e-6 && Math.abs(rig.pitch - goal.pitch) < 1e-6 &&
        (goal.mode === 'follow' || metrics.moving === false) &&
        document.querySelector('#scaleReadout').textContent === expectedScale &&
        document.querySelector('#viewportMode').textContent === expectedMode &&
        document.querySelector(state.view === 'sky' ? '#viewSky' : '#view3d').getAttribute('aria-pressed') === 'true'
    }, { previous: previousMetrics, expectedScale, view: expected.view })
  } finally { await previousMetrics.dispose() }
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForTimeout(150)
}

test('boots without console errors and selects Boötes III in a text inspector', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openAtlas(page)
  await expect(page.locator('#workspace')).toHaveValue('bootes')
  await page.evaluate(() => window.__atlas.select('curated', 1))
  await expect(page.locator('#panels')).toContainText('Boötes III')
  await expect(page.locator('#panels')).toContainText(/disrupting|classification|candidate/i)
  await settle(page)
  expect(errors).toEqual([])
})

test('all eight workspaces render their panels at desktop and mobile sizes', async ({ page }, testInfo) => {
  await openAtlas(page)
  for (const id of workspaceIds) {
    await page.selectOption('#workspace', id)
    await expect(page.locator('#workspace')).toHaveValue(id)
    for (const panel of WORKSPACES.find(workspace => workspace.id === id).panels) await expect(page.locator(`#panels .panel[data-panel="${panel}"]`), `${id} includes ${panel}`).toHaveCount(1)
    await expect(page.locator('#workspaceDescription')).not.toBeEmpty()
    await settle(page)
    if (id === 'solar') {
      await expect(page.locator('.scene-label').filter({ hasText: /^Sun$/ })).toBeVisible()
      await expect(page.locator('.scene-label').filter({ hasText: /^(Mercury|Venus|Earth|Mars)$/ }).first()).toBeVisible()
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    expect(overflow, `${id} workspace should fit the viewport`).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`workspace-${id}.png`), fullPage: true })
  }
})

test('every registered overlay is present and decodes as an image', async ({ page, request }) => {
  await openAtlas(page)
  const response = await request.get('/data/layers.json')
  expect(response.ok()).toBeTruthy()
  const registry = await response.json(), layers = registry.layers || registry
  const overlays = layers.filter(layer => layer.kind === 'skymap')
  expect(overlays.length).toBeGreaterThanOrEqual(26)
  for (const overlay of overlays) {
    const response = await request.get(`/${overlay.files.texture}`)
    expect(response.ok(), `${overlay.id} texture should load`).toBeTruthy()
    const dimensions = await page.evaluate(url => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = () => reject(Error(url)); image.src = url
    }), overlay.files.texture)
    expect(dimensions[0]).toBeGreaterThan(0)
    expect(dimensions[1]).toBeGreaterThan(0)
  }
})

test('saved, exported and imported setup restores filters, camera and experiments', async ({ page }) => {
  await openAtlas(page)
  const result = await page.evaluate(async () => {
    const presets = await import('./js/presets.js')
    const store = window.__atlas.store
    store.set({ ascii: true, camera: { distance: 0.23 }, layers: { neutrinos: { filters: { energyMin: 200000 } } }, experiments: [{ name: 'Saved angular coincidence', observed: 0, expected: 0.2 }] })
    const before = structuredClone(store.getState())
    const saved = presets.savePreset('E2E Boötes setup', before, { id: 'e2e-check' })
    const exported = presets.exportPreset(saved.preset.state, saved.preset.name)
    const imported = await presets.importPreset(exported)
    store.set({ ascii: false, camera: { distance: 10 }, experiments: [] })
    store.replace(imported.state)
    const after = structuredClone(store.getState())
    const stored = presets.loadPreset('e2e-check')
    presets.deletePreset('e2e-check')
    return { ok: saved.ok, before, after, storedName: stored?.name }
  })
  expect(result.ok).toBe(true)
  expect(result.storedName).toBe('E2E Boötes setup')
  expect(result.after).toEqual(result.before)
})

test('ASCII leaves crisp DOM labels and local-group labels do not overlap', async ({ page }) => {
  await openAtlas(page)
  await page.locator('[data-anchor="localgroup"]').click()
  await settle(page)
  await page.locator('#asciiView').click()
  await expect(page.locator('#asciiView')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.scene-label').first()).toBeVisible()
  const labels = await page.locator('.scene-label').evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { text: element.textContent, x, y, width, height }
  }))
  expect(labels.length).toBeGreaterThan(0)
  const hud = await page.locator('.focus-card,.view-switch,.viewport-heading,.viewport-footer,.scale-jumps').evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { name: element.className, x, y, width, height }
  }))
  for (const label of labels) for (const box of hud) {
    const overlap = label.x < box.x + box.width && label.x + label.width > box.x && label.y < box.y + box.height && label.y + label.height > box.y
    expect(overlap, `${label.text} must not obscure ${box.name}`).toBe(false)
  }
  for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) {
    const x = labels[a], y = labels[b]
    const overlap = x.x < y.x + y.width && x.x + x.width > y.x && x.y < y.y + y.height && x.y + x.height > y.y
    expect(overlap, `${x.text} must not overlap ${y.text}`).toBe(false)
  }
})

test('camera reaches every scale anchor with finite positions and screenshots', async ({ page }, testInfo) => {
  await openAtlas(page)
  for (const anchor of ['web', 'localgroup', 'milkyway', 'solar', 'earth']) {
    await page.locator(`[data-anchor="${anchor}"]`).click()
    await settle(page)
    if (anchor === 'solar') await expect(page.locator('.scene-label').filter({ hasText: /^Sun$/ })).toBeVisible()
    const camera = await page.evaluate(() => window.__atlas.renderer.getRig())
    expect(camera.target.every(Number.isFinite), `${anchor} target is finite`).toBe(true)
    expect(Number.isFinite(camera.distance) && camera.distance > 0, `${anchor} distance is positive`).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`scale-${anchor}.png`), fullPage: true })
  }
})

test('keyboard command palette and camera controls work', async ({ page }) => {
  await openAtlas(page)
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.locator('#commands')).toBeVisible()
  await page.locator('#commandSearch').fill('Boötes')
  await expect(page.locator('#commandResults button').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#commands')).not.toBeVisible()
  await page.locator('#universe').focus()
  const before = await page.evaluate(() => window.__atlas.store.getState().camera.target)
  await page.keyboard.down('w')
  await page.waitForTimeout(150)
  await page.keyboard.up('w')
  const after = await page.evaluate(() => window.__atlas.store.getState().camera.target)
  expect(after).not.toEqual(before)
})

test('full astronomical catalog reports measured performance without claiming satellite throughput', async ({ page }, testInfo) => {
  await openAtlas(page)
  await page.selectOption('#workspace', 'explore')
  await page.evaluate(() => {
    const store = window.__atlas.store, state = structuredClone(store.getState())
    for (const id of ['curated', 'galaxies', 'neutrinos', 'fermi']) state.layers[id] = { visible: true, opacity: 1, filters: {} }
    state.view = '3d'; store.replace(state)
  })
  await page.waitForTimeout(2300)
  const measurement = await page.evaluate(() => {
    const atlas = window.__atlas
    const entries = atlas.tables instanceof Map ? Array.from(atlas.tables.entries()) : Object.entries(atlas.tables)
    const gl = atlas.renderer.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return { metrics: atlas.metrics, gpu, catalogRows: Object.fromEntries(entries.map(([id, table]) => [id, table.length])), userAgent: navigator.userAgent, note: 'Astronomical catalogs only; no full satellite throughput claim.' }
  })
  expect(Object.values(measurement.catalogRows).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(48000)
  expect(measurement.metrics?.fps).toBeGreaterThan(0)
  expect(measurement.metrics?.frameMs).toBeGreaterThan(0)
  await testInfo.attach('performance.json', { body: JSON.stringify(measurement, null, 2), contentType: 'application/json' })
  console.log(`${testInfo.project.name} measured astronomical performance: ${JSON.stringify(measurement)}`)
})


test('satellite availability is honest; a current public snapshot enables an ISS plausibility check', async ({ page, request }, testInfo) => {
  await openAtlas(page)
  const response = await request.get('/data/satellites/status.json')
  expect(response.ok()).toBeTruthy()
  const status = await response.json()
  await page.selectOption('#workspace', 'earth')
  await settle(page)
  if (status.available === false) {
    await expect(page.locator('#panels')).toContainText(/snapshot|unavailable|published|403|blocked/i)
    expect(await page.evaluate(() => window.__atlas.satellites.length)).toBe(0)
    await testInfo.attach('satellite-data-unavailable.json', { body: JSON.stringify(status, null, 2), contentType: 'application/json' })
    return
  }
  await page.waitForFunction(() => window.__atlas.satellites.length > 0)
  const issIndex = await page.evaluate(() => window.__atlas.satellites.findIndex(object => Number(object.NORAD_CAT_ID || object.norad) === 25544 || /ISS \(ZARYA\)/i.test(object.OBJECT_NAME || object.name || '')))
  expect(issIndex).toBeGreaterThanOrEqual(0)
  await page.evaluate(index => window.__atlas.select('satellites', index), issIndex)
  const first = await page.evaluate(() => window.__atlas.selectedDetails())
  await page.waitForTimeout(1200)
  const second = await page.evaluate(() => window.__atlas.selectedDetails())
  await testInfo.attach('iss-state-samples.json', { body: JSON.stringify({ first, second }, null, 2), contentType: 'application/json' })
  expect(first.altitudeKm).toBeGreaterThan(350)
  expect(first.altitudeKm).toBeLessThan(470)
  expect(first.speedKmS).toBeGreaterThan(7.4)
  expect(first.speedKmS).toBeLessThan(8)
  expect(second.gcrsPosition || second.temePosition).not.toEqual(first.gcrsPosition || first.temePosition)
  await expect(page.locator('#panels')).toContainText(/epoch|element.*age|prediction/i)
})

test('a worker experiment reports its background, saves inputs and exports a result', async ({ page }, testInfo) => {
  await openAtlas(page)
  const panel = page.locator('[data-panel="experiment"]')
  if (await panel.getAttribute('open') === null) await panel.locator('summary').first().click()
  await panel.getByLabel('RA scrambles', { exact: true }).fill('50')
  await panel.getByRole('button', { name: 'Run experiment →' }).click()
  await expect(panel.locator('.result-metrics')).toContainText('CHANCE EXPECTATION')
  await expect(panel.locator('.result-metrics')).toContainText('OBSERVED')
  await panel.getByRole('button', { name: 'Save as experiment', exact: true }).click()
  const result = await page.evaluate(() => window.__atlas.store.getState().experiments.at(-1))
  expect(result.inputs.scrambles).toBe(50)
  expect(result.inputs.eventLayer).toBe('neutrinos')
  expect(result.inputs.targets[0].name).toBe('Boötes III')
  expect(Object.keys(result.inputs.dataVersions).length).toBeGreaterThan(0)
  expect(result.expected).toBeGreaterThanOrEqual(0)
  expect(result.pValue).toBeGreaterThanOrEqual(1 / 51)
  expect(result.caveats.join(' ')).toContain('not detection')
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('atlas-experiment.json')
  await download.saveAs(testInfo.outputPath('angular-experiment.json'))
})

test('live filters stay shared between views and importing a setup file restores their controls', async ({ page }, testInfo) => {
  await openAtlas(page)
  await page.selectOption('#workspace', 'neutrinos')
  const filters = page.locator('[data-panel="filters"]')
  await filters.getByLabel('Minimum energy', { exact: true }).fill('300000')
  await filters.getByLabel('Minimum energy', { exact: true }).press('Tab')
  await page.waitForFunction(() => window.__atlas.masks.get('neutrinos')?.length < window.__atlas.tables.get('neutrinos').length)
  const before = await page.evaluate(() => Array.from(window.__atlas.masks.get('neutrinos')))
  expect(before.length).toBeGreaterThan(0)
  await page.locator('#view3d').click()
  expect(await page.evaluate(() => Array.from(window.__atlas.masks.get('neutrinos')))).toEqual(before)
  await page.locator('#viewSky').click()
  const setups = page.locator('[data-panel="presets"]')
  if (await setups.getAttribute('open') === null) await setups.locator('summary').first().click()
  await setups.getByLabel('Setup name').fill('UI filter restoration')
  await setups.getByRole('button', { name: 'Save setup', exact: true }).click()
  await expect(setups.locator('[data-load]').filter({ hasText: 'UI filter restoration' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await setups.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const exported = testInfo.outputPath('ui-filter-setup.json')
  await (await downloadPromise).saveAs(exported)
  await filters.getByLabel('Minimum energy', { exact: true }).fill('600000')
  await filters.getByLabel('Minimum energy', { exact: true }).press('Tab')
  await page.waitForFunction(() => window.__atlas.store.getState().layers.neutrinos.filters.energyMin === 600000)
  const chooserPromise = page.waitForEvent('filechooser')
  await setups.getByRole('button', { name: 'Import JSON', exact: true }).click()
  await (await chooserPromise).setFiles(exported)
  await page.waitForFunction(() => window.__atlas.store.getState().layers.neutrinos.filters.energyMin === 300000)
  await expect(filters.getByLabel('Minimum energy', { exact: true })).toHaveValue('300000')
  await expect.poll(() => page.evaluate(() => Array.from(window.__atlas.masks.get('neutrinos')))).toEqual(before)
  await filters.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__atlas.masks.get('neutrinos')?.length)).toBe(275)
})

test('target ranking preserves the published 119 targets and recomputes filtered alert expectations', async ({ page }) => {
  await openAtlas(page)
  const panel = page.locator('[data-panel="targets"]')
  if (await panel.getAttribute('open') === null) await panel.locator('summary').first().click()
  await expect(panel.locator('[data-list] > li')).toHaveCount(119)
  await expect(panel.locator('[data-list] > li').first()).toContainText('Boötes III')
  await expect(panel.locator('[data-list] > li').first()).toContainText(/observed.*expected/)
  await panel.locator('[data-setting="sample"]').selectOption('neutrinos')
  await expect(panel.locator('[data-about]')).toContainText('275 filtered IceCat-1 alerts')
  await expect(panel.locator('[data-list] > li')).toHaveCount(119)
  await panel.getByLabel('ICRS coordinates', { exact: true }).check()
  await expect(panel.locator('[data-list] > li').first()).toContainText('RA 209.30°, Dec 26.80°')
  await page.evaluate(() => window.__atlas.store.set({ layers: { neutrinos: { filters: { energyMin: 300000 } } } }))
  await page.waitForFunction(() => {
    const atlas = window.__atlas, mask = atlas.masks.get('neutrinos')
    return mask?.length > 0 && mask.length < atlas.tables.get('neutrinos').length
  })
  const check = await page.evaluate(async () => {
    const atlas = window.__atlas, table = atlas.tables.get('neutrinos'), mask = atlas.masks.get('neutrinos')
    const { ringProbability } = await import('./js/experiments/core.js')
    const expected = Array.from(mask).reduce((sum, id) => sum + ringProbability(26.8, table.columns.dec[id], atlas.store.getState().ranking.radius), 0)
    return { count: mask.length, expected }
  })
  await expect(panel.locator('[data-about]')).toContainText(`${check.count} filtered IceCat-1 alerts`)
  await expect(panel.locator('[data-list] > li')).toHaveCount(119)
  const first = panel.locator('[data-list] > li').first()
  await expect(first).toContainText('Boötes III')
  const displayed = Number((await first.locator('.t-count').innerText()).match(/([\d.]+) expected/)[1])
  expect(Math.abs(displayed - check.expected)).toBeLessThanOrEqual(0.005)
})

test('GPU picking selects point anchors in 3D and sky views without shader errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openAtlas(page)
  await page.locator('[data-anchor="localgroup"]').click()
  // Coincident entries in the galaxy catalog are also valid picks; isolate curated IDs here.
  await page.evaluate(() => window.__atlas.store.set({ layers: { galaxies: { visible: false }, neutrinos: { visible: false }, fermi: { visible: false } } }))
  for (const view of ['3d', 'sky']) {
    await page.locator(view === '3d' ? '#view3d' : '#viewSky').click()
    await settle(page)
    const point = await page.evaluate(view => {
      const atlas = window.__atlas, canvas = document.querySelector('#universe'), canvasRect = canvas.getBoundingClientRect()
      const buttons = [...document.querySelectorAll('.scene-label')], leaders = [...document.querySelectorAll('.label-leaders line')]
      const selected = atlas.selectionRow()?.name
      const candidates = buttons.flatMap((button, index) => {
        const line = leaders[index], name = button.textContent
        if (!line || name === 'Boötes III' || name === selected) return []
        const x = Number(line.getAttribute('x1')), y = Number(line.getAttribute('y1'))
        const hit = document.elementFromPoint(canvasRect.x + x, canvasRect.y + y)
        return hit === canvas && x > 4 && y > 4 && x < canvasRect.width - 4 && y < canvasRect.height - 4 ? [{ name, x, y }] : []
      })
      const preferred = view === '3d' ? ['Andromeda (M31)', 'Large Magellanic Cloud', 'Small Magellanic Cloud'] : ['Large Magellanic Cloud', 'Small Magellanic Cloud', 'Triangulum (M33)', 'Fornax dSph']
      return preferred.map(name => candidates.find(point => point.name === name)).find(Boolean) || candidates[0] || null
    }, view)
    expect(point, `${view} has a visible point anchor outside the controls`).not.toBeNull()
    await page.locator('#universe').click({ position: { x: point.x, y: point.y } })
    await expect.poll(() => page.evaluate(() => window.__atlas.selectionRow()?.name)).toBe(point.name)
  }
  expect(errors).toEqual([])
})

test('catalog sync reloads tables while retaining filters, masks and GPU selection', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openAtlas(page)
  await page.evaluate(() => window.__atlas.store.set({
    selection: null,
    layers: { galaxies: { visible: false, filters: { mpcMax: 1 } }, neutrinos: { visible: false, filters: { energyMin: 300000 } } },
  }))
  await page.waitForFunction(() => {
    const atlas = window.__atlas
    return atlas.masks.get('neutrinos')?.length > 0 && atlas.masks.get('neutrinos').length < 275 && atlas.masks.get('galaxies')?.length > 0 && atlas.masks.get('galaxies').length < 118
  })
  const result = await page.evaluate(async () => {
    const atlas = window.__atlas, before = new Map(atlas.tables)
    const ids = ['curated', 'galaxies', 'neutrinos']
    const beforeMasks = Object.fromEntries(ids.map(id => [id, Array.from(atlas.masks.get(id))]))
    const filters = Object.fromEntries(ids.map(id => [id, structuredClone(atlas.store.getState().layers[id].filters)]))
    await atlas.syncCatalogs()
    return {
      replaced: Object.fromEntries([...before].map(([id, table]) => [id, table !== atlas.tables.get(id)])),
      beforeMasks,
      afterMasks: Object.fromEntries(ids.map(id => [id, Array.from(atlas.masks.get(id))])),
      filters,
      afterFilters: Object.fromEntries(ids.map(id => [id, atlas.store.getState().layers[id].filters])),
      errors: [...before.keys()].filter(id => atlas.status.get(id)?.error),
    }
  })
  expect(Object.values(result.replaced)).toEqual([true, true, true, true])
  expect(result.errors).toEqual([])
  expect(result.afterFilters).toEqual(result.filters)
  expect(result.afterMasks).toEqual(result.beforeMasks)
  await settle(page)
  const point = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.scene-label')], index = labels.findIndex(label => label.textContent === 'Boötes III')
    const line = document.querySelectorAll('.label-leaders line')[index]
    return line ? { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) } : null
  })
  expect(point).not.toBeNull()
  await page.locator('#universe').click({ position: point })
  await expect.poll(() => page.evaluate(() => window.__atlas.store.getState().selection)).toEqual({ layer: 'curated', id: 1 })
  await expect(page.locator('[data-panel="inspector"]')).toContainText('Boötes III')
  expect(errors).toEqual([])
})
