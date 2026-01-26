import * as THREE from 'three'
import Experience from '../../experience.js'
import emitter from '../../utils/event-bus.js'
import HumanoidEnemy from '../enemies/humanoid-enemy.js'
import { blocks } from '../terrain/blocks-config.js'

export default class FarmSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    this.experience = new Experience()
    this.resources = this.experience.resources
    this.group = new THREE.Group()
    this._built = false
    this._lastProduceAt = 0
    this._area = null
    this._producePos = null

    const host = this.world?._hubAutomationGroup || this.world?.scene || null
    if (host?.add)
      host.add(this.group)
  }

  destroy() {
    if (this.group?.parent)
      this.group.parent.remove(this.group)
    this.group = null
    this._area = null
    this._producePos = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world || !world.chunkManager)
      return
    this.group.visible = world.currentWorld === 'hub'
    if (world.currentWorld !== 'hub')
      return

    if (!this._built) {
      this._built = true
      this._buildFarm()
    }

    if (!this._area)
      return

    this._produceItems()
  }

  isInsideFarm(x, z) {
    const a = this._area
    if (!a)
      return false
    return x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ
  }

  _applyFarmConstraints() {
    const world = this.world
    const a = this._area
    const allies = Array.isArray(world._summonedAllies) ? world._summonedAllies : []

    for (const ally of allies) {
      if (!ally?.group || ally.isDead)
        continue
      const pos = ally.group.position
      const inside = this.isInsideFarm(pos.x, pos.z)
      if (inside && !ally._isFarmAnimal) {
        ally._isFarmAnimal = true
        if (ally.behavior) {
          ally.behavior.state = 'idle'
          ally.behavior.radius = 3
          ally.behavior.timer = 1.5 + Math.random()
        }
      }
      if (!ally._isFarmAnimal)
        continue

      const margin = 0.8
      let clamped = false
      if (pos.x < a.minX + margin) {
        pos.x = a.minX + margin
        clamped = true
      }
      else if (pos.x > a.maxX - margin) {
        pos.x = a.maxX - margin
        clamped = true
      }
      if (pos.z < a.minZ + margin) {
        pos.z = a.minZ + margin
        clamped = true
      }
      else if (pos.z > a.maxZ - margin) {
        pos.z = a.maxZ - margin
        clamped = true
      }

      if (clamped) {
        const cx = (a.minX + a.maxX) * 0.5
        const cz = (a.minZ + a.maxZ) * 0.5
        ally.group.rotation.y = Math.atan2(cx - pos.x, cz - pos.z)
      }
    }

    const playerObj = world.player?.group || null
    const gate = this._farmGate || null
    if (!playerObj)
      return
    const pos = playerObj.position
    const inVicinity = pos.x >= a.minX - 3 && pos.x <= a.maxX + 3 && pos.z >= a.minZ - 3 && pos.z <= a.maxZ + 3
    if (!inVicinity) {
      this._lastPlayerFencePos = { x: pos.x, z: pos.z }
      return
    }

    const last = this._lastPlayerFencePos || null
    if (!last) {
      this._lastPlayerFencePos = { x: pos.x, z: pos.z }
      return
    }

    const dx = pos.x - last.x
    const dz = pos.z - last.z
    const movedFar = dx * dx + dz * dz > 16
    if (movedFar) {
      this._lastPlayerFencePos = { x: pos.x, z: pos.z }
      return
    }

    const insideNow = this.isInsideFarm(pos.x, pos.z)
    const insidePrev = this.isInsideFarm(last.x, last.z)
    const nearGate = gate ? ((pos.x - gate.x) ** 2 + (pos.z - gate.z) ** 2) <= (2.2 ** 2) : false
    if (insideNow !== insidePrev && !nearGate) {
      pos.x = last.x
      pos.z = last.z
      pos.y = world._getSurfaceY(pos.x, pos.z) + 0.05
    }

    this._lastPlayerFencePos = { x: pos.x, z: pos.z }
  }

  _produceItems() {
    const world = this.world
    const now = world.experience?.time?.elapsed ?? 0
    if (now - (this._lastProduceAt || 0) < 60000)
      return
    this._lastProduceAt = now
    if (!this._producePos)
      return
    world._spawnHubDrop?.('coin', 1, this._producePos.x, this._producePos.z)
  }

  _buildFarm() {
    const world = this.world
    const cm = world?.chunkManager
    const hub = world?._hubCenter || { x: 32, z: 32 }
    cm?.forceSyncGenerateArea?.(hub.x, hub.z, 2)

    const planned = this._buildPlannedFarm()
    if (planned)
      return

    const x = hub.x + 30.5
    const z = hub.z - 20.5
    this._ensureFarmTerminal(x, z)
    this._area = { minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6 }
    this._producePos = { x, z }
  }

  _buildPlannedFarm() {
    const world = this.world
    const cm = world?.chunkManager
    if (!world || !cm)
      return false

    const sanitize = (v) => {
      const n = Number(v)
      if (!Number.isFinite(n))
        return null
      if (Math.abs(n) > 1000)
        return n / 100
      return n
    }

    const raw = [
      { x: sanitize(60.4), z: sanitize(14.4) },
      { x: sanitize(70.4), z: sanitize(6.3) },
      { x: sanitize(75.1), z: sanitize(11.8) },
      { x: sanitize(6538), z: sanitize(19.6) },
    ].filter(p => Number.isFinite(p.x) && Number.isFinite(p.z))

    if (raw.length < 3)
      return false

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of raw) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minZ))
      return false

    const x0 = Math.floor(minX) + 0.5
    const x1 = Math.floor(maxX) + 0.5
    const z0 = Math.floor(minZ) + 0.5
    const z1 = Math.floor(maxZ) + 0.5

    const rect = {
      minX: Math.min(x0, x1),
      maxX: Math.max(x0, x1),
      minZ: Math.min(z0, z1),
      maxZ: Math.max(z0, z1),
    }

    const ensureGround = (x, z) => {
      cm.forceSyncGenerateArea?.(x, z, 1)
      const rawTop = cm.getTopSolidYWorld(x, z)
      if (!Number.isFinite(Number(rawTop)))
        return null
      const waterOffset = cm?.waterParams?.waterOffset ?? 8
      const heightScale = cm?.renderParams?.heightScale ?? 1
      const waterY = waterOffset * heightScale
      const targetTopY = Math.ceil(waterY + 1)
      const topY = Number(rawTop) < waterY ? targetTopY : Number(rawTop)
      if (Number(rawTop) < waterY) {
        const startY = Math.floor(Number(rawTop)) + 1
        for (let y = startY; y <= targetTopY; y++) {
          const id = (y === targetTopY) ? blocks.grass.id : blocks.dirt.id
          cm.addBlockWorld?.(Math.floor(x), y, Math.floor(z), id)
        }
      }
      return topY
    }

    this.group.clear()

    const termX = Math.floor((rect.minX + rect.maxX) * 0.5) + 0.5
    const termZ = Math.floor(rect.minZ) + 0.5
    ensureGround(termX, termZ)
    this._ensureFarmTerminal(termX, termZ)

    this._area = { minX: rect.minX + 1, maxX: rect.maxX - 1, minZ: rect.minZ + 1, maxZ: rect.maxZ - 1 }
    this._producePos = { x: (rect.minX + rect.maxX) * 0.5, z: (rect.minZ + rect.maxZ) * 0.5 }
    return true
  }

  _ensureFarmTerminal(x, z) {
    const world = this.world
    if (!world)
      return
    if (!world._interactablesGroup)
      world._initInteractables?.()
    const group = world._interactablesGroup || world.scene

    const y = world._getSurfaceY(x, z)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.85, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x9BFF6B, emissive: new THREE.Color(0x58D64C), emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.05 }),
    )
    mesh.position.set(x, y + 0.55, z)
    const hitRadius = world._getHitRadiusFromObject?.(mesh, 0.9) || 0.9
    const outlineSize = Math.max(1.08, hitRadius * 2 * 1.08)
    const outline = new THREE.Mesh(
      new THREE.BoxGeometry(outlineSize, outlineSize, outlineSize),
      new THREE.MeshBasicMaterial({ color: 0xFF_FF_FF, transparent: true, opacity: 0.9, wireframe: true, depthWrite: false }),
    )
    outline.visible = false
    outline.position.copy(mesh.position)
    group.add(mesh, outline)

    const item = {
      id: 'farm_terminal',
      title: '牧场',
      description: '在这里投放收容罐，让灵兽在牧场内游荡。',
      hint: '按 E 管理牧场',
      x,
      z,
      mesh,
      outline,
      hitRadius,
      range: 2.8,
      read: false,
      spinSpeed: 0,
    }

    const list = Array.isArray(world.interactables) ? world.interactables : []
    const existing = list.find(i => i?.id === 'farm_terminal')
    if (existing) {
      existing.x = x
      existing.z = z
      existing.mesh = mesh
      existing.outline = outline
      existing.hitRadius = hitRadius
      existing.range = item.range
      existing.title = item.title
      existing.description = item.description
      existing.hint = item.hint
      existing.spinSpeed = 0
    }
    else {
      world.interactables = [...list, item]
    }
  }

  deployCanisterToFarm(itemId, metaIndex) {
    const world = this.world
    if (!world || world.currentWorld !== 'hub' || !this._area)
      return false
    const id = String(itemId || '')
    if (!id.startsWith('canister_'))
      return false
    const meta = world.inventorySystem?.consumeCanisterMeta?.(id, metaIndex)
    if (!meta) {
      emitter.emit('dungeon:toast', { text: '收容罐没有可用的灵兽信息' })
      return false
    }
    const ok = world.inventorySystem?.removeItem?.('backpack', id, 1)
    if (!ok) {
      emitter.emit('dungeon:toast', { text: '背包中没有该收容罐' })
      return false
    }

    const rkey = meta?.capturedResourceKey ? String(meta.capturedResourceKey) : ''
    if (!rkey.startsWith('animal_')) {
      emitter.emit('dungeon:toast', { text: '牧场当前只支持投放 Hub 动物' })
      return false
    }

    const a = this._area
    const stats = world._npcStats?.[rkey] || world._npcStats?.enemy_default || {}
    const hp = Math.max(1, Math.floor(Number(stats.hp) || 3))

    let spawn = null
    for (let tries = 0; tries < 60; tries++) {
      const x = a.minX + 1 + Math.random() * Math.max(1, (a.maxX - a.minX - 2))
      const z = a.minZ + 1 + Math.random() * Math.max(1, (a.maxZ - a.minZ - 2))
      const y = world._getSurfaceY(x, z)
      if (this._isWaterColumn(x, z))
        continue
      spawn = { x, y, z }
      break
    }
    if (!spawn)
      spawn = { x: (a.minX + a.maxX) * 0.5, y: world._getSurfaceY((a.minX + a.maxX) * 0.5, (a.minZ + a.maxZ) * 0.5), z: (a.minZ + a.maxZ) * 0.5 }

    const animal = new HumanoidEnemy({
      position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
      scale: 0.8,
      type: rkey,
      hp,
    })
    animal._resourceKey = rkey
    animal._typeLabel = meta?.capturedDisplayName || world._getModelFilenameByResourceKey?.(rkey) || rkey
    world._attachNameLabel?.(animal.group, animal._typeLabel, 2.15, 18, 'hub')
    animal._attackDamage = 0
    animal._attackRange = 0
    animal._attackWindupMs = 0
    animal.addTo(world.animalsGroup)
    animal.behavior = {
      state: 'idle',
      timer: 1 + Math.random() * 2,
      role: null,
      carrierEnabled: false,
      carrying: null,
      spawnCooldown: 0,
      targetDropId: null,
      wasThrown: false,
      farmBounds: { ...a, centerX: (a.minX + a.maxX) * 0.5, centerZ: (a.minZ + a.maxZ) * 0.5 },
    }
    world.animals.push(animal)
    emitter.emit('dungeon:toast', { text: `已投放：${animal._typeLabel}` })
    return true
  }

  _findNearestIslandCenter(hx, hz) {
    const cm = this.world?.chunkManager
    if (!cm?.getTopSolidYWorld)
      return null
    const samples = 520
    let best = null
    let bestScore = -Infinity
    for (let i = 0; i < samples; i++) {
      const r = 18 + Math.random() * 95
      const a = Math.random() * Math.PI * 2
      const x = hx + Math.cos(a) * r
      const z = hz + Math.sin(a) * r
      cm.forceSyncGenerateArea(x, z, 1)
      if (this._isWaterColumn(x, z))
        continue
      const score = this._islandScore(x, z)
      if (score > bestScore) {
        bestScore = score
        best = { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 }
      }
    }
    return best
  }

  _islandScore(cx, cz) {
    const r = 6
    let land = 0
    let water = 0
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = cx + dx
        const z = cz + dz
        if (this._isWaterColumn(x, z))
          water++
        else
          land++
      }
    }
    if (land < 18)
      return -999
    if (land > 130)
      return -200
    const mix = water / Math.max(1, land + water)
    const dist2 = (cx - (this.world?._hubCenter?.x || 0)) ** 2 + (cz - (this.world?._hubCenter?.z || 0)) ** 2
    return mix * 1000 - dist2 * 0.03
  }

  _findLandEdgeAlongLine(x, z, dx, dz, steps, towardsHub) {
    const cm = this.world?.chunkManager
    let lastLand = null
    for (let i = 0; i < steps; i++) {
      const px = x + dx * i
      const pz = z + dz * i
      cm.forceSyncGenerateArea(px, pz, 1)
      const water = this._isWaterColumn(px, pz)
      if (!water)
        lastLand = { x: Math.floor(px) + 0.5, z: Math.floor(pz) + 0.5 }
      if (towardsHub && water && lastLand)
        return lastLand
      if (!towardsHub && !water && i > 0)
        return { x: Math.floor(px) + 0.5, z: Math.floor(pz) + 0.5 }
    }
    return lastLand
  }

  _buildCauseway(x0, z0, x1, z1, topY) {
    const cm = this.world?.chunkManager
    if (!cm?.addBlockWorld || !cm?.getTopSolidYWorld)
      return
    const points = this._rasterLine(x0, z0, x1, z1)
    for (const p of points) {
      for (let w = -1; w <= 1; w++) {
        const x = p.x + (p.zAxis ? w : 0)
        const z = p.z + (p.zAxis ? 0 : w)
        cm.forceSyncGenerateArea(x, z, 1)
        const baseTop = cm.getTopSolidYWorld(x, z)
        if (!Number.isFinite(Number(baseTop)))
          continue
        const startY = Math.floor(baseTop) + 1
        for (let y = startY; y <= topY; y++) {
          const id = (y === topY) ? blocks.grass.id : blocks.dirt.id
          cm.addBlockWorld(x, y, z, id)
        }
      }
    }
  }

  _rasterLine(x0, z0, x1, z1) {
    const pts = []
    const ax = Math.abs(Math.round(x1) - Math.round(x0))
    const az = Math.abs(Math.round(z1) - Math.round(z0))
    const steps = Math.max(ax, az, 1)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = Math.round(x0 + (x1 - x0) * t)
      const z = Math.round(z0 + (z1 - z0) * t)
      pts.push({ x, z, zAxis: az > ax })
    }
    return pts
  }

  _placeFencesOnIsland(cx, cz) {
    const world = this.world
    const cm = world?.chunkManager
    const fenceCenter = this.resources?.items?.fence_center?.scene
    const fenceCorner = this.resources?.items?.fence_corner?.scene
    const fenceEnd = this.resources?.items?.fence_end?.scene
    const fenceT = this.resources?.items?.fence_t?.scene
    if (!fenceCenter || !fenceCorner || !fenceEnd || !fenceT)
      return null

    const w = 18
    const d = 14
    const minX = Math.floor(cx) - Math.floor(w / 2) + 0.5
    const minZ = Math.floor(cz) - Math.floor(d / 2) + 0.5
    const maxX = minX + w
    const maxZ = minZ + d

    const centerX = (minX + maxX) * 0.5
    const centerZ = (minZ + maxZ) * 0.5

    const gateX = minX + Math.floor(w / 2)
    const gateZ = maxZ

    const place = (scene, x, z, rotY) => {
      cm.forceSyncGenerateArea(x, z, 1)
      const rawTop = cm.getTopSolidYWorld(x, z)
      if (!Number.isFinite(Number(rawTop)))
        return
      const waterOffset = cm?.waterParams?.waterOffset ?? 8
      const heightScale = cm?.renderParams?.heightScale ?? 1
      const waterY = waterOffset * heightScale
      const targetTopY = Math.ceil(waterY + 1)
      const topY = Number(rawTop) < waterY ? targetTopY : Number(rawTop)
      if (Number(rawTop) < waterY) {
        const startY = Math.floor(Number(rawTop)) + 1
        for (let y = startY; y <= targetTopY; y++) {
          const id = (y === targetTopY) ? blocks.grass.id : blocks.dirt.id
          cm.addBlockWorld?.(Math.floor(x), y, Math.floor(z), id)
        }
      }
      const y = topY + 0.55
      const obj = scene.clone(true)
      obj.position.set(x, y, z)
      obj.rotation.y = rotY
      obj.scale.setScalar(0.5)
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      this.group.add(obj)
    }

    for (let i = 0; i <= w; i++) {
      const x = minX + i
      if (Math.abs(x - gateX) <= 1)
        continue
      place(fenceCenter, x, minZ, Math.PI)
      place(fenceCenter, x, maxZ, 0)
    }
    for (let k = 0; k <= d; k++) {
      const z = minZ + k
      place(fenceCenter, minX, z, -Math.PI / 2)
      place(fenceCenter, maxX, z, Math.PI / 2)
    }

    place(fenceCorner, minX, minZ, Math.PI)
    place(fenceCorner, maxX, minZ, -Math.PI / 2)
    place(fenceCorner, maxX, maxZ, 0)
    place(fenceCorner, minX, maxZ, Math.PI / 2)

    place(fenceEnd, gateX - 1, gateZ, 0)
    place(fenceEnd, gateX + 1, gateZ, 0)
    place(fenceT, gateX, gateZ, 0)

    return {
      area: { minX: minX + 1, maxX: maxX - 1, minZ: minZ + 1, maxZ: maxZ - 1 },
      producePos: { x: centerX, z: centerZ },
    }
  }

  _isWaterColumn(x, z) {
    const cm = this.world?.chunkManager
    if (!cm?.getTopSolidYWorld)
      return false
    const topY = cm.getTopSolidYWorld(x, z)
    if (!Number.isFinite(Number(topY)))
      return false
    const waterOffset = cm?.waterParams?.waterOffset ?? 8
    const heightScale = cm?.renderParams?.heightScale ?? 1
    const waterY = waterOffset * heightScale
    return Number(topY) < waterY
  }
}
