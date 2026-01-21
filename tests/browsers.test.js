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
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('input: B opens backpack; warehouse opens only via E near warehouse', async ({ page }) => {
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
  await page.waitForTimeout(150)
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'backpack', { timeout: 10_000 })

  await page.evaluate(() => {
    const world = window.Experience?.world
    world?._closeInventoryPanel?.()
  })
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === null, { timeout: 20_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const item = world.interactables?.find(i => i.id === 'warehouse')
    if (!item)
      return
    const x = item.x
    const z = item.z - 1.2
    const y = world._getSurfaceY(x, z)
    world.player.teleportTo(x, y + 1.1, z)
    const dx = item.x - x
    const dz = item.z - z
    const facing = world._getFacingTo ? world._getFacingTo(dx, dz) : Math.atan2(dx, dz)
    world.player.setFacing(facing)
  })

  await page.keyboard.press('e')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'warehouse', { timeout: 10_000 })

  await page.evaluate(() => {
    const world = window.Experience?.world
    world?._closeInventoryPanel?.()
  })
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === null, { timeout: 20_000 })

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
    const dx = a.x - x
    const dz = a.z - z
    const facing = world._getFacingTo ? world._getFacingTo(dx, dz) : Math.atan2(dx, dz)
    world.player.setFacing(facing)
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
    const portal = (world._dungeonPortals || []).find(p => p.id === 'snow') ?? (world._dungeonPortals || [])[0]
    if (portal)
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
    const dx2 = epos.x - x
    const dz2 = epos.z - z
    const facing2 = world._getFacingTo ? world._getFacingTo(dx2, dz2) : Math.atan2(dx2, dz2)
    world.player.setFacing(facing2)

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

  const pre = await page.evaluate(() => {
    const world = window.Experience.world
    return {
      hasHeartHud: Boolean(world?._heartHud),
      hasMatterGun: Boolean(world?.player?._matterGun),
    }
  })
  expect(pre.hasHeartHud).toBe(false)
  expect(pre.hasMatterGun).toBe(false)

  await page.keyboard.press('b')
  await page.waitForFunction(() => window.Experience?.world?._activeInventoryPanel === 'backpack', { timeout: 10_000 })

  const closeButton = page.getByRole('button', { name: /关闭 \(ESC\/B\)/ })
  await expect(closeButton).toBeVisible({ timeout: 10_000 })

  const inventoryModal = closeButton.locator('..').locator('..')
  await expect(inventoryModal.getByText('物质枪', { exact: true })).toBeVisible({ timeout: 10_000 })

  const gunRow = inventoryModal
    .getByText('物质枪', { exact: true })
    .locator('xpath=ancestor::*[contains(@class,"flex")][1]')
  await gunRow.getByRole('button', { name: '装备/收起' }).click()
  await page.waitForFunction(() => Boolean(window.Experience?.world?._isMaterialGunEquipped), { timeout: 10_000 })

  const equipped = await page.evaluate(() => {
    const world = window.Experience.world
    const gun = world?.player?._matterGun || null
    const parent = gun?.parent || null
    const movementGroup = world?.player?.movement?.group || null
    const camera = world?.experience?.camera?.instance || null
    return {
      hasGun: Boolean(gun),
      parentIsMovementGroup: Boolean(parent && movementGroup && parent === movementGroup),
      parentIsCamera: Boolean(parent && camera && parent === camera),
    }
  })
  expect(equipped.hasGun).toBe(true)
  expect(equipped.parentIsMovementGroup).toBe(true)
  expect(equipped.parentIsCamera).toBe(false)

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
    const dx3 = a.x - x
    const dz3 = a.z - z
    const facing3 = world._getFacingTo ? world._getFacingTo(dx3, dz3) : Math.atan2(dx3, dz3)
    world.player.setFacing(facing3)

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
  }, hpBefore, { timeout: 25_000 })

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

