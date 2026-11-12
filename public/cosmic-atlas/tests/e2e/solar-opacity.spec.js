import { test, expect } from '@playwright/test'

test('Solar opacity reaches every body, the Earth shader and solar orbits; zero hides labels', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__atlas?.ready)
  if (await page.locator('#about').evaluate(dialog => dialog.open)) await page.locator('#aboutExplore').click()
  await page.evaluate(() => {
    const renderer = window.__atlas.renderer.renderer, render = renderer.render
    renderer.render = function (scene, camera) {
      const bodies = [], smallBodies = [], orbits = []
      scene.traverse(object => {
        if (object.isMesh && object.geometry.type === 'SphereGeometry' && object.userData.pickMaterial) (object.userData.bodyId?.startsWith('small:') ? smallBodies : bodies).push({ visible: object.visible, opacity: object.material.opacity, earthOpacity: object.material.uniforms?.opacity?.value })
        if (object.isLine && object.userData.physical && !object.userData.geocentric) orbits.push({ visible: object.visible, opacity: object.material.opacity })
      })
      const result = render.call(this, scene, camera)
      if (bodies.length) window.__solarOpacity = { bodies, smallBodies, orbits, triangles: this.info.render.triangles }
      return result
    }
  })
  await page.selectOption('#workspace', 'solar')
  await page.waitForFunction(() => window.__atlas.bodies.some(body => body.id.startsWith('small:')))
  const sun = page.locator('.scene-label').filter({ hasText: /^Sun$/ })
  await expect(sun).toBeVisible()
  const slider = page.locator('[data-layer="solar"] input[type="range"]')
  const changeOpacity = value => slider.evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })) }, value)
  await changeOpacity(.4)
  await page.waitForFunction(() => {
    const result = window.__solarOpacity
    return result?.bodies.length >= 10 && result.bodies.every(body => body.opacity === .4) && result.bodies.some(body => body.earthOpacity === .4) && result.smallBodies.length > 0 && result.smallBodies.every(body => body.opacity === 1) && result.orbits.length > 0 && result.orbits.every(orbit => orbit.opacity === .2)
  })
  await changeOpacity(0)
  await expect(sun).toHaveCount(0)
  await page.waitForFunction(() => { const result = window.__solarOpacity; return result.bodies.every(body => !body.visible) && result.orbits.every(orbit => !orbit.visible) && result.smallBodies.some(body => body.visible && body.opacity === 1) })
  await changeOpacity(1)
  await expect(sun).toBeVisible()
  await page.waitForFunction(() => window.__solarOpacity.bodies.some(body => body.visible) && window.__solarOpacity.triangles > 0)
})
