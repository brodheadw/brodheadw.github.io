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
  return page.evaluate(margin => {
    const canvas = document.querySelector('#universe'), rect = canvas.getBoundingClientRect()
    for (const y of [.55, .45, .65, .35]) for (const x of [.55, .4, .7, .3]) {
      const point = { x: rect.x + rect.width * x, y: rect.y + rect.height * y }
      if ([-margin, 0, margin].every(dx => document.elementFromPoint(point.x + dx, point.y) === canvas)) return point
    }
    throw Error('No unobstructed canvas gesture point')
  }, margin)
}