test('material gun: firing while locked quickly faces target', async ({ page }) => {
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
    const portal = (world._dungeonPortals || []).find(p => p.id === 'snow') ?? (world._dungeonPortals || [])[0]
    if (portal)
      world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonEnemies?.length), { timeout: 20_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const enemy = (world._dungeonEnemies || []).find(e => e && !e.isBoss && !e.isDead) || world._dungeonEnemies?.[0] || null
    if (!enemy || !world?.player)
      return

    const epos = enemy.group.position.clone()
    const x = epos.x
    const z = epos.z - 7.0
    const y = world._getSurfaceY(x, z)
    world.player.teleportTo(x, y + 1.1, z)

    const desired = Math.atan2(epos.x - x, epos.z - z)
    const away = desired + Math.PI
    world.player.setFacing(away)
    if (typeof world.player.targetFacingAngle === 'number')
      world.player.targetFacingAngle = away

    world._lockedEnemy?.setLocked?.(false)
    world._lockedEnemy = enemy
    world._lockedEnemy?.setLocked?.(true)

    world._isMaterialGunEquipped = true
    world.player.setMatterGunEquipped?.(true)
    world._startMaterialGunFire()

    window.__pwFacingEnemy = enemy
  })

  await page.waitForFunction(() => {
    const world = window.Experience?.world
    const enemy = window.__pwFacingEnemy
    if (!world?.player || !enemy?.group)
      return false
    const p = world.player.getPosition()
    const epos = enemy.group.position
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const len = Math.hypot(dx, dz)
    if (!(len > 0.0001))
      return true
    const facing = world.player.getFacingAngle()
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)
    const nx = dx / len
    const nz = dz / len
    const dot = fx * nx + fz * nz
    return dot >= 0.75
  }, { timeout: 3_000 })

  const dot = await page.evaluate(() => {
    const world = window.Experience.world
    const enemy = window.__pwFacingEnemy
    if (!world?.player || !enemy?.group)
      return null
    const p = world.player.getPosition()
    const epos = enemy.group.position
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const len = Math.hypot(dx, dz)
    const facing = world.player.getFacingAngle()
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)
    const nx = len > 0.0001 ? (dx / len) : 0
    const nz = len > 0.0001 ? (dz / len) : 0
    const dot = fx * nx + fz * nz

    world._stopMaterialGunFire()
    world._isMaterialGunEquipped = false
    world.player.setMatterGunEquipped?.(false)
    world._clearLockOn?.()
    delete window.__pwFacingEnemy

    return dot
  })

  expect(dot).not.toBeNull()
  expect(dot).toBeGreaterThanOrEqual(0.75)
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('lock-on: works even when an interactable prompt is active', async ({ page }) => {
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
    return Boolean(world?.player && world?.animals?.length && world?.interactables?.length)
  }, { timeout: 90_000 })

  const result = await page.evaluate(() => {
    const world = window.Experience.world
    const warehouse = world.interactables?.find(i => i.id === 'warehouse') || null
    const target = world.animals?.find(a => a && !a.isDead && a.group) || null
    if (!warehouse || !target)
      return { ok: false, active: null, locked: false }

    const x = warehouse.x
    const z = warehouse.z - 1.2
    const y = world._getSurfaceY(x, z)
    world.player.teleportTo(x, y + 1.1, z)
    world._updateInteractables?.()

    world._toggleLockOn?.()
    const locked = Boolean(world._lockedEnemy)
    const active = world._activeInteractableId
    world._clearLockOn?.()
    return { ok: true, active, locked }
  })

  expect(result.ok).toBe(true)
  expect(result.active).not.toBeNull()
  expect(result.locked).toBe(true)
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('dungeon: coin pickup is single-use and lock-on still works', async ({ page }) => {
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
    const portal = (world._dungeonPortals || []).find(p => p.id === 'snow') ?? (world._dungeonPortals || [])[0]
    if (portal)
      world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonEnemies?.length), { timeout: 20_000 })

  const before = await page.evaluate(() => {
    const world = window.Experience.world
    const enemy = (world._dungeonEnemies || []).find(e => e && !e.isBoss && !e.isDead && e.group) || null
    if (!enemy)
      return { ok: false }

    world._spawnDungeonCoinDrop?.(enemy)
    const coin = (world._dungeonInteractables || []).find(i => i && i.pickupItemId === 'coin') || null
    if (!coin)
      return { ok: false }

    const x = coin.x
    const z = coin.z - 1.4
    const y = world._getSurfaceY(x, z)
    world.player.teleportTo(x, y + 1.1, z)
    world._updateDungeonInteractables?.()

    const coinBefore = Number(world._inventory?.backpack?.items?.coin || 0)
    world._toggleLockOn?.()
    const lockedWhilePrompt = Boolean(world._lockedEnemy)
    world._clearLockOn?.()

    return {
      ok: true,
      hasPrompt: world._activeInteractableId === coin.id,
      lockedWhilePrompt,
      coinBefore,
    }
  })

  expect(before.ok).toBe(true)
  expect(before.hasPrompt).toBe(true)
  expect(before.lockedWhilePrompt).toBe(true)

  await page.keyboard.press('e')
  await page.waitForTimeout(100)
  const after1 = await page.evaluate(() => Number(window.Experience.world._inventory?.backpack?.items?.coin || 0))
  expect(after1).toBe(before.coinBefore + 1)

  await page.keyboard.press('e')
  await page.waitForTimeout(100)
  const after2 = await page.evaluate(() => Number(window.Experience.world._inventory?.backpack?.items?.coin || 0))
  expect(after2).toBe(after1)

  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('dungeon: layout has 4 fight rooms with branching/loop and themed boss', async ({ page }) => {
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

  await page.waitForFunction(() => Boolean(window.Experience?.world?._blockDungeonGenerator), { timeout: 60_000 })

  const result = await page.evaluate(() => {
    const gen = window.Experience.world._blockDungeonGenerator
    const layout = gen._createLayout('plains')
    const roomTypes = layout?.rooms?.map(r => r.type) ?? []
    const corridors = layout?.corridors ?? []
    const hasRightAxis = corridors.some(c => c.axis === 'right')
    const minCorridorWidth = corridors.reduce((acc, c) => Math.min(acc, Number(c?.width) || Infinity), Infinity)
    return {
      rooms: layout?.rooms?.length ?? 0,
      roomTypes,
      corridorCount: corridors.length,
      hasRightAxis,
      minCorridorWidth,
    }
  })

  expect(result.rooms).toBe(8)
  for (const t of ['entrance', 'fight1', 'fight2', 'fight3', 'fight4', 'boss', 'treasure', 'exit'])
    expect(result.roomTypes).toContain(t)
  expect(result.corridorCount).toBeGreaterThanOrEqual(7)
  expect(result.hasRightAxis).toBe(true)
  expect(result.minCorridorWidth).toBeGreaterThanOrEqual(7)

  await page.evaluate(() => {
    const world = window.Experience.world
    const portal = (world._dungeonPortals || []).find(p => p.id === 'plains') ?? (world._dungeonPortals || [])[0]
    if (portal)
      world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonEnemies?.length), { timeout: 20_000 })

  const boss = await page.evaluate(() => {
    const world = window.Experience.world
    const enemies = world._dungeonEnemies || []
    const b = enemies.find(e => e?.isBoss) || null
    return {
      count: enemies.length,
      bossCount: enemies.filter(e => e?.isBoss).length,
      minionCount: enemies.filter(e => e && !e.isBoss).length,
      boss: b ? { isBoss: true, type: b._resourceKey || b._typeLabel || b.type || null, maxHp: b.maxHp, hp: b.hp } : null,
    }
  })

  expect(boss.boss).not.toBeNull()
  expect(boss.count).toBe(5)
  expect(boss.bossCount).toBe(1)
  expect(boss.minionCount).toBe(4)
  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})

