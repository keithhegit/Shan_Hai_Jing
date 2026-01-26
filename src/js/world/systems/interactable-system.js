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
    const pets = this._getPetInteractables()

    if (world.currentWorld === 'hub') {
      const hubDrops = Array.isArray(world._hubDrops) ? world._hubDrops : []
      this._updateActiveFromList([...(world.interactables || []), ...pets, ...hubDrops])
    }
    else if (world.currentWorld === 'dungeon') {
      this._updateActiveFromList([...(world._dungeonInteractables || []), ...(world._mineOreInteractables || []), ...pets])
    }
  }

  _getPetInteractables() {
    const world = this.world
    const allies = Array.isArray(world?._summonedAllies) ? world._summonedAllies : []
    const list = []
    for (let i = 0; i < allies.length; i++) {
      const ally = allies[i]
      if (!ally?.group || ally.isDead)
        continue
      list.push({
        id: `pet_recall:${ally._summonedId || i}`,
        title: ally._typeLabel || '灵宠',
        hint: '按 E 收容',
        x: ally.group.position.x,
        z: ally.group.position.z,
        range: 2.35,
        petAlly: ally,
      })
    }
    return list
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
      else {
        world._activeInteractable = best
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
      if (world._activeInteractable.petAlly) {
        const ok = world._recallSummonedAlly?.(world._activeInteractable.petAlly)
        if (!ok)
          return
        world._activeInteractable.range = 0
        world._activeInteractableId = null
        world._activeInteractable = null
        emitter.emit('interactable:prompt_clear')
        emitter.emit('portal:prompt_clear')
        return
      }
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
      if (world._activeInteractable.mineOre) {
        const ok = world?._startMiningOre?.(world._activeInteractable.mineOre)
        if (!ok)
          return
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
      if (world._activeInteractable.id === 'farm_terminal') {
        payload.actions = this._buildFarmActions()
      }
      if (world._activeInteractable.id === 'shop_merchant') {
        const items = world.inventorySystem?.getBagItems?.('backpack') || {}
        const coin = Number(items.coin) || 0
        const crystal = Number(items.crystal_small) || 0
        const mineUnlocked = !!world._portalUnlocks?.mine
        const hellfireUnlocked = !!world._portalUnlocks?.hellfire
        payload.title = '商店'
        payload.description = `旅行商人\n金币：${coin}  水晶碎片：${crystal}`
        const actions = []
        if (!mineUnlocked)
          actions.push({ id: 'shop_unlock:mine', label: '解锁：矿山（5 金币）' })
        else
          actions.push({ id: 'shop_noop', label: '矿山：已解锁' })
        if (!hellfireUnlocked)
          actions.push({ id: 'shop_unlock:hellfire', label: '解锁：地狱火（10 金币）' })
        else
          actions.push({ id: 'shop_noop', label: '地狱火：已解锁' })
        actions.push({ id: 'shop_buy:pickaxe', label: '购买：鹤嘴镐（5 金币）' })
        actions.push({ id: 'shop_buy:pet_potion', label: '兑换：灵兽补充剂（3 水晶碎片）' })
        actions.push({ id: 'shop_sell', label: '卖出（打开背包）' })
        payload.actions = actions
      }

      world._emitDungeonState()
      emitter.emit('interactable:open', payload)
      emitter.emit('interactable:prompt_clear')
      emitter.emit('portal:prompt_clear')
      return
    }

    if (world._activeDungeonExit) {
      world._openDungeonExtraction?.()
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
  }

  handleInteractableAction(payload) {
    const world = this.world
    if (!payload?.id || !payload?.action)
      return
    if (payload.action === 'shop_sell') {
      emitter.emit('interactable:close', { id: 'shop_merchant' })
      world._toggleInventoryPanel?.('backpack')
      emitter.emit('shop:sell_mode', { active: true })
      emitter.emit('dungeon:toast', { text: '点击背包物品以卖出' })
      return
    }
    if (String(payload.action).startsWith('shop_unlock:')) {
      const kind = String(payload.action).split(':')[1] || ''
      const cost = kind === 'hellfire' ? 10 : 5
      const ok = world.inventorySystem?.removeItem?.('backpack', 'coin', cost)
      if (!ok) {
        emitter.emit('dungeon:toast', { text: '金币不足' })
        return
      }
      if (!world._portalUnlocks)
        world._portalUnlocks = { mine: false, hellfire: false }
      if (kind === 'mine')
        world._portalUnlocks.mine = true
      if (kind === 'hellfire')
        world._portalUnlocks.hellfire = true
      world._savePortalUnlocks?.()
      emitter.emit('dungeon:toast', { text: '解锁成功' })
      const items = world.inventorySystem?.getBagItems?.('backpack') || {}
      const coin = Number(items.coin) || 0
      const crystal = Number(items.crystal_small) || 0
      const mineUnlocked = !!world._portalUnlocks?.mine
      const hellfireUnlocked = !!world._portalUnlocks?.hellfire
      const actions = []
      if (!mineUnlocked)
        actions.push({ id: 'shop_unlock:mine', label: '解锁：矿山（5 金币）' })
      else
        actions.push({ id: 'shop_noop', label: '矿山：已解锁' })
      if (!hellfireUnlocked)
        actions.push({ id: 'shop_unlock:hellfire', label: '解锁：地狱火（10 金币）' })
      else
        actions.push({ id: 'shop_noop', label: '地狱火：已解锁' })
      actions.push({ id: 'shop_buy:pickaxe', label: '购买：鹤嘴镐（5 金币）' })
      actions.push({ id: 'shop_buy:pet_potion', label: '兑换：灵兽补充剂（3 水晶碎片）' })
      actions.push({ id: 'shop_sell', label: '卖出（打开背包）' })
      emitter.emit('interactable:open', {
        id: 'shop_merchant',
        title: '商店',
        description: `旅行商人\n金币：${coin}  水晶碎片：${crystal}`,
        actions,
      })
      return
    }
    if (payload.action === 'shop_buy:pickaxe') {
      const ok = world.inventorySystem?.removeItem?.('backpack', 'coin', 5)
      if (!ok) {
        emitter.emit('dungeon:toast', { text: '金币不足' })
        return
      }
      const canAdd = world.inventorySystem?._canAddToBackpack?.('Pickaxe_Wood', 1) ?? true
      if (canAdd) {
        world.inventorySystem?.addItem?.('backpack', 'Pickaxe_Wood', 1)
      }
      else {
        const p = world.player?.getPosition?.()
        world._spawnHubDrop?.('Pickaxe_Wood', 1, p?.x ?? 0, p?.z ?? 0)
        emitter.emit('dungeon:toast', { text: '背包已满：已掉落在地上' })
        return
      }
      emitter.emit('dungeon:toast', { text: '已购买：鹤嘴镐' })
      return
    }
    if (payload.action === 'shop_buy:pet_potion') {
      const ok = world.inventorySystem?.removeItem?.('backpack', 'crystal_small', 3)
      if (!ok) {
        emitter.emit('dungeon:toast', { text: '水晶碎片不足' })
        return
      }
      const canAdd = world.inventorySystem?._canAddToBackpack?.('pet_potion', 1) ?? true
      if (canAdd) {
        world.inventorySystem?.addItem?.('backpack', 'pet_potion', 1)
      }
      else {
        const p = world.player?.getPosition?.()
        world._spawnHubDrop?.('pet_potion', 1, p?.x ?? 0, p?.z ?? 0)
        emitter.emit('dungeon:toast', { text: '背包已满：已掉落在地上' })
        return
      }
      emitter.emit('dungeon:toast', { text: '已兑换：灵兽补充剂' })
      return
    }
    if (String(payload.action).startsWith('farm_claim:')) {
      const itemId = String(payload.action).split(':')[1] || ''
      const max = itemId === 'Fence_Center' ? 16 : 4
      const items = world.inventorySystem?.getBagItems?.('backpack') || {}
      const current = Math.max(0, Math.floor(Number(items?.[itemId]) || 0))
      const need = Math.max(0, max - current)
      if (need <= 0) {
        emitter.emit('dungeon:toast', { text: '已达上限' })
        return
      }
      let added = 0
      for (let i = 0; i < need; i++) {
        const canAdd = world.inventorySystem?._canAddToBackpack?.(itemId, 1) ?? true
        if (!canAdd)
          break
        world.inventorySystem?.addItem?.('backpack', itemId, 1)
        added++
      }
      if (added > 0)
        emitter.emit('dungeon:toast', { text: `已领取：${itemId} x${added}` })
      else
        emitter.emit('dungeon:toast', { text: '背包已满：无法领取' })
      emitter.emit('interactable:open', {
        id: 'farm_terminal',
        title: '牧场',
        description: '在这里投放收容罐，让灵兽在牧场内游荡。',
        actions: this._buildFarmActions(),
      })
      return
    }
    if (String(payload.action).startsWith('farm_deploy:')) {
      const parts = String(payload.action).split(':')
      const itemId = parts[1] || null
      const metaIndex = Number.isFinite(Number(parts[2])) ? Math.max(0, Math.floor(Number(parts[2]))) : null
      const ok = world?.farmSystem?.deployCanisterToFarm?.(itemId, metaIndex)
      if (!ok)
        return
      emitter.emit('interactable:open', {
        id: 'farm_terminal',
        title: '牧场',
        description: '在这里投放收容罐，让灵兽在牧场内游荡。',
        actions: this._buildFarmActions(),
      })
      return
    }
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
    emitter.emit('interactable:close', { id: payload.id })
  }

  _buildFarmActions() {
    const world = this.world
    if (!world)
      return []
    const items = world.inventorySystem?.getBagItems?.('backpack') || {}
    const centerCount = Math.max(0, Math.floor(Number(items?.Fence_Center) || 0))
    const cornerCount = Math.max(0, Math.floor(Number(items?.Fence_Corner) || 0))
    const actions = []
    if (centerCount < 16)
      actions.push({ id: 'farm_claim:Fence_Center', label: `领取：Fence_Center（补齐到16，当前${centerCount}）` })
    else
      actions.push({ id: 'farm_noop', label: 'Fence_Center：已达上限（16）' })
    if (cornerCount < 4)
      actions.push({ id: 'farm_claim:Fence_Corner', label: `领取：Fence_Corner（补齐到4，当前${cornerCount}）` })
    else
      actions.push({ id: 'farm_noop', label: 'Fence_Corner：已达上限（4）' })

    const inv = world.inventorySystem?.inventory || null
    const meta = inv?.canisterMeta && typeof inv.canisterMeta === 'object' ? inv.canisterMeta : {}
    let deployCount = 0
    for (const [itemId, list] of Object.entries(meta)) {
      if (!String(itemId).startsWith('canister_') || !Array.isArray(list) || list.length === 0)
        continue
      for (let i = 0; i < list.length; i++) {
        const entry = list[i] || null
        const name = entry?.capturedDisplayName || entry?.capturedResourceKey || itemId
        actions.push({ id: `farm_deploy:${itemId}:${i}`, label: `投放：${name}` })
        deployCount++
        if (deployCount >= 12)
          break
      }
      if (deployCount >= 12)
        break
    }
    if (deployCount <= 0)
      actions.push({ id: 'farm_noop', label: '背包没有可投放的收容罐' })
    return actions
  }
}
