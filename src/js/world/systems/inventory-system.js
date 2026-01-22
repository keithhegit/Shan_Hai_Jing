import emitter from '../../utils/event-bus.js'

export default class InventorySystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    this.resources = ctx?.resources || this.world?.resources || null
    this._saveTimer = null

    this.config = {
      backpack: { slots: 24, maxWeight: 60 },
      grid: { cols: 8, rows: 6 },
      gridMask: [
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 0],
      ],
      itemSizes: {
        coin: { w: 1, h: 1 },
        material_gun: { w: 2, h: 4 },
        key_plains: { w: 1, h: 2 },
        key_snow: { w: 1, h: 2 },
        key_desert: { w: 1, h: 2 },
        key_forest: { w: 1, h: 2 },
        canister_small: { w: 2, h: 2 },
        canister_medium: { w: 2, h: 2 },
        canister_large: { w: 4, h: 4 },
        Axe_Wood: { w: 2, h: 4 },
        Axe_Stone: { w: 2, h: 4 },
        Axe_Gold: { w: 2, h: 4 },
        Axe_Diamond: { w: 2, h: 4 },
        Pickaxe_Wood: { w: 2, h: 4 },
        Pickaxe_Stone: { w: 2, h: 4 },
        Pickaxe_Gold: { w: 2, h: 4 },
        Pickaxe_Diamond: { w: 2, h: 4 },
        Shovel_Wood: { w: 2, h: 4 },
        Shovel_Stone: { w: 2, h: 4 },
        Shovel_Gold: { w: 2, h: 4 },
        Shovel_Diamond: { w: 2, h: 4 },
        Sword_Wood: { w: 2, h: 4 },
        Sword_Stone: { w: 2, h: 4 },
        Sword_Gold: { w: 2, h: 4 },
        Sword_Diamond: { w: 2, h: 4 },
      },
      itemWeights: {
        stone: 1,
        fence: 4,
        coin: 0,
        crystal_big: 6,
        crystal_small: 3,
        canister_small: 4,
        canister_medium: 8,
        canister_large: 16,
        material_gun: 2,
        Axe_Wood: 4,
        Axe_Stone: 5,
        Axe_Gold: 4,
        Axe_Diamond: 6,
        Pickaxe_Wood: 4,
        Pickaxe_Stone: 5,
        Pickaxe_Gold: 4,
        Pickaxe_Diamond: 6,
        Shovel_Wood: 3,
        Shovel_Stone: 4,
        Shovel_Gold: 3,
        Shovel_Diamond: 5,
        Sword_Wood: 3,
        Sword_Stone: 4,
        Sword_Gold: 3,
        Sword_Diamond: 5,
      },
    }

    this.inventory = this._loadInventory()

    if (this.world) {
      this.world.inventorySystem = this
      this.world._inventory = this.inventory
      this.world._inventoryConfig = this.config
    }
  }

  destroy() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
  }

  getBagItems(bagName) {
    if (!this.inventory)
      this.inventory = { backpack: { items: {} }, warehouse: { items: {} }, gridLayouts: { backpack: {} } }
    if (!this.inventory.gridLayouts)
      this.inventory.gridLayouts = { backpack: {} }
    if (!this.inventory.gridLayouts.backpack)
      this.inventory.gridLayouts.backpack = {}
    if (bagName === 'warehouse') {
      if (!this.inventory.warehouse)
        this.inventory.warehouse = { items: {} }
      if (!this.inventory.warehouse.items)
        this.inventory.warehouse.items = {}
      return this.inventory.warehouse.items
    }
    if (!this.inventory.backpack)
      this.inventory.backpack = { items: {} }
    if (!this.inventory.backpack.items)
      this.inventory.backpack.items = {}
    return this.inventory.backpack.items
  }

  getBackpackGridSnapshot() {
    const items = this.getBagItems('backpack')
    const layout = this.inventory?.gridLayouts?.backpack || {}
    return this._buildBackpackGridSnapshot(items, layout)
  }

  buildBackpackGridSnapshot(items, layout) {
    return this._buildBackpackGridSnapshot(items, layout)
  }

  emitInventoryState() {
    const world = this.world
    const backpackItems = this.getBagItems('backpack')
    emitter.emit('inventory:update', {
      panel: world?._activeInventoryPanel ?? null,
      backpack: { ...backpackItems },
      warehouse: { ...this.getBagItems('warehouse') },
      backpackMeta: {
        slots: Object.keys(backpackItems).length,
        maxSlots: this._getBackpackMaxSlots(),
        weight: this._getBagWeight(backpackItems),
        maxWeight: this._getBackpackMaxWeight(),
      },
      grid: { ...(this.config?.grid || { cols: 8, rows: 6 }) },
      itemSizes: { ...(this.config?.itemSizes || {}) },
      backpackGrid: this._buildBackpackGridSnapshot(backpackItems, this.inventory?.gridLayouts?.backpack || {}),
    })
  }

  emitInventorySummary() {
    const backpackItems = this.getBagItems('backpack')
    const warehouseItems = this.getBagItems('warehouse')
    const backpackWeight = this._getBagWeight(backpackItems)
    emitter.emit('inventory:summary', {
      backpackTotal: this._getItemTotalCount(backpackItems),
      warehouseTotal: this._getItemTotalCount(warehouseItems),
      backpackStacks: Object.keys(backpackItems).length,
      warehouseStacks: Object.keys(warehouseItems).length,
      backpackWeight,
      backpackMaxWeight: this._getBackpackMaxWeight(),
      backpackSlots: Object.keys(backpackItems).length,
      backpackMaxSlots: this._getBackpackMaxSlots(),
      carriedPet: this.world?._carriedAnimal?.group ? (this.world._carriedAnimal._typeLabel || this.world._carriedAnimal._resourceKey || '') : '',
    })
  }

  addItem(bagName, itemId, amount = 1) {
    const world = this.world
    const items = this.getBagItems(bagName)
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return
    if (bagName === 'backpack' && !this._canAddToBackpack(itemId, delta)) {
      if (world?.currentWorld === 'dungeon') {
        world?._spawnDungeonItemDrop?.({ itemId, amount: delta })
        emitter.emit('dungeon:toast', { text: `背包已满或超重：${itemId} x${delta}（已掉落）` })
      }
      else {
        emitter.emit('dungeon:toast', { text: `背包已满或超重：${itemId} x${delta}` })
      }
      return
    }
    items[itemId] = (items[itemId] || 0) + delta
    this.emitInventorySummary()
    this.emitInventoryState()
    world?._updateCanisterVisuals?.()
    world?._applyBurdenEffects?.()
    this._scheduleSave()
  }

  removeItem(bagName, itemId, amount = 1) {
    const world = this.world
    const items = this.getBagItems(bagName)
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return false
    const current = items[itemId] || 0
    if (current < delta)
      return false
    const next = current - delta
    if (next <= 0)
      delete items[itemId]
    else
      items[itemId] = next
    this.emitInventorySummary()
    this.emitInventoryState()
    world?._updateCanisterVisuals?.()
    world?._applyBurdenEffects?.()
    this._scheduleSave()
    return true
  }

  transfer(payload) {
    const world = this.world
    const from = payload?.from
    const to = payload?.to
    const itemId = payload?.itemId
    const amount = payload?.amount ?? 1
    if (!from || !to || from === to || !itemId)
      return
    if ((from === 'warehouse' || to === 'warehouse') && (world?.currentWorld !== 'hub' || world?._activeInventoryPanel !== 'warehouse' || world?._activeInteractable?.id !== 'warehouse'))
      return
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (to === 'backpack' && !this._canAddToBackpack(itemId, delta)) {
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${itemId} x${delta}` })
      return
    }
    const ok = this.removeItem(from, itemId, amount)
    if (!ok)
      return
    this.addItem(to, itemId, amount)
  }

  placeBackpackGridItem(payload) {
    const uid = payload?.uid
    const x = Math.floor(Number(payload?.x))
    const y = Math.floor(Number(payload?.y))
    const rotated = !!payload?.rotated
    if (!uid || !Number.isFinite(x) || !Number.isFinite(y))
      return

    const items = this.getBagItems('backpack')
    const base = this.inventory?.gridLayouts?.backpack || {}
    const next = { ...base, [uid]: { x, y, rotated } }
    const snapshot = this._buildBackpackGridSnapshot(items, next)
    const placed = (snapshot?.items || []).find(i => i.uid === uid) || null
    if (!placed || placed.x !== x || placed.y !== y || !!placed.rotated !== rotated) {
      emitter.emit('dungeon:toast', { text: '无法放置到该位置' })
      return
    }

    if (!this.inventory.gridLayouts)
      this.inventory.gridLayouts = { backpack: {} }
    this.inventory.gridLayouts.backpack = next
    this.emitInventoryState()
    this._scheduleSave()
  }

  scheduleSave() {
    this._scheduleSave()
  }

  _loadInventory() {
    try {
      if (typeof window === 'undefined')
        return { backpack: { items: {} }, warehouse: { items: {} }, gridLayouts: { backpack: {} } }
      const raw = window.localStorage?.getItem?.('mmmc:inventory_v1')
      if (!raw)
        return { backpack: { items: {} }, warehouse: { items: {} }, gridLayouts: { backpack: {} } }
      const parsed = JSON.parse(raw)
      const backpack = parsed?.backpack?.items && typeof parsed.backpack.items === 'object'
        ? parsed.backpack.items
        : {}
      const warehouse = parsed?.warehouse?.items && typeof parsed.warehouse.items === 'object'
        ? parsed.warehouse.items
        : {}
      const gridLayoutsRaw = parsed?.gridLayouts && typeof parsed.gridLayouts === 'object'
        ? parsed.gridLayouts
        : {}
      return {
        backpack: { items: this._sanitizeItemMap(backpack) },
        warehouse: { items: this._sanitizeItemMap(warehouse) },
        gridLayouts: this._sanitizeGridLayouts(gridLayoutsRaw),
      }
    }
    catch {
      return { backpack: { items: {} }, warehouse: { items: {} }, gridLayouts: { backpack: {} } }
    }
  }

  _sanitizeGridLayouts(raw) {
    const src = raw && typeof raw === 'object' ? raw : {}
    const backpack = src?.backpack && typeof src.backpack === 'object' ? src.backpack : {}
    const next = { backpack: {} }
    for (const [uid, entry] of Object.entries(backpack)) {
      if (typeof uid !== 'string' || !entry || typeof entry !== 'object')
        continue
      const x = Math.floor(Number(entry.x))
      const y = Math.floor(Number(entry.y))
      if (!Number.isFinite(x) || !Number.isFinite(y))
        continue
      next.backpack[uid] = {
        x,
        y,
        rotated: !!entry.rotated,
      }
    }
    return next
  }

  _sanitizeItemMap(map) {
    const next = {}
    for (const [key, value] of Object.entries(map || {})) {
      if (typeof key !== 'string')
        continue
      const n = Number(value)
      if (!Number.isFinite(n))
        continue
      const count = Math.floor(n)
      if (count <= 0)
        continue
      next[key] = count
    }
    return next
  }

  _saveNow() {
    try {
      if (typeof window === 'undefined')
        return
      window.localStorage?.setItem?.('mmmc:inventory_v1', JSON.stringify(this.inventory || {}))
    }
    catch {
    }
  }

  _scheduleSave() {
    if (this._saveTimer)
      clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this._saveNow()
    }, 250)
  }

  _getItemTotalCount(items) {
    return Object.values(items || {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
  }

  _getItemWeight(itemId) {
    const w = this.config?.itemWeights?.[itemId]
    return Number.isFinite(w) ? w : 1
  }

  _getBackpackMaxSlots() {
    const v = this.config?.backpack?.slots
    return Number.isFinite(v) ? v : 24
  }

  _getBackpackMaxWeight() {
    const v = this.config?.backpack?.maxWeight
    return Number.isFinite(v) ? v : 60
  }

  _getBagWeight(items) {
    let sum = 0
    for (const [id, count] of Object.entries(items || {})) {
      const n = Math.max(0, Math.floor(Number(count) || 0))
      if (n <= 0)
        continue
      sum += this._getItemWeight(id) * n
    }
    return sum
  }

  _canAddToBackpack(itemId, amount = 1) {
    const items = this.getBagItems('backpack')
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return false

    const maxSlots = this._getBackpackMaxSlots()
    const stacks = Object.keys(items || {}).length
    const needsNewSlot = !Object.prototype.hasOwnProperty.call(items, itemId)
    if (needsNewSlot && stacks + 1 > maxSlots)
      return false

    const maxWeight = this._getBackpackMaxWeight()
    const weight = this._getBagWeight(items)
    const nextWeight = weight + this._getItemWeight(itemId) * delta
    if (nextWeight > maxWeight)
      return false

    const layout = this.inventory?.gridLayouts?.backpack || {}
    const currentSnap = this._buildBackpackGridSnapshot(items, layout)
    const nextItems = { ...items, [itemId]: (items[itemId] || 0) + delta }
    const nextSnap = this._buildBackpackGridSnapshot(nextItems, layout)
    const curOverflow = (currentSnap?.overflow || []).filter(o => o?.itemId === itemId).length
    const nextOverflow = (nextSnap?.overflow || []).filter(o => o?.itemId === itemId).length
    if (nextOverflow > curOverflow)
      return false

    return true
  }

  _buildBackpackGridSnapshot(items, layout) {
    const cfg = this.config?.grid || { cols: 8, rows: 6 }
    const cols = Math.max(1, Math.floor(Number(cfg.cols) || 8))
    const rows = Math.max(1, Math.floor(Number(cfg.rows) || 6))
    const sizes = this.config?.itemSizes || {}
    const rawMask = Array.isArray(this.config?.gridMask) ? this.config.gridMask : null
    const mask = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
      const v = rawMask?.[y]?.[x]
      return v === 0 ? 0 : 1
    }))

    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null))
    const placed = []
    const overflow = []

    const expanded = []
    let seq = 1
    for (const [id, count] of Object.entries(items || {})) {
      const n = Math.max(0, Math.floor(Number(count) || 0))
      if (n <= 0)
        continue
      const size = sizes?.[id] || { w: 1, h: 1 }
      const w = Math.max(1, Math.floor(Number(size.w) || 1))
      const h = Math.max(1, Math.floor(Number(size.h) || 1))
      const isStack = id === 'coin' || String(id).startsWith('key_')
      if (isStack) {
        expanded.push({
          uid: `${id}:${seq++}`,
          itemId: id,
          w,
          h,
          count: n,
        })
        continue
      }
      for (let i = 0; i < n; i++)
        expanded.push({ uid: `${id}:${seq++}`, itemId: id, w, h, count: 1 })
    }

    const canFitAt = (uid, x, y, w, h) => {
      if (x < 0 || y < 0 || x + w > cols || y + h > rows)
        return false
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (mask[yy][xx] === 0)
            return false
          const v = cells[yy][xx]
          if (v && v !== uid)
            return false
        }
      }
      return true
    }

    const fill = (uid, x, y, w, h, value) => {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          cells[yy][xx] = value
        }
      }
    }

    const preferred = []
    const remaining = []
    const layoutMap = layout && typeof layout === 'object' ? layout : {}
    for (const item of expanded) {
      const pref = layoutMap?.[item.uid]
      if (pref && typeof pref === 'object') {
        const baseW = item.w
        const baseH = item.h
        const rotated = !!pref.rotated
        const w = rotated ? baseH : baseW
        const h = rotated ? baseW : baseH
        preferred.push({ ...item, x: Math.floor(Number(pref.x)), y: Math.floor(Number(pref.y)), w, h, rotated })
      }
      else {
        remaining.push(item)
      }
    }

    for (const item of preferred) {
      if (Number.isFinite(item.x) && Number.isFinite(item.y) && canFitAt(item.uid, item.x, item.y, item.w, item.h)) {
        fill(item.uid, item.x, item.y, item.w, item.h, item.uid)
        placed.push({ uid: item.uid, itemId: item.itemId, w: item.w, h: item.h, x: item.x, y: item.y, rotated: item.rotated, count: item.count })
      }
      else {
        remaining.push({ uid: item.uid, itemId: item.itemId, w: item.rotated ? item.h : item.w, h: item.rotated ? item.w : item.h, count: item.count })
      }
    }

    for (const item of remaining) {
      let found = null
      for (let y = 0; y < rows && !found; y++) {
        for (let x = 0; x < cols; x++) {
          if (canFitAt(item.uid, x, y, item.w, item.h)) {
            found = { x, y, w: item.w, h: item.h, rotated: false }
            break
          }
        }
      }
      if (!found) {
        overflow.push({ ...item, x: -1, y: -1, rotated: false })
        continue
      }
      fill(item.uid, found.x, found.y, found.w, found.h, item.uid)
      placed.push({ ...item, ...found })
    }

    return {
      cols,
      rows,
      mask,
      cells,
      items: placed,
      overflow,
    }
  }
}