test('scale: player visual is smaller to reduce corridor occlusion', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.Experience?.world?.player?.model), { timeout: 90_000 })

  const s = await page.evaluate(() => {
    const m = window.Experience.world.player.model
    return { x: m.scale.x, y: m.scale.y, z: m.scale.z }
  })

  expect(s.x).toBeCloseTo(0.5, 3)
  expect(s.y).toBeCloseTo(0.5, 3)
  expect(s.z).toBeCloseTo(0.5, 3)
})

test('dungeon: exit marker is in a clear spot', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.Experience?.world?._dungeonPortals?.length), { timeout: 90_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const portal = (world._dungeonPortals || []).find(p => p.id === 'plains') ?? (world._dungeonPortals || [])[0]
    if (portal)
      world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonExit), { timeout: 20_000 })

  const clear = await page.evaluate(() => {
    const world = window.Experience.world
    const exit = world._dungeonExit
    const cm = world.chunkManager
    if (!exit || !cm?.getBlockWorld)
      return { ok: false, reason: 'no-exit-or-getBlockWorld' }
    const x = Math.floor(exit.x)
    const z = Math.floor(exit.z)
    const y = Math.floor(world._getSurfaceY(exit.x, exit.z))
    const ids = []
    for (let dy = 1; dy <= 4; dy++) {
      const b = cm.getBlockWorld(x, y + dy, z)
      ids.push(b?.id ?? 0)
    }
    const ok = ids.every(id => !id)
    return { ok, ids, x, y, z }
  })

  expect(clear.ok, JSON.stringify(clear)).toBe(true)
})

