import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'

export default class LockedChestSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    this._saveTimer = null
    if (this.world) {
      this.world.lockedChestSystem = this
      this.world._lockedChests = this.loadLockedChests()
    }

    this._onChestClose = (payload) => {
      this.handleChestClose(payload)
    }
    this._onChestUseKey = (payload) => {
      this.useKeyForLockedChest(payload)
    }
    this._onChestTakeItem = (payload) => {
      this.takeLockedChestLoot(payload)
    }

    emitter.on('chest:close', this._onChestClose)
    emitter.on('chest:use_key', this._onChestUseKey)
    emitter.on('chest:take', this._onChestTakeItem)
  }

  destroy() {
    if (this._onChestClose)
      emitter.off('chest:close', this._onChestClose)
    if (this._onChestUseKey)
      emitter.off('chest:use_key', this._onChestUseKey)
    if (this._onChestTakeItem)
      emitter.off('chest:take', this._onChestTakeItem)
    this._onChestClose = null
    this._onChestUseKey = null
    this._onChestTakeItem = null

    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }

    if (this.world?.lockedChestSystem === this)
      this.world.lockedChestSystem = null
    this.world = null
    this.context = null
  }

  update(dt, t) {
    const world = this.world
    if (!world)
      return
    const list = []
    if (Array.isArray(world.interactables))
      list.push(...world.interactables)
    if (Array.isArray(world._dungeonInteractables))
      list.push(...world._dungeonInteractables)
    if (list.length === 0)
      return
    for (const item of list) {
      if (!item?.lockedChestId)
        continue
      this.updateLockedChestLootVisual(item, dt, t)
    }
  }

  loadLockedChests() {
    try {
      if (typeof window === 'undefined')
        return {}
      const raw = window.localStorage?.getItem?.('mmmc:locked_chests_v1')
      if (!raw)
        return {}
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object')
        return {}
      return parsed
    }
    catch {
      return {}
    }
  }

  saveLockedChestsNow() {
    const world = this.world
    try {
      if (typeof window === 'undefined')
        return
      window.localStorage?.setItem?.('mmmc:locked_chests_v1', JSON.stringify(world?._lockedChests || {}))
    }
    catch {
    }
  }

  scheduleLockedChestsSave() {
    if (this._saveTimer)
      clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this.saveLockedChestsNow()
    }, 250)
  }

  getLockedChestPool() {
    const world = this.world
    const pool = []
    if (Array.isArray(world?.interactables))
      pool.push(...world.interactables)
    if (Array.isArray(world?._dungeonInteractables))
      pool.push(...world._dungeonInteractables)
    return pool
  }

  findLockedChest(chestId) {
    if (!chestId)
      return null
    return this.getLockedChestPool().find(i => i?.id === chestId && i.lockedChestId) || null
  }

  getLockedChestPayload(chestId) {
    const world = this.world
    const chest = this.findLockedChest(chestId)
    if (!chest)
      return null
    const state = world?._lockedChests?.[chestId] || {}
    const loot = state?.loot?.itemId
      ? [{ id: state.loot.itemId, count: Math.max(1, Math.floor(Number(state.loot.count) || 1)) }]
      : []
    return {
      id: chestId,
      title: chest.title || '宝箱',
      requiredKeyId: chest.requiredKeyId || null,
      unlocked: !!state.unlocked,
      looted: !!state.looted,
      loot,
    }
  }

  createToolMesh(itemId) {
    const world = this.world
    let mesh = null
    const resource = world?.resources?.items?.[itemId]
    if (resource?.scene) {
      mesh = resource.scene.clone()
    }
    else {
      const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6)
      const material = new THREE.MeshStandardMaterial({ color: 0xFFCC66, roughness: 0.6, metalness: 0.15, emissive: 0x332200, emissiveIntensity: 0.25 })
      mesh = new THREE.Mesh(geometry, material)
    }

    mesh.traverse?.((child) => {
      if (child?.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    try {
      const box = new THREE.Box3().setFromObject(mesh)
      const size = new THREE.Vector3()
      box.getSize(size)
      const max = Math.max(size.x, size.y, size.z)
      if (Number.isFinite(max) && max > 0.0001) {
        const target = 0.9
        const s = target / max
        mesh.scale.multiplyScalar(s)
      }
    }
    catch {
    }

    return mesh
  }

  removeLockedChestLootVisual(chestId) {
    const chest = this.findLockedChest(chestId)
    const visual = chest?._lootVisual
    if (!visual?.mesh)
      return
    visual.mesh.visible = false
    visual.mesh.removeFromParent?.()
    chest._lootVisual = null
  }

  ensureLockedChestLootVisual(chestId, withPop = false) {
    const world = this.world
    const chest = this.findLockedChest(chestId)
    if (!chest)
      return
    const state = world?._lockedChests?.[chestId] || {}
    const itemId = state?.loot?.itemId || null
    if (!state.unlocked || state.looted || !itemId) {
      this.removeLockedChestLootVisual(chestId)
      return
    }

    if (chest._lootVisual?.mesh) {
      if (chest._lootVisual.itemId !== itemId) {
        this.removeLockedChestLootVisual(chestId)
      }
      else {
        return
      }
    }

    const mesh = this.createToolMesh(itemId)
    const base = chest.mesh?.position
    const x = base?.x ?? chest.x
    const z = base?.z ?? chest.z
    const startY = (base?.y ?? (world?._getSurfaceY(x, z) + 0.5)) + 0.6
    mesh.position.set(x, startY, z)
    mesh.rotation.y = Math.random() * Math.PI * 2
    const group = chest.parentGroup || world?._interactablesGroup || world?._dungeonInteractablesGroup || null
    group?.add?.(mesh)

    const now = world?.experience?.time?.elapsed ?? 0
    chest._lootVisual = {
      mesh,
      itemId,
      startMs: now,
      durationMs: withPop ? 820 : 0,
      startY,
      peakY: startY + 1.05,
      settleY: startY + 0.55,
      phase: Math.random() * Math.PI * 2,
      done: !withPop,
    }
    if (!withPop)
      mesh.position.y = chest._lootVisual.settleY
  }

  updateLockedChestLootVisual(chest, dt, t) {
    const world = this.world
    const visual = chest?._lootVisual
    if (!visual?.mesh)
      return
    const state = world?._lockedChests?.[chest.id] || {}
    const itemId = state?.loot?.itemId || null
    if (!state.unlocked || state.looted || !itemId || itemId !== visual.itemId) {
      this.removeLockedChestLootVisual(chest.id)
      return
    }

    const mesh = visual.mesh
    if (!visual.done && visual.durationMs > 0) {
      const now = world?.experience?.time?.elapsed ?? 0
      const p = (now - visual.startMs) / visual.durationMs
      const clamped = Math.min(1, Math.max(0, p))
      if (clamped >= 1) {
        visual.done = true
        mesh.position.y = visual.settleY
      }
      else if (clamped < 0.55) {
        const tt = clamped / 0.55
        const e = 1 - (1 - tt) ** 3
        mesh.position.y = visual.startY + (visual.peakY - visual.startY) * e
      }
      else {
        const tt = (clamped - 0.55) / 0.45
        const e = tt * tt * tt
        mesh.position.y = visual.peakY + (visual.settleY - visual.peakY) * e
      }
      mesh.rotation.y += 2.2 * dt
      mesh.rotation.x = Math.sin(clamped * Math.PI * 2) * 0.25 * (1 - clamped)
      return
    }

    mesh.rotation.y += 1.15 * dt
    mesh.position.y = visual.settleY + Math.sin(t * 2.2 + visual.phase) * 0.06
  }

  openLockedChest(chestId) {
    const world = this.world
    if (!world || !chestId)
      return
    if (world._activeInventoryPanel)
      world._closeInventoryPanel()

    const payload = this.getLockedChestPayload(chestId)
    if (!payload)
      return

    world._activeChestId = chestId
    world.isPaused = true
    world.experience.pointerLock?.exitLock?.()
    world._emitDungeonState()
    world._emitInventoryState()
    emitter.emit('chest:open', payload)
  }

  handleChestClose(payload) {
    const world = this.world
    if (!world)
      return
    const id = payload?.id || world._activeChestId
    if (id && world._activeChestId === id)
      world._activeChestId = null
    if (world.isPaused) {
      world.isPaused = false
      world._emitDungeonState()
      world.experience.pointerLock?.requestLock?.()
    }
  }

  useKeyForLockedChest(payload) {
    const world = this.world
    const chestId = payload?.id
    const keyId = payload?.keyId
    if (!world || !chestId || !keyId)
      return

    const chest = this.findLockedChest(chestId)
    if (!chest || chest.read)
      return

    const state = world._lockedChests?.[chestId] || {}
    if (state.unlocked) {
      emitter.emit('chest:update', this.getLockedChestPayload(chestId))
      return
    }

    const requiredKeyId = chest.requiredKeyId
    if (!requiredKeyId || keyId !== requiredKeyId) {
      emitter.emit('dungeon:toast', { text: '钥匙不匹配' })
      return
    }

    const backpack = world._getBagItems('backpack')
    if (!backpack?.[keyId] || backpack[keyId] <= 0) {
      emitter.emit('dungeon:toast', { text: '背包中没有对应钥匙' })
      return
    }

    world._removeInventoryItem('backpack', keyId, 1)

    let lootItemId = state?.loot?.itemId || null
    let lootCount = state?.loot?.count || 0
    if (!lootItemId) {
      const pool = world._toolLootPool || []
      lootItemId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'fence'
      lootCount = 1
    }

    world._lockedChests[chestId] = {
      unlocked: true,
      looted: false,
      loot: { itemId: lootItemId, count: lootCount },
    }

    chest.unlocked = true
    chest.hint = '按 E 打开宝箱'
    chest.description = requiredKeyId ? `需要${world._getModelFilenameByResourceKey(requiredKeyId)}解锁` : chest.description
    this.ensureLockedChestLootVisual(chestId, true)

    world._scheduleInventorySave()
    this.scheduleLockedChestsSave()
    world._emitInventorySummary()
    world._emitInventoryState()
    emitter.emit('dungeon:toast', { text: `已解锁：${chest.title}` })
    emitter.emit('chest:update', this.getLockedChestPayload(chestId))

    emitter.emit('chest:close_ui', { id: chestId })

    const autoLootItemId = lootItemId
    const autoLootCount = lootCount
    setTimeout(() => {
      const st = world._lockedChests?.[chestId] || {}
      if (!st.unlocked || st.looted)
        return
      if (!st.loot?.itemId || st.loot.itemId !== autoLootItemId)
        return
      this.takeLockedChestLoot({ id: chestId, itemId: autoLootItemId, amount: autoLootCount })
    }, 900)
  }

  takeLockedChestLoot(payload) {
    const world = this.world
    const chestId = payload?.id
    const itemId = payload?.itemId
    const amount = Math.max(1, Math.floor(Number(payload?.amount) || 1))
    if (!world || !chestId || !itemId)
      return

    const chest = this.findLockedChest(chestId)
    if (!chest || chest.read)
      return

    const state = world._lockedChests?.[chestId] || {}
    if (!state.unlocked || !state.loot?.itemId)
      return
    if (state.loot.itemId !== itemId)
      return

    const takeCount = Math.min(amount, Math.max(1, Math.floor(Number(state.loot.count) || 1)))

    if (world._canAddToBackpack(itemId, takeCount)) {
      world._addInventoryItem('backpack', itemId, takeCount)
      emitter.emit('dungeon:toast', { text: `获得：${world._getModelFilenameByResourceKey(itemId)} x${takeCount}（已放入背包）` })
    }
    else {
      world._addInventoryItem('warehouse', itemId, takeCount)
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${world._getModelFilenameByResourceKey(itemId)} x${takeCount}（已入库）` })
    }

    const remaining = Math.max(0, Math.floor(Number(state.loot.count) || 1) - takeCount)
    if (remaining <= 0) {
      world._lockedChests[chestId] = { unlocked: true, looted: true, loot: null }
      this.removeLockedChestLootVisual(chestId)
      chest.read = true
      chest.looted = true
      chest.range = 0
      chest.hint = '已开启'
      if (chest.mesh) {
        chest.mesh.visible = false
        chest.mesh.parent?.remove?.(chest.mesh)
      }
      if (chest.outline) {
        chest.outline.visible = false
        chest.outline.parent?.remove?.(chest.outline)
      }
      if (world._activeInteractableId === chestId) {
        world._activeInteractableId = null
        world._activeInteractable = null
        emitter.emit('interactable:prompt_clear')
      }
    }
    else {
      world._lockedChests[chestId] = { unlocked: true, looted: false, loot: { itemId, count: remaining } }
    }

    world._scheduleInventorySave()
    this.scheduleLockedChestsSave()
    world._emitInventorySummary()
    world._emitInventoryState()
    emitter.emit('chest:update', this.getLockedChestPayload(chestId))
  }
}
