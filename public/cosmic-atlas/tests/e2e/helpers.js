import { expect } from '@playwright/test'

export async function openAtlas(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__atlas?.ready)
  await expect(page.locator('#sceneError')).toBeHidden()
  if (await page.locator('#about').evaluate(dialog => dialog.open)) await page.locator('#aboutExplore').click()
}
export async function pauseClock(page) {
  await page.evaluate(() => window.__atlas.store.set({ clock: { utc: '2026-11-12T12:00:00Z', rate: 1, paused: true } }))
}
export async function settleCamera(page) {
  await page.waitForFunction(() => {
    const a = window.__atlas, goal = a.store.getState().camera, rig = a.renderer.getRig()
    return Math.hypot(...goal.target.map((v, i) => v - rig.target[i])) / goal.distance < 1e-7 && Math.abs(rig.distance / goal.distance - 1) < 1e-7 && Math.abs(rig.yaw - goal.yaw) < 1e-7 && Math.abs(rig.pitch - goal.pitch) < 1e-7
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
export async function canvasPoint(page, margin = 0) {
  await settleCamera(page)
  for (let attempt = 0; attempt < 4; attempt++) {
    const point = await page.evaluate(margin => {
      const canvas = document.querySelector('#universe'), rect = canvas.getBoundingClientRect()
      for (const y of [.55, .45, .65, .35]) for (const x of [.55, .4, .7, .3]) {
        const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y }
        if ([-margin, 0, margin].every(dx => document.elementFromPoint(point.x + dx, point.y) === canvas)) return point
      }
      throw Error('No unobstructed canvas gesture point')
    }, margin)
    await page.mouse.move(point.x, point.y)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const clear = await page.evaluate(({ point, margin }) => [-margin, 0, margin].every(dx => document.elementFromPoint(point.x + dx, point.y) === document.querySelector('#universe')), { point, margin })
    if (clear) return point
  }
  throw Error('No stable canvas point after hover labels updated')
}

export async function nativeCanvasEvent(page, type, action, count = 1) {
  await page.evaluate(({ type, count }) => {
    window.__nativeCanvasEvents = []
    const record = event => {
      const item = { type, target: event.target.id || event.target.outerHTML.slice(0, 180), alt: event.altKey, shift: event.shiftKey, buttons: event.buttons, dx: event.deltaX, dy: event.deltaY }
      window.__nativeCanvasEvents.push(item)
      ;(window.__nativeInputHistory ??= []).push(item)
      if (window.__nativeCanvasEvents.length === count) document.removeEventListener(type, record, true)
    }
    document.addEventListener(type, record, true)
  }, { type, count })
  await action()
  await expect.poll(() => page.evaluate(() => window.__nativeCanvasEvents.length)).toBe(count)
  const events = await page.evaluate(() => window.__nativeCanvasEvents)
  for (const event of events) expect(event.target, `Native ${type} must reach the canvas: ${JSON.stringify(event)}`).toBe('universe')
  return events
}