test('dungeon: minion drops coin and pickup goes to backpack', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.Experience?.world?.player && window.Experience?.world?._dungeonPortals?.length), { timeout: 90_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const portal = (world._dungeonPortals || []).find(p => p.id === 'plains') ?? (world._dungeonPortals || [])[0]
    if (portal)
      world._activatePortal(portal)
  })

  await page.waitForFunction(() => window.Experience.world.currentWorld === 'dungeon', { timeout: 20_000 })
  await page.waitForFunction(() => Boolean(window.Experience.world._dungeonEnemies?.length), { timeout: 20_000 })

  const before = await page.evaluate(() => {
    const world = window.Experience.world
    const coins = world?._inventory?.backpack?.items?.coin ?? 0
    const enemy = (world._dungeonEnemies || []).find(e => e && !e.isBoss && !e.isDead) || null
    if (!enemy)
      return { coins, killed: false }
    enemy.takeDamage?.(999)
    return { coins, killed: true }
  })
  expect(before.killed).toBe(true)

  await page.waitForFunction(() => {
    const world = window.Experience?.world
    return Boolean((world?._dungeonInteractables || []).some(i => i?.pickupItemId === 'coin' && !i.read))
  }, { timeout: 15_000 })

  const after = await page.evaluate(() => {
    const world = window.Experience.world
    const item = (world._dungeonInteractables || []).find(i => i?.pickupItemId === 'coin' && !i.read) || null
    if (!item)
      return { ok: false }
    world._activeInteractable = item
    world._activeInteractableId = item.id
    world._onInteract()
    const coins = world?._inventory?.backpack?.items?.coin ?? 0
    return { ok: true, coins }
  })

  expect(after.ok).toBe(true)
  expect(after.coins).toBeGreaterThan(before.coins)
})

