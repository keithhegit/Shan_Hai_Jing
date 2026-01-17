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

test('input: B/H toggles inventory and F grabs pet', async ({ page }) => {
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
    const world = window.Experience?.world
    return Boolean(world?.player && world?.animals?.length)
  }, { timeout: 90_000 })

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'backpack', { timeout: 10_000 })

  await page.keyboard.press('h')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'warehouse', { timeout: 10_000 })

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'backpack', { timeout: 10_000 })

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === null, { timeout: 10_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const animal = world.animals[0]
    if (!animal?.group)
      return

    const a = animal.group.position
    const x = a.x
    const z = a.z - 2.2
    const y = world._getSurfaceY(x, z)

    world.player.teleportTo(x, y + 1.1, z)
    world.player.setFacing(Math.atan2(a.x - x, a.z - z))
  })

  await page.evaluate(() => {
    const world = window.Experience.world
    if (world && !world.__pwOldFindGrabCandidateAnimal) {
      world.__pwOldFindGrabCandidateAnimal = world._findGrabCandidateAnimal
      world._findGrabCandidateAnimal = () => world.animals?.[0] ?? null
    }
  })

  await page.keyboard.press('f')
  await page.waitForFunction(() => Boolean(window.Experience?.world?._carriedAnimal), { timeout: 10_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    if (world?.__pwOldFindGrabCandidateAnimal) {
      world._findGrabCandidateAnimal = world.__pwOldFindGrabCandidateAnimal
      delete world.__pwOldFindGrabCandidateAnimal
    }
  })

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

test('material gun: equip from inventory and laser deals dot', async ({ page }) => {
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
    const world = window.Experience?.world
    return Boolean(world?.player && world?.animals?.length)
  }, { timeout: 90_000 })

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'backpack', { timeout: 10_000 })

  const closeButton = page.getByRole('button', { name: /关闭 \(ESC\/B\/H\)/ })
  await expect(closeButton).toBeVisible({ timeout: 10_000 })

  const inventoryModal = closeButton.locator('..').locator('..')
  await expect(inventoryModal.getByText('物质枪', { exact: true })).toBeVisible({ timeout: 10_000 })

  const gunRow = inventoryModal
    .getByText('物质枪', { exact: true })
    .locator('xpath=ancestor::*[contains(@class,"flex")][1]')
  await gunRow.getByRole('button', { name: '装备/收起' }).click()
  await page.waitForFunction(() => Boolean(window.Experience?.world?._isMaterialGunEquipped), { timeout: 10_000 })

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === null, { timeout: 10_000 })

  const { hpBefore } = await page.evaluate(() => {
    const world = window.Experience.world
    const animal = world.animals[0]

    const a = animal.group.position
    const x = a.x
    const z = a.z - 3.0
    const y = world._getSurfaceY(x, z)
    world.player.teleportTo(x, y + 1.1, z)
    world.player.setFacing(Math.atan2(a.x - x, a.z - z))

    world._lockedEnemy?.setLocked?.(false)
    world._lockedEnemy = animal
    world._lockedEnemy?.setLocked?.(true)
    const targetPos = world._getEnemyLockTargetPos?.(animal)
    if (targetPos)
      world.cameraRig?.setLookAtOverride?.(targetPos)
    world._startMaterialGunFire()

    return { hpBefore: animal.hp }
  })

  await page.waitForFunction((hp) => {
    const world = window.Experience?.world
    const animal = world?.animals?.[0]
    return Boolean(world?._materialGunBeam?.visible && Number(animal?.hp) < Number(hp))
  }, hpBefore, { timeout: 12_000 })

  const { hpAfter, forcedAggro } = await page.evaluate(() => {
    const world = window.Experience.world
    const animal = world.animals[0]
    const now = world.experience?.time?.elapsed ?? 0
    const forcedAggro = (animal?.behavior?.forceAggroUntil ?? 0) > now
    world._stopMaterialGunFire()
    return { hpAfter: animal.hp, forcedAggro }
  })

  expect(hpAfter).toBeLessThan(hpBefore)
  expect(forcedAggro).toBe(true)
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})
