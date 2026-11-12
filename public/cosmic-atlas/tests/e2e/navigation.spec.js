import { test, expect } from '@playwright/test'
import { openAtlas, pauseClock, settleCamera, canvasPoint } from './helpers.js'

const camera = page => page.evaluate(() => window.__atlas.store.getState().camera)
function assertPan(before, after, label = 'pan') {
  expect(Math.hypot(...after.target.map((v, i) => v - before.target[i])) / before.distance, label).toBeGreaterThan(.005)
  expect(after.distance).toBeCloseTo(before.distance, 24)
  expect(after.yaw).toBe(before.yaw); expect(after.pitch).toBe(before.pitch)
  expect(after.mode).toBe('orbit')
}

test('right, middle and Shift drags pan at Solar and Earth scales without rotating', async ({ page }) => {
  await openAtlas(page); await pauseClock(page)
  for (const workspace of ['solar', 'earth']) {
    await page.selectOption('#workspace', workspace); await settleCamera(page)
    for (const gesture of [{ button: 'right' }, { button: 'middle' }, { button: 'left', shift: true }]) {
      const before = await camera(page), point = await canvasPoint(page)
      await page.mouse.move(point.x, point.y)
      if (gesture.shift) await page.keyboard.down('Shift')
      await page.mouse.down({ button: gesture.button }); await page.mouse.move(point.x + 35, point.y + 20, { steps: 4 }); await page.mouse.up({ button: gesture.button })
      if (gesture.shift) await page.keyboard.up('Shift')
      const label = `${workspace} ${gesture.shift ? 'Shift+' : ''}${gesture.button} pan`
      await expect.poll(async () => Math.hypot(...(await camera(page)).target.map((v, i) => v - before.target[i])) / before.distance, { message: label }).toBeGreaterThan(.005)
      assertPan(before, await camera(page), label)
    }
  }
})

test('pixel trackpad scrolling pans while Alt and discrete wheel gestures zoom', async ({ page }) => {
  await openAtlas(page); await pauseClock(page); await page.selectOption('#workspace', 'solar'); await settleCamera(page)
  const wheelScale = await page.evaluate(() => devicePixelRatio)
  const point = await canvasPoint(page); await page.mouse.move(point.x, point.y)
  const before = await camera(page)
  await page.mouse.wheel(20 * wheelScale, 15 * wheelScale)
  await expect.poll(async () => JSON.stringify((await camera(page)).target)).not.toBe(JSON.stringify(before.target))
  assertPan(before, await camera(page))
  const panned = await camera(page)
  const zoomPoint = await canvasPoint(page); await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.keyboard.down('Alt'); await page.mouse.wheel(0, 60 * wheelScale); await page.keyboard.up('Alt')
  await expect.poll(async () => (await camera(page)).distance / panned.distance).toBeGreaterThan(1.05)
  const zoomed = await camera(page)
  const wheelPoint = await canvasPoint(page); await page.mouse.move(wheelPoint.x, wheelPoint.y)
  await page.mouse.wheel(0, -120 * wheelScale)
  await expect.poll(async () => (await camera(page)).distance / zoomed.distance).toBeLessThan(.9)
})

test('two touch contacts separate centroid pan from pinch zoom', async ({ page, context }) => {
  await openAtlas(page); await pauseClock(page); await page.selectOption('#workspace', 'solar'); await settleCamera(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
  const point = await canvasPoint(page, 45), touch = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2 })
  const before = await camera(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, point.x - 30, point.y), touch(2, point.x + 30, point.y)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, point.x - 5, point.y + 10), touch(2, point.x + 55, point.y + 10)] })
  await expect.poll(async () => Math.hypot(...(await camera(page)).target.map((v, i) => v - before.target[i])) / before.distance).toBeGreaterThan(.005)
  await expect.poll(async () => (await camera(page)).distance / before.distance).toBeCloseTo(1, 6)
  const panned = await camera(page)
  expect(Math.hypot(...panned.target.map((v, i) => v - before.target[i])) / before.distance).toBeGreaterThan(.005)
  expect(panned.distance / before.distance).toBeCloseTo(1, 6)
  expect(panned.yaw).toBe(before.yaw); expect(panned.pitch).toBe(before.pitch)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, point.x - 20, point.y + 10), touch(2, point.x + 70, point.y + 10)] })
  await expect.poll(async () => (await camera(page)).distance / panned.distance).toBeCloseTo(2 / 3, 6)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
})

