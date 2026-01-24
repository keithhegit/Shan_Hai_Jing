import emitter from '../../utils/event-bus.js'

export default class InteractableSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.interactableSystem = this

    this._onInteract = () => {
      this.handleInteract()
    }

    this._onInteractableClose = (payload) => {
      this.handleInteractableClose(payload)
    }

    this._onInteractableAction = (payload) => {
      this.handleInteractableAction(payload)
    }

    emitter.on('input:interact', this._onInteract)
    emitter.on('interactable:close', this._onInteractableClose)
    emitter.on('interactable:action', this._onInteractableAction)
  }

  destroy() {
    if (this._onInteract)
      emitter.off('input:interact', this._onInteract)
    if (this._onInteractableClose)
      emitter.off('interactable:close', this._onInteractableClose)
    if (this._onInteractableAction)
      emitter.off('interactable:action', this._onInteractableAction)

    this._onInteract = null
    this._onInteractableClose = null
    this._onInteractableAction = null

    if (this.world?.interactableSystem === this)
      this.world.interactableSystem = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world || !world.player)
      return

    if (world.currentWorld === 'hub') {
      const hubDrops = Array.isArray(world._hubDrops) ? world._hubDrops : []
      this._updateActiveFromList([...(world.interactables || []), ...hubDrops])
    }
    else if (world.currentWorld === 'dungeon') {
      this._updateActiveFromList(world._dungeonInteractables)
    }
  }

  _updateActiveFromList(list) {
    const world = this.world
    if (!world?.player || !Array.isArray(list) || list.length === 0)
      return

    const pos = world.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const item of list) {
      const r = Number(item?.range) || 0
      if (r <= 0)
        continue
      const dx = pos.x - item.x
      const dz = pos.z - item.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = item
      }
    }

    const shouldActivate = best && bestD2 <= best.range * best.range

    if (shouldActivate) {
      if (world._activeInteractableId !== best.id) {
        world._activeInteractableId = best.id
        world._activeInteractable = best
        const hint = best.hint || (best.read ? '按 E 回顾' : '按 E 查看')
        emitter.emit('interactable:prompt', { title: best.title, hint })
      }
    }
    else if (world._activeInteractableId !== null && world._activeInteractable) {
      world._activeInteractableId = null
      world._activeInteractable = null
      emitter.emit('interactable:prompt_clear')
    }

    for (const item of list) {
      if (item?.outline)
        item.outline.visible = item.id === world._activeInteractableId
      if (item?.mesh) {
        const speed = Number.isFinite(item.spinSpeed) ? item.spinSpeed : 0.01
        if (speed)
          item.mesh.rotation.y += speed
      }
      if (item?.outline && item?.mesh)
        item.outline.rotation.y = item.mesh.rotation.y
    }
  }

  handleInteract() {
    const world = this.world
    if (!world || world.isPaused)
      return

    if (world._activeInteractable) {
      if (world._activeInteractable.isHubDrop) {
        const ok = world.dropSystem?.pickupHubDrop?.(world._activeInteractable)
        if (!ok)
          return
        world._activeInteractable.range = 0
        world._activeInteractableId = null
        world._activeInteractable = null
        emitter.emit('interactable:prompt_clear')
        emitter.emit('portal:prompt_clear')
        return
      }
      if (world._activeInteractable.pickupItemId) {
        if (world._activeInteractable.read) {
          world._activeInteractableId = null
          world._activeInteractable = null
          emitter.emit('interactable:prompt_clear')
          emitter.emit('portal:prompt_clear')
          return
        }

        const itemId = world._activeInteractable.pickupItemId
        const count = Math.max(1, Math.floor(Number(world._activeInteractable.pickupAmount) || 1))
        const ok = world.dropSystem?.pickupItemToInventory?.({
          itemId,
          count,
          allowWarehouseFallback: world.currentWorld !== 'dungeon',
          canisterMeta: world._activeInteractable.canisterMeta || null,
        })
        if (!ok)
          return

        world._activeInteractable.read = true
        if (world._activeInteractable.mesh) {
          world._activeInteractable.mesh.visible = false
          world._activeInteractable.mesh.parent?.remove?.(world._activeInteractable.mesh)
        }
        if (world._activeInteractable.outline) {
          world._activeInteractable.outline.visible = false
          world._activeInteractable.outline.parent?.remove?.(world._activeInteractable.outline)
        }
        if (world.currentWorld === 'dungeon')
          world._emitDungeonProgress()
        world._activeInteractable.range = 0
        world._activeInteractableId = null
        world._activeInteractable = null
        emitter.emit('interactable:prompt_clear')
        emitter.emit('portal:prompt_clear')
        return
      }

      if (world._activeInteractable.openInventoryPanel) {
        world._toggleInventoryPanel(world._activeInteractable.openInventoryPanel)
        emitter.emit('interactable:prompt_clear')
        emitter.emit('portal:prompt_clear')
        return
      }

      if (world._activeInteractable.lockedChestId) {
        world._openLockedChest(world._activeInteractable.lockedChestId)
        emitter.emit('interactable:prompt_clear')
        emitter.emit('portal:prompt_clear')
        return
      }

      world.isPaused = true
      world.experience.pointerLock?.exitLock?.()
      world._openedInteractableId = world._activeInteractable.id

      const payload = {
        id: world._activeInteractable.id,
        title: world._activeInteractable.title,
        description: world._activeInteractable.description,
      }
      if (world._activeInteractable.title === '任务宝箱' && !world._activeInteractable.read) {
        payload.actions = [
          { id: 'claim_reward', label: '领取奖励' },
        ]
      }

      world._emitDungeonState()
      emitter.emit('interactable:open', payload)
      emitter.emit('interactable:prompt_clear')
      emitter.emit('portal:prompt_clear')
      return
    }

    if (world._activeDungeonExit) {
      world._exitDungeon()
      return
    }
    if (world._activePortal)
      world._openDungeonSelect()
  }

  handleInteractableClose(payload) {
    const world = this.world
    if (!world?.isPaused)
      return

    const closedId = payload?.id || world._openedInteractableId
    if (closedId) {
      const pool = []
      if (world.interactables)
        pool.push(...world.interactables)
      if (world._dungeonInteractables)
        pool.push(...world._dungeonInteractables)
      const item = pool.find(i => i.id === closedId)
      if (item && !item.read) {
        item.read = true
        if (item.mesh?.material) {
          item.mesh.material.emissiveIntensity = 0.22
          item.mesh.material.roughness = 0.55
          item.mesh.material.metalness = 0.05
        }
        if (item.outline?.material)
          item.outline.material.opacity = 0.45
        if (world.currentWorld === 'dungeon')
          world._emitDungeonProgress()
      }
    }

    world._openedInteractableId = null
    world.isPaused = false
    world._emitDungeonState()
    world.experience.pointerLock?.requestLock?.()
  }

  handleInteractableAction(payload) {
    const world = this.world
    if (!payload?.id || !payload?.action)
      return
    if (payload.action !== 'claim_reward')
      return

    const item = (world?._dungeonInteractables || []).find(i => i.id === payload.id)
      || (world?.interactables || []).find(i => i.id === payload.id)
    if (!item || item.title !== '任务宝箱' || item.read)
      return

    world._addInventoryItem('backpack', 'fence', 1)
    const pool = world._toolLootPool || []
    if (pool.length > 0) {
      const toolId = pool[Math.floor(Math.random() * pool.length)]
      if (world._canAddToBackpack(toolId, 1)) {
        world._addInventoryItem('backpack', toolId, 1)
        emitter.emit('dungeon:toast', { text: `获得：${world._getModelFilenameByResourceKey(toolId)} x1（已放入背包）` })
      }
      else {
        world._addInventoryItem('warehouse', toolId, 1)
        emitter.emit('dungeon:toast', { text: `背包已满或超重：${world._getModelFilenameByResourceKey(toolId)} x1（已入库）` })
      }
    }
    item.read = true
    if (item.mesh) {
      item.mesh.visible = false
      item.mesh.parent?.remove?.(item.mesh)
    }
    if (item.outline) {
      item.outline.visible = false
      item.outline.parent?.remove?.(item.outline)
    }
    if (world.currentWorld === 'dungeon')
      world._emitDungeonProgress()
    emitter.emit('dungeon:toast', { text: '获得：Fence x1（已放入背包）' })
    world._scheduleInventorySave()
    world._emitInventorySummary()
    world._emitInventoryState()
  }
}
