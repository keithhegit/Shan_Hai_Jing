import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'

export default class DropSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.dropSystem = this
  }

  destroy() {
    if (this.world?.dropSystem === this)
      this.world.dropSystem = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world || world.isPaused)
      return
    if (world.currentWorld === 'hub')
      this.updateHubDrops()
  }

  spawnHubDrop(itemId, count, x, z, options = {}) {
    const world = this.world
    if (!world?._hubDropsGroup)
      return null
    const id = `drop_${world._hubDropSeq++}`
    const groundY = world._getSurfaceY(x, z)
    let mesh = null
    if (itemId === 'coin' || String(itemId).startsWith('canister_') || world.resources?.items?.[itemId]?.scene) {
      mesh = this._createDungeonDropMesh(itemId, x, groundY, z)
    }
    if (!mesh) {
      const mat = world._hubDropMaterials?.[itemId] || world._hubDropMaterials?.default
      mesh = new THREE.Mesh(world._hubDropGeo, mat)
      mesh.position.set(x, groundY + 0.25, z)
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    world._attachNameLabel(mesh, world._getModelFilenameByResourceKey(itemId), 0.45, 12)
    world._hubDropsGroup.add(mesh)
    const persist = !!options?.persist
    const onPickedUp = typeof options?.onPickedUp === 'function' ? options.onPickedUp : null
    world._hubDrops.push({
      id,
      itemId,
      count: Math.max(1, Math.floor(Number(count) || 1)),
      mesh,
      baseY: mesh.position.y,
      age: 0,
      persist,
      onPickedUp,
    })
    return id
  }

  removeHubDropById(id) {
    const world = this.world
    if (!id || !world?._hubDrops || world._hubDrops.length === 0)
      return null
    const index = world._hubDrops.findIndex(d => d.id === id)
    if (index < 0)
      return null
    const drop = world._hubDrops[index]
    if (drop?.mesh) {
      drop.mesh.visible = false
      drop.mesh.removeFromParent?.()
    }
    world._hubDrops.splice(index, 1)
    return drop
  }

  updateHubDrops() {
    const world = this.world
    if (!world?._hubDrops || world._hubDrops.length === 0)
      return
    const dt = world.experience.time.delta * 0.001
    const t = (world.experience.time.elapsed ?? 0) * 0.001
    for (let i = world._hubDrops.length - 1; i >= 0; i--) {
      const drop = world._hubDrops[i]
      if (!drop?.mesh) {
        world._hubDrops.splice(i, 1)
        continue
      }
      drop.age += dt
      if (!drop.persist && drop.age > 160) {
        drop.mesh.visible = false
        drop.mesh.removeFromParent?.()
        world._hubDrops.splice(i, 1)
        continue
      }
      drop.mesh.rotation.y += 1.15 * dt
      drop.mesh.position.y = drop.baseY + Math.sin(t * 2.2 + i) * 0.06
    }
  }

  findFrontHubDrop(options = {}) {
    const world = this.world
    if (!world?._hubDrops || world._hubDrops.length === 0)
      return null
    const camera = world.experience.camera?.instance
    if (!camera)
      return null
    const maxDist = Number.isFinite(options.maxDist) ? options.maxDist : 12
    const minDot = Number.isFinite(options.minDot) ? options.minDot : 0.84

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)

    let best = null
    let bestScore = Infinity

    for (const drop of world._hubDrops) {
      const mesh = drop?.mesh
      if (!mesh || mesh.visible === false)
        continue
      const pos = mesh.position
      const dx = pos.x - camPos.x
      const dy = (pos.y + 0.15) - camPos.y
      const dz = pos.z - camPos.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist > maxDist || dist < 0.0001)
        continue
      const nx = dx / dist
      const ny = dy / dist
      const nz = dz / dist
      const dot = nx * camDir.x + ny * camDir.y + nz * camDir.z
      if (dot < minDot)
        continue
      const score = dist / Math.max(0.001, dot)
      if (score < bestScore) {
        bestScore = score
        best = drop
      }
    }

    return best
  }

  pickupItemToInventory({ itemId, count, allowWarehouseFallback = false } = {}) {
    const world = this.world
    if (!world || !itemId)
      return false
    const n = Math.max(1, Math.floor(Number(count) || 1))
    const label = world._getModelFilenameByResourceKey(itemId)

    if (world._canAddToBackpack(itemId, n)) {
      world._addInventoryItem('backpack', itemId, n)
      emitter.emit('dungeon:toast', { text: `获得：${label} x${n}（已放入背包）` })
      world._scheduleInventorySave()
      world._emitInventorySummary()
      world._emitInventoryState()
      return true
    }

    if (!allowWarehouseFallback) {
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${label} x${n}` })
      if (itemId === 'canister_large') {
        emitter.emit('ui:hud_hint', { text: '提示：收容罐（大）占用 4×4 网格，当前背包放不下；可先整理/丢弃道具后再拾取', ttlMs: 4500 })
        emitter.emit('ui:log', { text: '收容罐（大）未拾取：背包网格不足' })
      }
      return false
    }

    world._addInventoryItem('warehouse', itemId, n)
    emitter.emit('dungeon:toast', { text: `背包已满或超重：${label} x${n}（已入库）` })
    world._scheduleInventorySave()
    world._emitInventorySummary()
    world._emitInventoryState()
    return true
  }

  pickupHubDrop(drop) {
    const world = this.world
    if (!drop?.id || !world)
      return false
    const removed = this.removeHubDropById(drop.id)
    if (!removed)
      return false
    const itemId = removed.itemId || 'stone'
    const count = Math.max(1, Math.floor(Number(removed.count) || 1))
    const ok = this.pickupItemToInventory({ itemId, count, allowWarehouseFallback: true })
    if (ok)
      removed.onPickedUp?.(removed)
    return ok
  }

  spawnDungeonItemDrop({ itemId, amount = 1, x = null, z = null } = {}) {
    const world = this.world
    if (!world || world.currentWorld !== 'dungeon')
      return
    const n = Math.max(1, Math.floor(Number(amount) || 1))
    if (!itemId)
      return
    if (!world._dungeonInteractables)
      world._dungeonInteractables = []
    if (!world._dungeonInteractablesGroup) {
      world._dungeonInteractablesGroup = new THREE.Group()
      world._dungeonGroup?.add?.(world._dungeonInteractablesGroup)
    }

    const baseX = Number.isFinite(Number(x)) ? Number(x) : (world.player?.getPosition?.().x ?? 0)
    const baseZ = Number.isFinite(Number(z)) ? Number(z) : (world.player?.getPosition?.().z ?? 0)
    const y = world._getSurfaceY(baseX, baseZ)

    const isStack = itemId === 'coin' || String(itemId).startsWith('key_')
    const drops = isStack ? 1 : n
    const perAmount = isStack ? n : 1

    for (let i = 0; i < drops; i++) {
      const portalId = world._activeDungeonPortalId || 'dungeon'
      const index = world._dungeonInteractables.length
      const id = `drop-${portalId}-${index}`

      const jitterX = baseX + (Math.random() - 0.5) * 0.6
      const jitterZ = baseZ + (Math.random() - 0.5) * 0.6

      const dropMesh = this._createDungeonDropMesh(itemId, jitterX, y, jitterZ)
      if (!dropMesh)
        continue
      world._dungeonInteractablesGroup.add(dropMesh)

      const hitRadius = world._getHitRadiusFromObject(dropMesh, itemId === 'coin' ? 0.55 : 0.6)
      world._dungeonInteractables.push({
        id,
        title: world._getModelFilenameByResourceKey(itemId),
        description: '战利品。可拾取后放入背包或仓库。',
        hint: '按 E 拾取',
        pickupItemId: itemId,
        pickupAmount: perAmount,
        x: jitterX,
        y,
        z: jitterZ,
        mesh: dropMesh,
        hitRadius,
        range: 2.8,
        read: false,
        spinSpeed: itemId === 'coin' ? 0.04 : 0.03,
      })
    }
  }

  _createDungeonDropMesh(itemId, x, groundY, z) {
    const world = this.world
    if (!world)
      return null

    let mesh = null

    if (itemId === 'coin') {
      const resource = world.resources.items.coin
      if (resource?.scene) {
        mesh = resource.scene.clone(true)
        mesh.scale.setScalar(0.65)
      }
      else {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16),
          new THREE.MeshStandardMaterial({ color: 0xFFCC33, roughness: 0.35, metalness: 0.25, emissive: 0x332200, emissiveIntensity: 0.2 }),
        )
      }
      mesh.position.set(x, groundY + 0.6, z)
    }
    else if (String(itemId).startsWith('canister_')) {
      const resource = world.resources.items.canister
      if (resource?.scene) {
        mesh = resource.scene.clone(true)
        const scale = itemId === 'canister_large' ? 0.95 : (itemId === 'canister_medium' ? 0.75 : 0.6)
        mesh.scale.setScalar(scale)
      }
      if (mesh)
        mesh.position.set(x, groundY + 0.7, z)
    }
    else {
      const resource = world.resources.items[itemId]
      if (resource?.scene)
        mesh = resource.scene.clone(true)

      if (!mesh) {
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5)
        const material = new THREE.MeshStandardMaterial({ color: 0x88CCFF, roughness: 0.5, metalness: 0.1, emissive: 0x113355, emissiveIntensity: 0.25 })
        mesh = new THREE.Mesh(geometry, material)
      }
      mesh.position.set(x, groundY + 0.7, z)
    }

    mesh.traverse?.((child) => {
      if (child?.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return mesh
  }
}
