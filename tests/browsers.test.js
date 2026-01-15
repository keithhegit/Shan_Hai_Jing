// @ts-check
import { expect, test } from '@playwright/test'

import _config from '../_config'

const HOST = _config.server.host
const PORT = _config.server.port
const BASE_URL = `http://${HOST}:${PORT}`

test('smoke: app loads without runtime errors', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const consoleErrors = []
  const pageErrors = []

  page.on('console', (msg) => {
    if (msg.type() === 'error')
      consoleErrors.push(msg.text())
  })

  page.on('pageerror', (err) => {
    pageErrors.push(err?.message ?? String(err))
  })

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  const canvas = page.locator('canvas.three-canvas')
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThan(0)

  await page.waitForFunction(() => {
    const exp = window.Experience
    const domCanvas = document.querySelector('canvas.three-canvas')
    if (!exp || !domCanvas)
      return false
    if (!exp.renderer?.instance?.domElement)
      return false
    return exp.canvas === domCanvas && exp.renderer.instance.domElement === domCanvas
  }, { timeout: 20_000 })

  await page.waitForTimeout(500)
  await page.screenshot({ path: testInfo.outputPath('smoke.png'), fullPage: true })

  await page.waitForFunction(() => {
    return Boolean(window.Experience?.world?.player && window.Experience?.world?.portals?.length)
  }, { timeout: 90_000 })

  await page.waitForFunction(() => {
    const world = window.Experience?.world
    return Boolean(world?.animals?.length && world.animalsGroup)
  }, { timeout: 90_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    world._activatePortal(world.portals[0])
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonExit?.mesh), { timeout: 20_000 })
  await page.waitForFunction(() => {
    const world = window.Experience?.world
    return Boolean(world?._dungeonEnemies?.length)
  }, { timeout: 20_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    world._exitDungeon()
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'hub', { timeout: 20_000 })
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('combat: lock-on toggles and melee hit reduces hp', async ({ page }) => {
  test.setTimeout(120_000)
  const consoleErrors = []
  const pageErrors = []

  page.on('console', (msg) => {
    if (msg.type() === 'error')
      consoleErrors.push(msg.text())
  })

  page.on('pageerror', (err) => {
    pageErrors.push(err?.message ?? String(err))
  })

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })

  await page.waitForFunction(() => {
    return Boolean(window.Experience?.world?.player && window.Experience?.world?.portals?.length)
  }, { timeout: 60_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const portal = world.portals.find(p => p.id === 'snow') ?? world.portals[0]
    world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonEnemies?.length), { timeout: 20_000 })

  const result = await page.evaluate(() => {
    const world = window.Experience.world
    const enemy = world._dungeonEnemies[0]

    const range = 2.6
    const hitRadius = enemy.hitRadius ?? 0

    const epos = new enemy.group.position.constructor()
    enemy.group.getWorldPosition(epos)

    const distance = range + hitRadius - 0.05
    const x = epos.x
    const z = epos.z - distance
    const y = world._getSurfaceY(x, z)

    world.player.teleportTo(x, y + 1.1, z)
    world.player.setFacing(Math.atan2(epos.x - x, epos.z - z))

    world._toggleLockOn()
    world._toggleLockOn()

    const hpBefore = enemy.hp
    world._tryPlayerAttack({ damage: 1, range, minDot: 0.35, cooldownMs: 0 })
    const hpAfter = enemy.hp

    return { hpBefore, hpAfter }
  })

  expect(result.hpAfter).toBeLessThan(result.hpBefore)
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})