test('camera: obstruction never places camera inside solid blocks', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.Experience?.world?.player && window.Experience?.world?.chunkManager), { timeout: 90_000 })

  const placed = await page.evaluate(() => {
    const world = window.Experience.world
    const cm = world.chunkManager
    const cam = world.experience.camera.instance
    const p = world.player.getPosition()
    const c = cam.position.clone()
    const dir = c.clone().sub(p)
    const len = dir.length()
    if (!(len > 0.5))
      return null
    dir.multiplyScalar(1 / len)
    const mid = p.clone().add(dir.multiplyScalar(len * 0.7))
    const ix = Math.floor(mid.x)
    const iz = Math.floor(mid.z)
    const baseY = cm.getTopSolidYWorld(ix, iz)
    const top = (typeof baseY === 'number' ? baseY : 10) + 1
    for (let yy = top; yy <= top + 4; yy++)
      cm.addBlockWorld(ix, yy, iz, 3)
    return { ix, iz, top }
  })

  expect(placed).not.toBeNull()
  await page.waitForTimeout(600)

  const inside = await page.evaluate(() => {
    const world = window.Experience.world
    const cm = world.chunkManager
    const cam = world.experience.camera.instance
    const cx = Math.floor(cam.position.x)
    const cz = Math.floor(cam.position.z)
    const cy = Math.floor(cam.position.y)
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      const block = cm.getBlockWorld(cx, yy, cz)
      if (block?.id && block.id !== 0)
        return true
    }
    return false
  })

  expect(inside).toBe(false)
})

test('camera: front wall should not trigger snap-to-wall', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.Experience?.world?.player && window.Experience?.world?.chunkManager), { timeout: 90_000 })

  await page.evaluate(() => {
    const world = window.Experience.world
    const cm = world.chunkManager
    const p = world.player.getPosition()
    const x = Math.floor(p.x)
    const z = Math.floor(p.z)
    const baseY = cm.getTopSolidYWorld(x, z)
    const top = (typeof baseY === 'number' ? baseY : 10) + 1
    for (let yy = top; yy <= top + 4; yy++)
      cm.addBlockWorld(x, yy, z + 2, 2)
    world.player.setFacing(0)
  })

  await page.waitForTimeout(350)

  await page.evaluate(() => {
    const world = window.Experience.world
    world.cameraRig?.toggleSide?.()
  })

  await page.waitForTimeout(800)

  const inside = await page.evaluate(() => {
    const world = window.Experience.world
    const cm = world.chunkManager
    const cam = world.experience.camera.instance
    const cx = Math.floor(cam.position.x)
    const cz = Math.floor(cam.position.z)
    const cy = Math.floor(cam.position.y)
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      const block = cm.getBlockWorld(cx, yy, cz)
      if (block?.id && block.id !== 0)
        return true
    }
    return false
  })

  expect(inside).toBe(false)
})

test('dungeon: each portal spawns themed enemies and boss', async ({ page }) => {
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
  await page.waitForFunction(() => Boolean(window.Experience?.world?._blockDungeonGenerator), { timeout: 60_000 })

  const expectations = {
    plains: 'giant',
    snow: 'yeti2',
    desert: 'dino',
    forest: 'mushroomking',
    mine: 'skeleton_armor',
  }

  const snapshot = await page.evaluate(() => {
    const gen = window.Experience.world._blockDungeonGenerator
    const result = {}
    for (const id of ['plains', 'snow', 'desert', 'forest', 'mine']) {
      const p1 = gen._getEnemyPool(id, 1)
      const p4 = gen._getEnemyPool(id, 4)
      result[id] = {
        stage1: Array.isArray(p1?.adds) ? p1.adds : [],
        boss: p4?.boss ?? null,
        stage4Adds: Array.isArray(p4?.adds) ? p4.adds : [],
      }
    }
    return result
  })

  for (const [id, boss] of Object.entries(expectations)) {
    expect(snapshot[id]?.boss).toBe(boss)
    expect((snapshot[id]?.stage1 || []).length).toBeGreaterThan(0)
    expect((snapshot[id]?.stage4Adds || []).length).toBeGreaterThan(0)
  }

  expect(pageErrors, `pageerror:\n${pageErrors.join('\n')}`).toEqual([])
  expect(consoleErrors, `console.error:\n${consoleErrors.join('\n')}`).toEqual([])
})