test('All Sky retains canvas pan and zoom with synchronized view controls', async ({ page }) => {
  await openAtlas(page); await page.locator('#viewSky').click()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForTimeout(150)
  const anchor = () => page.evaluate(() => {
    const i = [...document.querySelectorAll('.scene-label')].findIndex(label => label.textContent === 'Boötes III'), line = document.querySelectorAll('.label-leaders line')[i]
    return line ? [Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))] : null
  })
  await expect.poll(anchor).not.toBeNull()
  const before = await anchor(), point = await canvasPoint(page)
  await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(point.x + 30, point.y + 20, { steps: 4 }); await page.mouse.up({ button: 'right' })
  await expect.poll(async () => { const p = await anchor(); return p ? Math.hypot(p[0] - before[0], p[1] - before[1]) : 0 }).toBeGreaterThan(20)
  const panned = await anchor()
  const zoomPoint = await canvasPoint(page); await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -200 * await page.evaluate(() => devicePixelRatio))
  await expect.poll(async () => { const p = await anchor(); return p ? Math.hypot(p[0] - panned[0], p[1] - panned[1]) : 0 }).toBeGreaterThan(2)
  await expect(page.locator('#viewSky')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#scaleReadout')).toHaveText('ALL SKY')
})

test('Solar bodies retain physical radii with separate locators and a named Oort schematic', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await openAtlas(page); await pauseClock(page)
  await page.evaluate(() => {
    const renderer = window.__atlas.renderer.renderer, render = renderer.render
    renderer.render = function (scene, camera) {
      const bodies = []
      scene.traverse(mesh => { if (mesh.userData.bodyId) bodies.push({ id: mesh.userData.bodyId, scale: mesh.scale.x, textureWidth: mesh.material.map?.image?.width || mesh.material.uniforms?.day?.value.image?.width || 0 }) })
      if (bodies.length) window.__bodyScales = bodies
      return render.call(this, scene, camera)
    }
  })
  await page.selectOption('#workspace', 'solar'); await settleCamera(page)
  await expect(page.locator('.scene-label[data-body-marker="sun"]')).toBeVisible()
  await page.waitForFunction(() => ['earth', 'moon', 'mercury', 'mars', 'jupiter'].every(id => window.__bodyScales.some(body => body.id === id && body.textureWidth > 1)))
  const ratios = await page.evaluate(() => {
    const a = window.__atlas, distance = a.renderer.getRig().distance, byId = new Map(a.bodies.map(body => [body.id, body]))
    return window.__bodyScales.filter(mesh => byId.get(mesh.id)?.radiusKm > 0).map(mesh => mesh.scale / (byId.get(mesh.id).radiusKm / 3.0856775814913673e19 / distance))
  })
  expect(ratios.length).toBeGreaterThanOrEqual(15)
  for (const ratio of ratios) expect(ratio).toBeCloseTo(1, 10)
  await page.screenshot({ path: testInfo.outputPath('physical-solar-system.png'), fullPage: true })
  const overview = async au => { await page.evaluate(async au => { const { auToMpc } = await import('./js/astro/units.js'); window.__atlas.store.set({ selection: null, camera: { target: [0, 0, 0], distance: auToMpc(au), mode: 'orbit' } }) }, au); await settleCamera(page) }
  await overview(5)
  await expect(page.locator('.scene-label[data-body-marker="mercury"]')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('inner-solar-system.png'), fullPage: true })
  await page.locator('.scene-label[data-body-marker="mercury"]').click(); await settleCamera(page)
  await page.screenshot({ path: testInfo.outputPath('mercury-closeup.png'), fullPage: true })
  await overview(5)
  await page.locator('.scene-label[data-body-marker="sun"]').click(); await settleCamera(page)
  await page.screenshot({ path: testInfo.outputPath('sun-closeup.png'), fullPage: true })
  await overview(5000)
  await settleCamera(page)
  await expect(page.locator('[data-schematic]')).toHaveCount(2)
  await expect(page.locator('[data-schematic]').first()).toContainText('Oort Cloud schematic')
  await page.screenshot({ path: testInfo.outputPath('oort-schematic.png'), fullPage: true })
  expect(errors).toEqual([])
})
