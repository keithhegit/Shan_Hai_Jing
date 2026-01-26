<script setup>
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
import Crosshair from './components/Crosshair.vue'
import GameCTA from './components/GameCTA.vue'
import MiniMap from './components/MiniMap.vue'
import PlayerHUD from './components/PlayerHUD.vue'
import StoryModal from './components/StoryModal.vue'
import Experience from './js/experience.js'
import emitter from './js/utils/event-bus.js'
import warpOverlay from './js/vfx/warp-tunnel/warp-loading-overlay.js'

const threeCanvas = ref(null)
let experience = null
const portalPrompt = ref(null)
const interactablePrompt = ref(null)
const interactableModal = ref(null)
const loadingState = ref(null)
const dungeonProgress = ref(null)
const dungeonToast = ref(null)
let dungeonToastTimer = null
const dungeonTimer = ref(null)
const lockState = ref(null)
const coords = ref(null)
const inventoryPanel = ref(null)
const inventoryData = ref({ panel: null, backpack: {}, warehouse: {} })
const inventoryCanisterMeta = ref({})
const backpackGrid = ref(null)
const gridState = ref(null)
const gridDrag = ref(null)
const gridHover = ref(null)
const backpackGridPointerEl = ref(null)
const warehouseGridPointerEl = ref(null)
const warehouseHover = ref(null)
const inventorySelected = ref(null)
const discardConfirm = ref(null)
const rechargeConfirm = ref(null)
const gridCellPx = 42
const warehousePage = ref(1)
const warehousePagesUnlocked = ref(2)
const warehousePagesTotal = ref(5)
const warehouseGrid = ref(null)
const warehouseGridState = ref(null)
const chestModal = ref(null)
const portalSelectModal = ref(null)
const extractionModal = ref(null)
const deathModal = ref(null)
const miningProgress = ref(null)
const miningNow = ref(0)
let miningRaf = null
const buildHud = ref(null)
const sellMode = ref(false)
const sellConfirm = ref(null)
const visitedPortals = new Set()
let lastLoadingPortalId = null

const quickCanisterSlotsPerPage = 9
const quickCanisterMaxCarry = 9
const quickHudKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

const quickCanisterAll = computed(() => {
  const g = gridState.value
  const list = [...(g?.items || []), ...(g?.overflow || [])]
    .filter(it => String(it?.itemId || '').startsWith('canister_') && Number.isFinite(Number(it?.metaIndex)))
    .map((it) => {
      const metaIndex = Math.max(0, Math.floor(Number(it.metaIndex)))
      const meta = inventoryCanisterMeta.value?.[it.itemId]?.[metaIndex] || null
      const rkey = meta?.capturedResourceKey ? String(meta.capturedResourceKey) : null
      return {
        uid: it.uid,
        itemId: it.itemId,
        x: Number.isFinite(Number(it.x)) ? Number(it.x) : 999,
        y: Number.isFinite(Number(it.y)) ? Number(it.y) : 999,
        metaIndex,
        avatarSrc: rkey ? avatarIconSrcForResourceKey(rkey) : null,
        exhausted: !!meta?.exhausted,
      }
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || String(a.uid).localeCompare(String(b.uid)))

  return list.slice(0, quickCanisterMaxCarry)
})

const quickCanisterVisible = computed(() => {
  const slice = quickCanisterAll.value.slice(0, quickCanisterSlotsPerPage)
  const out = [...slice]
  while (out.length < quickCanisterSlotsPerPage)
    out.push(null)
  return out
})

const quickHudSlots = computed(() => {
  const backpack = inventoryData.value?.backpack || {}
  const hasGun = (Number(backpack?.material_gun) || 0) > 0
  const hasPickaxe = (Number(backpack?.Pickaxe_Wood) || 0) > 0
  const hasFenceCenter = (Number(backpack?.Fence_Center) || 0) > 0
  const hasFenceCorner = (Number(backpack?.Fence_Corner) || 0) > 0
  const weapon = {
    kind: 'weapon',
    key: '1',
    itemId: 'material_gun',
    iconSrc: gridItemBaseIconSrc('material_gun'),
    enabled: hasGun,
  }
  const rest = quickCanisterVisible.value.map((entry, i) => {
    if (!entry)
      return { kind: 'empty', key: quickHudKeys[i + 1], enabled: false }
    return { kind: 'canister', key: quickHudKeys[i + 1], entry, enabled: true }
  })
  if (hasPickaxe) {
    const pick = { kind: 'tool', itemId: 'Pickaxe_Wood', iconSrc: gridItemBaseIconSrc('Pickaxe_Wood'), enabled: true }
    for (let i = 0; i < rest.length; i++) {
      if (rest[i]?.kind === 'empty') {
        rest[i] = { ...pick, key: rest[i].key }
        break
      }
    }
  }
  if (hasFenceCenter || hasFenceCorner) {
    const fillers = []
    if (hasFenceCenter)
      fillers.push({ kind: 'build', itemId: 'Fence_Center', iconSrc: gridItemBaseIconSrc('Fence_Center'), enabled: true })
    if (hasFenceCorner)
      fillers.push({ kind: 'build', itemId: 'Fence_Corner', iconSrc: gridItemBaseIconSrc('Fence_Corner'), enabled: true })
    let fi = 0
    for (let i = 0; i < rest.length && fi < fillers.length; i++) {
      if (rest[i]?.kind === 'empty')
        rest[i] = { ...fillers[fi++], key: rest[i].key }
    }
  }
  return [weapon, ...rest]
})

const miningPct = computed(() => {
  const p = miningProgress.value
  if (!p)
    return 0
  const elapsed = miningNow.value - Number(p.startedAt || 0)
  const raw = elapsed / Math.max(1, Number(p.durationMs) || 1)
  return Math.max(0, Math.min(1, raw))
})

function triggerQuickHotkey(key) {
  const k = String(key || '')
  if (!k)
    return
  const slot = (quickHudSlots.value || []).find(s => s?.key === k)
  if (!slot || slot.enabled === false)
    return
  if (slot.kind === 'weapon') {
    emitter.emit('inventory:equip', { itemId: 'material_gun' })
    return
  }
  if (slot.kind === 'tool' && slot.itemId) {
    emitter.emit('inventory:equip', { itemId: slot.itemId })
    return
  }
  if (slot.kind === 'canister' && slot.entry) {
    quickCanisterPick(slot.entry)
    return
  }
  if (slot.kind === 'build' && slot.itemId) {
    equipItem(slot.itemId)
  }
}

function quickCanisterPick(entry) {
  if (!entry?.itemId)
    return
  if (entry.exhausted) {
    rechargeConfirm.value = { itemId: entry.itemId, metaIndex: entry.metaIndex }
    return
  }
  equipItem(entry.itemId, { metaIndex: entry.metaIndex })
}

function loadVisitedPortals() {
  try {
    const raw = window.localStorage?.getItem?.('mmmc:warp_portal_visited_v1')
    const arr = raw ? JSON.parse(raw) : []
    if (Array.isArray(arr))
      arr.forEach(id => visitedPortals.add(String(id)))
  }
  catch {
  }
}

function saveVisitedPortals() {
  try {
    window.localStorage?.setItem?.('mmmc:warp_portal_visited_v1', JSON.stringify(Array.from(visitedPortals)))
  }
  catch {
  }
}

function onPortalPrompt(payload) {
  portalPrompt.value = payload
}

function onPortalPromptClear() {
  portalPrompt.value = null
}

function onInteractablePrompt(payload) {
  interactablePrompt.value = payload
}

function onInteractablePromptClear() {
  interactablePrompt.value = null
}

function onInteractableOpen(payload) {
  interactableModal.value = payload
}

function onLoadingShow(payload) {
  loadingState.value = payload
  const kind = payload?.kind || null
  const portalId = payload?.portalId ? String(payload.portalId) : null
  lastLoadingPortalId = portalId
  if (kind === 'dungeon-enter') {
    warpOverlay.showBackdropProgress({ text: 'Portal Initiating' })
    return
  }
  warpOverlay.show({ text: 'Portal Initiating' })
  warpOverlay.engageHyperdrive({ durationMs: 6000 })
}

function onLoadingHide() {
  loadingState.value = null
  if (lastLoadingPortalId) {
    visitedPortals.add(lastLoadingPortalId)
    saveVisitedPortals()
    lastLoadingPortalId = null
  }
  warpOverlay.completeSoon()
}

function onDungeonMeshReady() {
  if (!loadingState.value)
    return
  if (loadingState.value.kind !== 'dungeon-enter')
    return
  warpOverlay.markBackdropReady()
  warpOverlay.startTunnel({ text: 'Portal Initiating', durationMs: 6000 })
}

function onDungeonProgress(payload) {
  dungeonProgress.value = payload
}

function onDungeonProgressClear() {
  dungeonProgress.value = null
}

function onDungeonTimer(payload) {
  dungeonTimer.value = payload || null
}

function onCoords(payload) {
  coords.value = payload || null
}

function formatCoord(value) {
  const n = Number(value)
  if (!Number.isFinite(n))
    return '0.0'
  return n.toFixed(1)
}

function formatDungeonClock(ms) {
  const t = Math.max(0, Math.floor(Number(ms) || 0))
  const totalSec = Math.floor(t / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function onDungeonToast(payload) {
  dungeonToast.value = payload
  if (dungeonToastTimer)
    clearTimeout(dungeonToastTimer)
  dungeonToastTimer = setTimeout(() => {
    dungeonToast.value = null
    dungeonToastTimer = null
  }, 2500)
}

function onDungeonToastClear() {
  dungeonToast.value = null
  if (dungeonToastTimer)
    clearTimeout(dungeonToastTimer)
  dungeonToastTimer = null
}

function miningTick() {
  if (!miningProgress.value)
    return
  miningNow.value = performance.now()
  miningRaf = window.requestAnimationFrame(miningTick)
}

function onMiningBegin(payload) {
  const durationMs = Math.max(200, Math.floor(Number(payload?.durationMs) || 5000))
  miningProgress.value = { label: payload?.label || '挖矿中', startedAt: performance.now(), durationMs }
  miningNow.value = performance.now()
  if (miningRaf)
    window.cancelAnimationFrame(miningRaf)
  miningRaf = window.requestAnimationFrame(miningTick)
}

function onMiningEnd() {
  miningProgress.value = null
  if (miningRaf)
    window.cancelAnimationFrame(miningRaf)
  miningRaf = null
}

function onBuildHud(payload) {
  buildHud.value = payload || null
}

function onBuildHudClear() {
  buildHud.value = null
}

function onShopSellMode(payload) {
  sellMode.value = !!payload?.active
  if (!sellMode.value)
    sellConfirm.value = null
}

function onCombatLock(payload) {
  lockState.value = payload
}

function onCombatLockClear() {
  lockState.value = null
}

function onExtractionOpen(payload) {
  extractionModal.value = payload || null
}

function closeExtractionModal() {
  if (!extractionModal.value)
    return
  extractionModal.value = null
  emitter.emit('dungeon:extraction_action', { action: 'cancel' })
}

function chooseExtractionAction(action) {
  if (!extractionModal.value || !action)
    return
  extractionModal.value = null
  emitter.emit('dungeon:extraction_action', { action })
}

function onDeathOpen(payload) {
  deathModal.value = payload || null
}

function onDeathCloseUi() {
  deathModal.value = null
}

function chooseDeathAction(action) {
  if (!deathModal.value || !action)
    return
  deathModal.value = null
  emitter.emit('dungeon:death_action', { action })
}

function closeInteractableModal() {
  if (!interactableModal.value)
    return
  const id = interactableModal.value.id
  interactableModal.value = null
  emitter.emit('interactable:close', { id })
}

function triggerInteractableAction(actionId) {
  if (!interactableModal.value || !actionId)
    return
  const id = interactableModal.value.id
  emitter.emit('interactable:action', { id, action: actionId })
  closeInteractableModal()
}

function onChestOpen(payload) {
  chestModal.value = payload
}

function onChestUpdate(payload) {
  if (!payload?.id)
    return
  if (!chestModal.value || chestModal.value.id !== payload.id)
    return
  chestModal.value = { ...chestModal.value, ...payload }
}

function onChestCloseUi(payload) {
  const id = payload?.id
  if (!id)
    return
  if (!chestModal.value || chestModal.value.id !== id)
    return
  closeChestModal()
}

function onPortalSelectOpen(payload) {
  portalSelectModal.value = payload
}

function closePortalSelectModal() {
  if (!portalSelectModal.value)
    return
  portalSelectModal.value = null
  emitter.emit('portal:select_close')
}

function chooseDungeon(id) {
  if (!portalSelectModal.value || !id)
    return
  portalSelectModal.value = null
  emitter.emit('portal:select', { id })
}

function closeChestModal() {
  if (!chestModal.value)
    return
  const id = chestModal.value.id
  chestModal.value = null
  emitter.emit('chest:close', { id })
}

function useChestKey(keyId) {
  if (!chestModal.value || !keyId)
    return
  emitter.emit('chest:use_key', { id: chestModal.value.id, keyId })
}

function takeChestItem(itemId, amount = 1) {
  if (!chestModal.value || !itemId)
    return
  emitter.emit('chest:take', { id: chestModal.value.id, itemId, amount })
}

function onInventoryOpen(payload) {
  inventoryPanel.value = payload?.panel || 'backpack'
}

function onInventoryCloseUi() {
  inventoryPanel.value = null
  sellMode.value = false
  sellConfirm.value = null
}

function onInventoryUpdate(payload) {
  inventoryData.value = payload || { panel: inventoryPanel.value, backpack: {}, warehouse: {} }
  if (payload?.panel)
    inventoryPanel.value = payload.panel
  inventoryCanisterMeta.value = payload?.canisterMeta || {}
  backpackGrid.value = payload?.backpackGrid || null
  warehouseGrid.value = payload?.warehouseGrid || null
  if (payload?.warehousePage)
    warehousePage.value = Math.max(1, Math.floor(Number(payload.warehousePage) || 1))
  if (payload?.warehousePagesUnlocked)
    warehousePagesUnlocked.value = Math.max(1, Math.floor(Number(payload.warehousePagesUnlocked) || 1))
  if (payload?.warehousePagesTotal)
    warehousePagesTotal.value = Math.max(1, Math.floor(Number(payload.warehousePagesTotal) || 1))
  if (!gridDrag.value) {
    const rawGrid = backpackGrid.value ? toRaw(backpackGrid.value) : null
    gridState.value = rawGrid ? structuredClone(rawGrid) : null
  }
  const rawWh = warehouseGrid.value ? toRaw(warehouseGrid.value) : null
  warehouseGridState.value = rawWh ? structuredClone(rawWh) : null
  if (warehouseGridState.value)
    gridRecomputeCells(warehouseGridState.value)

  const selected = inventorySelected.value
  if (selected?.uid) {
    const g = gridState.value
    const found = g ? (g.items || []).find(i => i.uid === selected.uid) : null
    if (!found)
      inventorySelected.value = null
    else
      inventorySelected.value = { uid: found.uid, itemId: found.itemId, count: found.count, metaIndex: found.metaIndex ?? null }
  }
}

function closeInventoryPanel() {
  if (!inventoryPanel.value)
    return
  emitter.emit('inventory:close')
}

function transferItem(from, to, itemId, amount = 1) {
  if (!from || !to || !itemId)
    return
  emitter.emit('inventory:transfer', { from, to, itemId, amount })
}

function setWarehousePage(nextPage) {
  const page = Math.max(1, Math.floor(Number(nextPage) || 1))
  if (page > warehousePagesUnlocked.value)
    return
  if (warehousePage.value === page)
    return
  warehousePage.value = page
  emitter.emit('inventory:warehouse_page', { page })
}

function equipItem(itemId, extra = null) {
  if (!itemId)
    return
  const payload = { itemId }
  if (extra && typeof extra === 'object')
    Object.assign(payload, extra)
  emitter.emit('inventory:equip', payload)
}

function exitBuildMode() {
  emitter.emit('build:exit')
}

function equipSelectedCanister() {
  const selected = inventorySelected.value
  const g = gridState.value
  if (!selected?.uid || !g)
    return
  const list = [...(g.items || []), ...(g.overflow || [])]
  const it = list.find(i => i?.uid === selected.uid) || null
  if (!it?.itemId || !String(it.itemId).startsWith('canister_'))
    return
  const metaIndex = Number.isFinite(Number(it.metaIndex)) ? Math.max(0, Math.floor(Number(it.metaIndex))) : null
  const meta = metaIndex === null ? null : (inventoryCanisterMeta.value?.[it.itemId]?.[metaIndex] || null)
  if (meta?.exhausted) {
    rechargeConfirm.value = { itemId: it.itemId, metaIndex }
    return
  }
  equipItem(it.itemId, { metaIndex })
}

function cancelRecharge() {
  rechargeConfirm.value = null
}

function confirmRecharge() {
  const payload = rechargeConfirm.value
  if (!payload?.itemId)
    return
  const potions = Math.max(0, Math.floor(Number(inventoryData.value?.backpack?.pet_potion) || 0))
  if (potions <= 0) {
    emitter.emit('dungeon:toast', { text: '没有足够的灵兽补充剂' })
    rechargeConfirm.value = null
    return
  }
  emitter.emit('pet:recharge', { itemId: payload.itemId, metaIndex: payload.metaIndex })
  rechargeConfirm.value = null
  equipItem(payload.itemId, { metaIndex: payload.metaIndex })
}

function bagEntries(bag) {
  return Object.entries(bag || {})
    .map(([id, count]) => ({ id, count }))
    .filter(row => Number.isFinite(Number(row.count)) && Number(row.count) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function itemLabel(id) {
  if (id === 'fence')
    return 'Fence'
  if (id === 'Fence_Center')
    return 'Fence Center'
  if (id === 'Fence_Corner')
    return 'Fence Corner'
  if (id === 'coin')
    return '金币'
  if (id === 'material_gun')
    return '灵兽石'
  if (id === 'pet_potion')
    return '灵兽补充剂'
  if (id === 'canister_small')
    return '收容罐（小）'
  if (id === 'canister_medium')
    return '收容罐（中）'
  if (id === 'canister_large')
    return '收容罐（大）'
  if (id === 'key_plains')
    return '平原钥匙'
  if (id === 'key_snow')
    return '雪原钥匙'
  if (id === 'key_desert')
    return '沙漠钥匙'
  if (id === 'key_forest')
    return '森林钥匙'
  if (id === 'crystal_big')
    return 'Crystal_Big.gltf'
  if (id === 'crystal_small')
    return 'Crystal_Small.gltf'
  if (String(id).startsWith('Axe_') || String(id).startsWith('Pickaxe_') || String(id).startsWith('Shovel_') || String(id).startsWith('Sword_'))
    return `${id}.gltf`
  return id
}

function itemDescription(id) {
  if (id === 'coin')
    return '货币。用于解锁仓库页与后续升级。'
  if (id === 'Fence_Center' || id === 'Fence_Corner')
    return '建造道具。可在建造模式放置/拆除围栏。'
  if (id === 'pet_potion')
    return '消耗品。用于恢复精疲力竭的灵兽。'
  if (String(id).startsWith('key_'))
    return '钥匙。用于解锁对应地牢的上锁宝箱。'
  if (String(id).startsWith('canister_'))
    return '收容罐。捕捉成功后的实体战利品，占用网格并带来负重压力。'
  if (id === 'material_gun')
    return '灵兽石。锁定目标后可发射光束造成持续伤害，并触发仇恨追击。'
  if (id === 'crystal_big' || id === 'crystal_small')
    return '矿物。用于后续制作与升级。'
  return '道具。'
}

function isKeyItem(id) {
  return String(id).startsWith('key_')
}

function chestKeyEntries() {
  return bagEntries(inventoryData.value?.backpack).filter(row => isKeyItem(row.id))
}

function onKeyDown(event) {
  const key = event.key?.toLowerCase?.() ?? event.key
  if (!portalSelectModal.value && !interactableModal.value && !chestModal.value && !inventoryPanel.value && !loadingState.value && !extractionModal.value && !deathModal.value) {
    if (/^\d$/.test(String(key))) {
      triggerQuickHotkey(String(key))
      return
    }
  }
  if (extractionModal.value && key === 'escape') {
    closeExtractionModal()
    return
  }
  if (portalSelectModal.value && key === 'escape') {
    closePortalSelectModal()
    return
  }
  if (chestModal.value && key === 'escape') {
    closeChestModal()
    return
  }
  if (inventoryPanel.value && key === 'escape') {
    closeInventoryPanel()
    return
  }
  if (inventoryPanel.value && key === 'r' && gridDrag.value) {
    rotateDraggedGridItem()
    return
  }
  if (key === 'escape')
    closeInteractableModal()
}

function gridRecomputeCells(grid) {
  if (!grid)
    return
  const rows = Math.max(1, Math.floor(Number(grid.rows) || 6))
  const cols = Math.max(1, Math.floor(Number(grid.cols) || 8))
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null))
  for (const item of grid.items || []) {
    if (item.x < 0 || item.y < 0)
      continue
    for (let y = item.y; y < item.y + item.h; y++) {
      for (let x = item.x; x < item.x + item.w; x++) {
        if (y >= 0 && y < rows && x >= 0 && x < cols)
          cells[y][x] = item.uid
      }
    }
  }
  grid.cells = cells
}

function gridFindItem(uid) {
  const grid = gridState.value
  if (!grid)
    return null
  return (grid.items || []).find(i => i.uid === uid) || null
}

function warehouseFindItem(uid) {
  const grid = warehouseGridState.value
  if (!grid)
    return null
  return (grid.items || []).find(i => i.uid === uid) || null
}

function gridCanFit(uid, x, y, w, h) {
  const grid = gridState.value
  if (!grid)
    return false
  const rows = grid.rows
  const cols = grid.cols
  if (x < 0 || y < 0 || x + w > cols || y + h > rows)
    return false
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (grid.mask?.[yy]?.[xx] === 0)
        return false
      const v = grid.cells?.[yy]?.[xx] ?? null
      if (v && v !== uid)
        return false
    }
  }
  return true
}

function warehouseCanFit(uid, x, y, w, h) {
  const grid = warehouseGridState.value
  if (!grid)
    return false
  const rows = grid.rows
  const cols = grid.cols
  if (x < 0 || y < 0 || x + w > cols || y + h > rows)
    return false
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (grid.mask?.[yy]?.[xx] === 0)
        return false
      const v = grid.cells?.[yy]?.[xx] ?? null
      if (v && v !== uid)
        return false
    }
  }
  return true
}

function gridCellActive(index) {
  const grid = gridState.value
  if (!grid)
    return false
  const i = Number(index)
  const x = (i - 1) % grid.cols
  const y = Math.floor((i - 1) / grid.cols)
  return grid.mask?.[y]?.[x] !== 0
}

function gridCellActiveBy(grid, index) {
  if (!grid)
    return false
  const i = Number(index)
  const x = (i - 1) % grid.cols
  const y = Math.floor((i - 1) / grid.cols)
  return grid.mask?.[y]?.[x] !== 0
}

function gridPointerToCell(event) {
  const el = event.currentTarget
  if (!el)
    return null
  const rect = el.getBoundingClientRect()
  const x = Math.floor((event.clientX - rect.left) / gridCellPx)
  const y = Math.floor((event.clientY - rect.top) / gridCellPx)
  return { x, y }
}

function selectGridItem(uid) {
  const item = gridFindItem(uid)
  if (!item)
    return
  if (sellMode.value) {
    const itemId = String(item.itemId || '')
    const metaIndex = item.metaIndex ?? null
    const meta = Number.isFinite(Number(metaIndex)) ? (inventoryCanisterMeta.value?.[itemId]?.[Math.max(0, Math.floor(Number(metaIndex)))] || null) : null
    let price = 0
    let reason = null
    if (itemId.startsWith('canister_')) {
      if (!meta)
        reason = '无法获取收容罐状态'
      else if (meta.exhausted)
        price = 1
      else if (itemId === 'canister_large')
        price = 3
      else if (itemId === 'canister_medium')
        price = 2
      else
        price = 1
    }
    else if (itemId === 'Pickaxe_Wood' || itemId.startsWith('Pickaxe_')) {
      price = 3
    }
    else if (itemId.startsWith('Axe_')) {
      price = 3
    }
    else if (itemId === 'crystal_small' || itemId.startsWith('key_')) {
      reason = '不可卖出'
    }
    else {
      reason = '不可卖出'
    }
    sellConfirm.value = { uid: item.uid, itemId: item.itemId, metaIndex: metaIndex ?? null, price, reason }
    return
  }
  inventorySelected.value = { uid: item.uid, itemId: item.itemId, count: item.count, metaIndex: item.metaIndex ?? null }
  emitter.emit('inventory:select', { itemId: item.itemId, uid: item.uid, metaIndex: item.metaIndex ?? null })
}

function openDiscardConfirmByUid(uid) {
  const item = gridFindItem(uid)
  if (!item)
    return
  const isStack = item.itemId === 'coin' || String(item.itemId).startsWith('key_')
  const amount = Math.max(1, Math.min(isStack ? 1 : 1, Math.floor(Number(item.count) || 1)))
  discardConfirm.value = { uid: item.uid, itemId: item.itemId, count: item.count, amount }
}

function confirmDiscard() {
  const payload = discardConfirm.value
  if (!payload?.uid || !payload?.itemId)
    return
  emitter.emit('inventory:drop', { uid: payload.uid, amount: payload.amount })
  if (inventorySelected.value?.uid === payload.uid)
    inventorySelected.value = null
  discardConfirm.value = null
}

function cancelDiscard() {
  discardConfirm.value = null
}

function confirmSell() {
  const payload = sellConfirm.value
  if (!payload?.uid || !payload?.itemId)
    return
  const price = Math.max(0, Math.floor(Number(payload.price) || 0))
  if (price <= 0)
    return
  emitter.emit('shop:sell', { itemId: payload.itemId, uid: payload.uid, metaIndex: payload.metaIndex ?? null })
  sellConfirm.value = null
}

function cancelSell() {
  sellConfirm.value = null
}

function requestDropSelected() {
  const selected = inventorySelected.value
  if (!selected?.uid)
    return
  openDiscardConfirmByUid(selected.uid)
}

function onGridItemPointerDown(event, uid) {
  if (!gridState.value)
    return
  const item = gridFindItem(uid)
  if (!item)
    return
  selectGridItem(uid)
  gridDrag.value = {
    panel: 'backpack',
    uid,
    startX: item.x,
    startY: item.y,
    w: item.w,
    h: item.h,
    rotated: !!item.rotated,
  }
  gridHover.value = null
  if (event.pointerId !== undefined)
    backpackGridPointerEl.value?.setPointerCapture?.(event.pointerId)
  event.stopPropagation()
  event.preventDefault()
}

function onGridPointerMove(event) {
  const drag = gridDrag.value
  const grid = gridState.value
  if (!drag || drag.panel !== 'backpack' || !grid)
    return
  const cell = gridPointerToCell(event)
  if (!cell)
    return
  const canFit = gridCanFit(drag.uid, cell.x, cell.y, drag.w, drag.h)
  gridHover.value = { x: cell.x, y: cell.y, w: drag.w, h: drag.h, canFit }
}

function onGridPointerUp(event) {
  const drag = gridDrag.value
  const grid = gridState.value
  if (!drag || drag.panel !== 'backpack' || !grid)
    return
  const cell = gridPointerToCell(event)
  const isOutside = !cell || cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows
  if (!isOutside && gridCanFit(drag.uid, cell.x, cell.y, drag.w, drag.h)) {
    const item = gridFindItem(drag.uid)
    if (item) {
      item.x = cell.x
      item.y = cell.y
      item.w = drag.w
      item.h = drag.h
      item.rotated = drag.rotated
      gridRecomputeCells(grid)
      emitter.emit('inventory:grid_place', { uid: item.uid, x: item.x, y: item.y, rotated: !!item.rotated })
    }
  }
  else if (isOutside) {
    if (inventoryPanel.value === 'warehouse' && warehouseGridPointerEl.value) {
      const rect = warehouseGridPointerEl.value.getBoundingClientRect()
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (inside) {
        const item = gridFindItem(drag.uid)
        if (item)
          transferItem('backpack', 'warehouse', item.itemId, 1)
        gridDrag.value = null
        gridHover.value = null
        return
      }
    }
    openDiscardConfirmByUid(drag.uid)
  }
  gridDrag.value = null
  gridHover.value = null
}

function onWarehouseItemPointerDown(event, uid) {
  if (!warehouseGridState.value)
    return
  const item = warehouseFindItem(uid)
  if (!item)
    return
  inventorySelected.value = { uid: item.uid, itemId: item.itemId, count: item.count, metaIndex: item.metaIndex ?? null }
  gridDrag.value = {
    panel: 'warehouse',
    uid,
    startX: item.x,
    startY: item.y,
    w: item.w,
    h: item.h,
    rotated: !!item.rotated,
  }
  warehouseHover.value = null
  if (event.pointerId !== undefined)
    warehouseGridPointerEl.value?.setPointerCapture?.(event.pointerId)
  event.stopPropagation()
  event.preventDefault()
}

function onWarehousePointerMove(event) {
  const drag = gridDrag.value
  const grid = warehouseGridState.value
  if (!drag || drag.panel !== 'warehouse' || !grid)
    return
  const cell = gridPointerToCell(event)
  if (!cell)
    return
  const canFit = warehouseCanFit(drag.uid, cell.x, cell.y, drag.w, drag.h)
  warehouseHover.value = { x: cell.x, y: cell.y, w: drag.w, h: drag.h, canFit }
}

function onWarehousePointerUp(event) {
  const drag = gridDrag.value
  const grid = warehouseGridState.value
  if (!drag || drag.panel !== 'warehouse' || !grid)
    return
  const cell = gridPointerToCell(event)
  const isOutside = !cell || cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows
  if (!isOutside && warehouseCanFit(drag.uid, cell.x, cell.y, drag.w, drag.h)) {
    const item = warehouseFindItem(drag.uid)
    if (item) {
      item.x = cell.x
      item.y = cell.y
      item.w = drag.w
      item.h = drag.h
      item.rotated = drag.rotated
      gridRecomputeCells(grid)
      emitter.emit('inventory:warehouse_grid_place', { uid: item.uid, x: item.x, y: item.y, rotated: !!item.rotated, page: warehousePage.value })
    }
  }
  else if (isOutside) {
    if (backpackGridPointerEl.value) {
      const rect = backpackGridPointerEl.value.getBoundingClientRect()
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (inside) {
        const item = warehouseFindItem(drag.uid)
        if (item)
          transferItem('warehouse', 'backpack', item.itemId, 1)
        gridDrag.value = null
        warehouseHover.value = null
        return
      }
    }
  }
  gridDrag.value = null
  warehouseHover.value = null
}

function rotateDraggedGridItem() {
  const drag = gridDrag.value
  if (!drag)
    return
  const nextW = drag.h
  const nextH = drag.w
  drag.w = nextW
  drag.h = nextH
  drag.rotated = !drag.rotated
}

function gridItemBaseIconSrc(itemId) {
  const raw = String(itemId || '')
  const id = raw.replace(/\.(gltf|glb)$/i, '')
  if (id === 'coin')
    return '/img/icons/coin.jpg'
  if (id === 'crystal_small')
    return '/img/icons/crystal_small.jpg'
  if (id === 'crystal_big')
    return '/img/icons/crystal_big.jpg'
  if (id === 'material_gun')
    return '/img/icons/material_gun.jpg'
  if (id === 'pet_potion')
    return '/img/icons/Potion2_Filled.jpg'
  if (id === 'Fence_Center')
    return '/img/icons/Fence_Center.jpg'
  if (id === 'Fence_Corner')
    return '/img/icons/Fence_Corner.jpg'
  if (id.startsWith('key_'))
    return `/img/icons/${id}.jpg`
  if (id.startsWith('canister_'))
    return `/img/icons/${id}.png`
  if (id.startsWith('Axe_'))
    return '/img/icons/Axe.jpg'
  if (id === 'Pickaxe_Wood' || id.startsWith('Pickaxe_'))
    return '/img/icons/Pickaxe.jpg'
  if (id.startsWith('Shovel_'))
    return '/img/icons/Shovel.jpg'
  if (id.startsWith('Sword_'))
    return '/img/icons/Sword.jpg'
  return null
}

function avatarIconSrcForResourceKey(resourceKey) {
  const key = String(resourceKey || '')
  const map = {
    animal_cat: 'cat.jpg',
    animal_chicken: 'chicken.jpg',
    animal_dog: 'dog.jpg',
    animal_horse: 'horse.jpg',
    animal_pig: 'pig.jpg',
    animal_sheep: 'sheep.jpg',
    animal_wolf: 'wolf.jpg',
  }
  const filename = map[key]
  if (filename)
    return `/img/icons/${filename}`
  if (key.startsWith('enemy_')) {
    const base = key.slice('enemy_'.length)
    const allow = new Set([
      'tribal',
      'orc',
      'giant',
      'yeti',
      'yeti2',
      'cactoro',
      'dino',
      'frog',
      'monkroose',
      'ninja',
      'mushroomking',
      'skeleton',
      'orc_skull',
      'skeleton_armor',
      'zombie',
      'demon',
    ])
    if (allow.has(base))
      return `/img/icons/${base}.jpg`
  }
  return null
}

function gridItemCanisterMeta(item) {
  const it = item && typeof item === 'object' ? item : null
  const itemId = it?.itemId ? String(it.itemId) : ''
  if (!itemId.startsWith('canister_'))
    return null

  const index = Number.isFinite(Number(it?.metaIndex)) ? Math.max(0, Math.floor(Number(it.metaIndex))) : null
  if (index === null)
    return null
  const metaList = inventoryCanisterMeta.value?.[itemId]
  return Array.isArray(metaList) ? (metaList[index] || null) : null
}

function gridItemAvatarSrc(item) {
  const meta = gridItemCanisterMeta(item)
  const resourceKey = meta?.capturedResourceKey ? String(meta.capturedResourceKey) : ''
  return resourceKey ? avatarIconSrcForResourceKey(resourceKey) : null
}

function gridItemIsExhausted(item) {
  const meta = gridItemCanisterMeta(item)
  return !!meta?.exhausted
}

onMounted(() => {
  if (!threeCanvas.value) {
    console.error('Three.js canvas not found!')
    return
  }

  loadVisitedPortals()
  experience = new Experience(threeCanvas.value)
  emitter.on('portal:prompt', onPortalPrompt)
  emitter.on('portal:prompt_clear', onPortalPromptClear)
  emitter.on('interactable:prompt', onInteractablePrompt)
  emitter.on('interactable:prompt_clear', onInteractablePromptClear)
  emitter.on('interactable:open', onInteractableOpen)
  emitter.on('loading:show', onLoadingShow)
  emitter.on('loading:hide', onLoadingHide)
  emitter.on('loading:dungeon_mesh_ready', onDungeonMeshReady)
  emitter.on('dungeon:progress', onDungeonProgress)
  emitter.on('dungeon:progress_clear', onDungeonProgressClear)
  emitter.on('dungeon:timer', onDungeonTimer)
  emitter.on('ui:coords', onCoords)
  emitter.on('dungeon:toast', onDungeonToast)
  emitter.on('dungeon:toast_clear', onDungeonToastClear)
  emitter.on('mining:begin', onMiningBegin)
  emitter.on('mining:end', onMiningEnd)
  emitter.on('build:hud', onBuildHud)
  emitter.on('build:hud_clear', onBuildHudClear)
  emitter.on('shop:sell_mode', onShopSellMode)
  emitter.on('combat:lock', onCombatLock)
  emitter.on('combat:lock_clear', onCombatLockClear)
  emitter.on('dungeon:extraction_open', onExtractionOpen)
  emitter.on('dungeon:death_open', onDeathOpen)
  emitter.on('dungeon:death_close_ui', onDeathCloseUi)
  emitter.on('inventory:open', onInventoryOpen)
  emitter.on('inventory:close_ui', onInventoryCloseUi)
  emitter.on('inventory:update', onInventoryUpdate)
  emitter.on('chest:open', onChestOpen)
  emitter.on('chest:update', onChestUpdate)
  emitter.on('chest:close_ui', onChestCloseUi)
  emitter.on('portal:select_open', onPortalSelectOpen)
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  emitter.off('portal:prompt', onPortalPrompt)
  emitter.off('portal:prompt_clear', onPortalPromptClear)
  emitter.off('interactable:prompt', onInteractablePrompt)
  emitter.off('interactable:prompt_clear', onInteractablePromptClear)
  emitter.off('interactable:open', onInteractableOpen)
  emitter.off('loading:show', onLoadingShow)
  emitter.off('loading:hide', onLoadingHide)
  emitter.off('loading:dungeon_mesh_ready', onDungeonMeshReady)
  emitter.off('dungeon:progress', onDungeonProgress)
  emitter.off('dungeon:progress_clear', onDungeonProgressClear)
  emitter.off('dungeon:timer', onDungeonTimer)
  emitter.off('ui:coords', onCoords)
  emitter.off('dungeon:toast', onDungeonToast)
  emitter.off('dungeon:toast_clear', onDungeonToastClear)
  emitter.off('mining:begin', onMiningBegin)
  emitter.off('mining:end', onMiningEnd)
  emitter.off('build:hud', onBuildHud)
  emitter.off('build:hud_clear', onBuildHudClear)
  emitter.off('shop:sell_mode', onShopSellMode)
  emitter.off('combat:lock', onCombatLock)
  emitter.off('combat:lock_clear', onCombatLockClear)
  emitter.off('dungeon:extraction_open', onExtractionOpen)
  emitter.off('dungeon:death_open', onDeathOpen)
  emitter.off('dungeon:death_close_ui', onDeathCloseUi)
  emitter.off('inventory:open', onInventoryOpen)
  emitter.off('inventory:close_ui', onInventoryCloseUi)
  emitter.off('inventory:update', onInventoryUpdate)
  emitter.off('chest:open', onChestOpen)
  emitter.off('chest:update', onChestUpdate)
  emitter.off('chest:close_ui', onChestCloseUi)
  emitter.off('portal:select_open', onPortalSelectOpen)
  onDungeonToastClear()
  onMiningEnd()
  onBuildHudClear()
  window.removeEventListener('keydown', onKeyDown)
  experience?.destroy()
  experience = null
})
</script>

<template>
  <div class="relative w-screen h-screen">
    <!-- three.js 渲染的 canvas -->
    <canvas ref="threeCanvas" class="three-canvas absolute inset-0 z-0" />
    <!-- 准星（仅在 Pointer Lock 激活时显示） -->
    <Crosshair />
    <!-- 小地图 (z-index: 1000) -->
    <MiniMap />
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !inventoryPanel && !loadingState && !extractionModal && !deathModal && dungeonTimer"
      class="pointer-events-none absolute left-1/2 top-4 z-[1900] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-2xl border border-white/25 bg-red-600/25 px-6 py-3 text-center text-2xl font-extrabold tracking-widest text-white shadow-2xl backdrop-blur-md">
        {{ formatDungeonClock(dungeonTimer.remainingMs) }}
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !inventoryPanel && !loadingState && !extractionModal && !deathModal && !dungeonTimer && buildHud"
      class="absolute left-1/2 top-4 z-[1900] -translate-x-1/2 px-4"
    >
      <button
        class="mx-auto w-fit rounded-2xl border border-white/25 bg-red-600/25 px-6 py-3 text-center text-2xl font-extrabold tracking-widest text-white shadow-2xl backdrop-blur-md hover:bg-red-600/35"
        @click="exitBuildMode"
      >
        退出建筑模式
      </button>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !inventoryPanel && !loadingState && !extractionModal && !deathModal && miningProgress"
      class="pointer-events-none absolute left-1/2 top-6 z-[1850] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-[320px] rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-white shadow-xl backdrop-blur-md">
        <div class="text-center text-sm font-bold tracking-wide">
          {{ miningProgress.label }}
        </div>
        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
          <div class="h-full bg-emerald-400/80" :style="{ width: `${Math.round(miningPct * 100)}%` }" />
        </div>
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !inventoryPanel && !loadingState && !extractionModal && !deathModal && buildHud"
      class="pointer-events-none absolute left-1/2 top-[5.25rem] z-[1820] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-2xl border border-white/20 bg-black/35 px-5 py-3 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ itemLabel(buildHud.itemId) }} · {{ buildHud.mode === 'add' ? '建造' : '拆卸' }} · {{ (Number(buildHud.rotationIndex) || 0) * 90 }}°<span class="opacity-90"> · {{ buildHud.hint }}</span>
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && dungeonProgress && !dungeonTimer"
      class="pointer-events-none absolute left-1/2 top-6 z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-white/15 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ dungeonProgress.name }}地牢 · 已阅读 {{ dungeonProgress.read }}/{{ dungeonProgress.total }}<span v-if="dungeonProgress.canQuickReturn"> · 按 R 快速返回</span>
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && dungeonToast"
      class="pointer-events-none absolute left-1/2 top-[3.75rem] z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-black/35 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ dungeonToast.text }}
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && lockState"
      class="pointer-events-none absolute left-1/2 top-24 z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-black/35 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ lockState.title }} · {{ lockState.hint }}
      </div>
    </div>
    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && (interactablePrompt || portalPrompt)"
      class="pointer-events-none fixed left-1/2 top-[15vh] z-[9000] w-full max-w-[90vw] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-xl border border-white/20 bg-white/15 px-6 py-4 text-center text-white shadow-xl backdrop-blur-md">
        <div class="text-lg font-bold drop-shadow-md">
          {{ (interactablePrompt || portalPrompt).title }}
        </div>
        <div class="mt-1 text-base font-medium opacity-95 drop-shadow-md">
          {{ (interactablePrompt || portalPrompt).hint }}
        </div>
      </div>
    </div>

    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState"
      class="pointer-events-none fixed right-6 top-6 z-[9000] w-[260px]"
    >
      <div v-if="coords" class="mb-3 rounded-2xl border border-white/15 bg-black/40 px-5 py-3 text-xs text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-bold text-white/90">
            坐标
          </div>
          <div class="text-[10px] opacity-70">
            XYZ
          </div>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2 font-semibold">
          <div class="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-center">
            X {{ formatCoord(coords.x) }}
          </div>
          <div class="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-center">
            Y {{ formatCoord(coords.y) }}
          </div>
          <div class="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-center">
            Z {{ formatCoord(coords.z) }}
          </div>
        </div>
      </div>
      <div class="rounded-2xl border border-white/15 bg-black/40 px-5 py-4 text-xs text-white shadow-2xl backdrop-blur-md">
        <div class="mb-3 text-sm font-bold text-white/90 border-b border-white/10 pb-2">
          操作说明
        </div>
        <div class="space-y-2 font-medium opacity-90">
          <div class="flex justify-between">
            <span>WASD</span> <span>移动</span>
          </div>
          <div class="flex justify-between">
            <span>Shift</span> <span>加速跑</span>
          </div>
          <div class="flex justify-between">
            <span>空格</span> <span>跳跃</span>
          </div>
          <div class="flex justify-between">
            <span>Z / X</span> <span>打击 (直拳/勾拳)</span>
          </div>
          <div class="flex justify-between">
            <span>C</span> <span>格挡</span>
          </div>
          <div class="flex justify-between">
            <span>E</span> <span>交互</span>
          </div>
          <div class="flex justify-between">
            <span>中键</span> <span>锁定目标</span>
          </div>
          <div class="flex justify-between">
            <span>Tab</span> <span>切换镜头左右</span>
          </div>
          <div class="flex justify-between">
            <span>F</span> <span>抓取 / 放下灵兽</span>
          </div>
          <div class="flex justify-between">
            <span>右键</span> <span>投掷灵兽</span>
          </div>
          <div class="flex justify-between">
            <span>1-0</span> <span>快捷栏（灵兽 / 建造 / 装备灵兽石）</span>
          </div>
          <div class="flex justify-between">
            <span>B</span> <span>背包</span>
          </div>
          <div class="flex justify-between">
            <span>ESC</span> <span>关闭界面</span>
          </div>
          <div v-if="buildHud" class="flex justify-between">
            <span>R</span> <span>旋转（建造）</span>
          </div>
          <div v-if="buildHud" class="flex justify-between">
            <span>T</span> <span>切换建造 / 拆卸</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="extractionModal && !interactableModal && !chestModal && !loadingState"
      class="absolute inset-0 z-[9400] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="closeExtractionModal"
    >
      <div class="w-full max-w-[720px] rounded-2xl border border-white/20 bg-white/15 p-6 text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-lg font-semibold drop-shadow">
              撤离结算 · {{ extractionModal.dungeonName || '地牢' }}
            </div>
            <div class="mt-1 text-sm opacity-85">
              选择“撤离”将带回收益；选择“重来”会清零本次收益并重置地牢。
            </div>
          </div>
          <button
            class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
            @click="closeExtractionModal"
          >
            继续探索 (ESC)
          </button>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="text-xs opacity-80">
              击杀数
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ extractionModal.kills || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="text-xs opacity-80">
              获取道具数
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ extractionModal.lootCount || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="text-xs opacity-80">
              未拾取掉落
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ extractionModal.unpickedDrops || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="text-xs opacity-80">
              未读线索
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ extractionModal.notesRemaining || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="text-xs opacity-80">
              未击杀 Boss
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ extractionModal.bossAlive || 0 }}
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            class="rounded-xl border border-white/20 bg-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
            @click="chooseExtractionAction('restart')"
          >
            重来（清零）
          </button>
          <button
            class="rounded-xl border border-white/20 bg-green-500/35 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500/45"
            @click="chooseExtractionAction('extract')"
          >
            撤离（带回收益）
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="deathModal && !loadingState"
      class="absolute inset-0 z-[9600] flex items-center justify-center bg-black/90 px-4"
    >
      <div class="w-full max-w-[720px] rounded-2xl border border-white/15 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-md">
        <div class="text-3xl font-extrabold tracking-widest text-white">
          你死了
        </div>
        <div class="mt-2 text-sm opacity-80">
          结算将在你选择重生方式后继续。
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div class="text-xs opacity-80">
              击杀数
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ deathModal.kills || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div class="text-xs opacity-80">
              获取道具数
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ deathModal.lootCount || 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div class="text-xs opacity-80">
              未击杀 Boss
            </div>
            <div class="mt-1 text-2xl font-extrabold">
              {{ deathModal.bossAlive || 0 }}
            </div>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            v-if="deathModal.reviveItemId"
            class="rounded-xl border border-white/20 bg-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
            @click="chooseDeathAction('respawn_noloss')"
          >
            无损重生（消耗灵勾玉）
          </button>
          <button
            class="rounded-xl border border-white/20 bg-red-500/35 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500/45"
            @click="chooseDeathAction('respawn_lossy')"
          >
            重生（丢失背包）
          </button>
          <button
            class="rounded-xl border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
            @click="chooseDeathAction('restart')"
          >
            重来（清零）
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="portalSelectModal && !interactableModal && !chestModal && !loadingState && !inventoryPanel"
      class="absolute inset-0 z-[9500] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      @click.self="closePortalSelectModal"
    >
      <div class="w-full max-w-[520px] rounded-2xl border border-white/20 bg-white/15 p-5 text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-start justify-between gap-4">
          <div class="text-lg font-semibold drop-shadow">
            {{ portalSelectModal.title || '选择地牢' }}
          </div>
          <button
            class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
            @click="closePortalSelectModal"
          >
            关闭 (ESC)
          </button>
        </div>
        <div class="mt-4 space-y-2">
          <button
            v-for="opt in (portalSelectModal.options || [])"
            :key="`dsel:${opt.id}`"
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-black/35 disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!!opt.locked"
            @click="chooseDungeon(opt.id)"
          >
            <span class="truncate">
              {{ opt.name }}
              <span v-if="opt.locked" class="ml-2 text-xs font-bold opacity-90">（未解锁）</span>
            </span>
            <span class="shrink-0 text-xs opacity-85">
              <span v-if="opt.completed">已完成</span>
              <span v-else-if="(opt.total || 0) > 0">{{ opt.read || 0 }}/{{ opt.total || 0 }}</span>
              <span v-else />
            </span>
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="interactableModal"
      class="absolute inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      @click.self="closeInteractableModal"
    >
      <div class="w-full max-w-[560px] rounded-2xl border border-white/20 bg-white/15 p-5 text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-start justify-between gap-4">
          <div class="text-lg font-semibold drop-shadow">
            {{ interactableModal.title }}
          </div>
          <button
            class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
            @click="closeInteractableModal"
          >
            关闭 (ESC/E)
          </button>
        </div>
        <div class="mt-3 text-sm leading-relaxed opacity-95 drop-shadow">
          {{ interactableModal.description }}
        </div>
        <div v-if="interactableModal.actions && interactableModal.actions.length" class="mt-4 flex flex-wrap gap-3">
          <button
            v-for="action in interactableModal.actions"
            :key="action.id"
            class="rounded-xl border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
            @click="triggerInteractableAction(action.id)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="chestModal && !interactableModal && !loadingState"
      class="absolute inset-0 z-[10500] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      @click.self="closeChestModal"
    >
      <div class="w-full max-w-[860px] rounded-2xl border border-white/20 bg-white/15 p-5 text-white shadow-2xl backdrop-blur-md">
        <div class="flex items-start justify-between gap-4">
          <div class="text-lg font-semibold drop-shadow">
            {{ chestModal.title }}
          </div>
          <button
            class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
            @click="closeChestModal"
          >
            关闭 (ESC)
          </button>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-bold text-white/90">
                背包钥匙
              </div>
            </div>
            <div v-if="chestKeyEntries().length === 0" class="text-sm opacity-80">
              空
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="row in chestKeyEntries()"
                :key="`ck:${row.id}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold">
                    {{ itemLabel(row.id) }}
                  </div>
                  <div class="text-xs opacity-80">
                    x{{ row.count }}
                  </div>
                </div>
                <button
                  class="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
                  :disabled="chestModal.unlocked || row.id !== chestModal.requiredKeyId"
                  @click="useChestKey(row.id)"
                >
                  {{ chestModal.unlocked ? '已解锁' : '使用' }}
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-bold text-white/90">
                宝箱
              </div>
              <div v-if="!chestModal.unlocked" class="text-xs opacity-85">
                需要：{{ itemLabel(chestModal.requiredKeyId) }}
              </div>
            </div>
            <div v-if="!chestModal.unlocked" class="text-sm opacity-80">
              使用对应钥匙解锁后可查看内容
            </div>
            <div v-else-if="!chestModal.loot || chestModal.loot.length === 0" class="text-sm opacity-80">
              空
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="row in chestModal.loot"
                :key="`cl:${row.id}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold">
                    {{ itemLabel(row.id) }}
                  </div>
                  <div class="text-xs opacity-80">
                    x{{ row.count }}
                  </div>
                </div>
                <button
                  class="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                  @click="takeChestItem(row.id, 1)"
                >
                  拾取
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="inventoryPanel && !interactableModal && !chestModal && !loadingState"
      class="absolute inset-0 z-[11000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      @click.self="closeInventoryPanel"
    >
      <div class="relative w-full max-w-[860px] rounded-2xl border border-white/20 bg-white/15 p-5 text-white shadow-2xl backdrop-blur-md">
        <div
          v-if="sellConfirm"
          class="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 px-4 backdrop-blur-sm"
          @click.self="cancelSell"
        >
          <div class="w-full max-w-[520px] rounded-2xl border border-white/20 bg-white/15 p-4 shadow-2xl backdrop-blur-md">
            <div class="text-sm font-bold text-white/90">
              卖出道具？
            </div>
            <div class="mt-2 text-sm opacity-90">
              {{ itemLabel(sellConfirm.itemId) }}
            </div>
            <div class="mt-2 text-xs opacity-80">
              卖出价：{{ Math.max(0, Math.floor(Number(sellConfirm.price) || 0)) }} Gold<span v-if="sellConfirm.reason">（{{ sellConfirm.reason }}）</span>
            </div>
            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
                @click="cancelSell"
              >
                退出
              </button>
              <button
                class="rounded-lg border border-amber-300/30 bg-amber-500/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500/25 disabled:opacity-40"
                :disabled="!(sellConfirm.price > 0)"
                @click="confirmSell"
              >
                卖出
              </button>
            </div>
          </div>
        </div>
        <div
          v-if="discardConfirm"
          class="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 px-4 backdrop-blur-sm"
          @click.self="cancelDiscard"
        >
          <div class="w-full max-w-[520px] rounded-2xl border border-white/20 bg-white/15 p-4 shadow-2xl backdrop-blur-md">
            <div class="text-sm font-bold text-white/90">
              丢弃道具？
            </div>
            <div class="mt-2 text-sm opacity-90">
              {{ itemLabel(discardConfirm.itemId) }} x{{ discardConfirm.amount }}
            </div>
            <div class="mt-3 text-xs opacity-75">
              丢弃后会掉落在地面，可再次拾取。
            </div>
            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
                @click="cancelDiscard"
              >
                取消
              </button>
              <button
                class="rounded-lg border border-rose-300/30 bg-rose-500/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-500/25"
                @click="confirmDiscard"
              >
                丢弃
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="rechargeConfirm"
          class="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-black/60 px-4 backdrop-blur-sm"
          @click.self="cancelRecharge"
        >
          <div class="w-full max-w-[520px] rounded-2xl border border-white/20 bg-white/15 p-4 shadow-2xl backdrop-blur-md">
            <div class="text-sm font-bold text-white/90">
              灵宠精疲力竭
            </div>
            <div class="mt-2 text-sm opacity-90">
              该收容罐处于“精疲力竭”状态，需要消耗 1 个灵兽补充剂充能后才能再次投掷。
            </div>
            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
                @click="cancelRecharge"
              >
                否
              </button>
              <button
                class="rounded-lg border border-emerald-300/30 bg-emerald-500/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500/25"
                @click="confirmRecharge"
              >
                是，消耗 1 灵兽补充剂
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-start justify-between gap-4">
          <div class="text-lg font-semibold drop-shadow">
            {{ inventoryPanel === 'warehouse' ? '仓库' : '背包' }}
          </div>
          <button
            class="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/40"
            @click="closeInventoryPanel"
          >
            关闭 (ESC/B)
          </button>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4" :class="inventoryPanel === 'warehouse' ? 'md:grid-cols-2' : ''">
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-bold text-white/90">
                背包
              </div>
            </div>
            <div v-if="gridState" class="flex flex-col gap-3">
              <div class="text-xs opacity-80">
                拖拽摆放 · 拖拽中按 R 旋转
              </div>
              <div
                class="relative rounded-xl border border-white/10 bg-black/35 p-3"
                :style="{ width: `${gridState.cols * gridCellPx + 24}px` }"
              >
                <div
                  ref="backpackGridPointerEl"
                  class="relative"
                  :style="{ width: `${gridState.cols * gridCellPx}px`, height: `${gridState.rows * gridCellPx}px` }"
                  @pointermove="onGridPointerMove"
                  @pointerup="onGridPointerUp"
                  @pointerleave="onGridPointerUp"
                >
                  <div
                    class="absolute inset-0 grid gap-[2px]"
                    :style="{
                      gridTemplateColumns: `repeat(${gridState.cols}, ${gridCellPx - 2}px)`,
                      gridTemplateRows: `repeat(${gridState.rows}, ${gridCellPx - 2}px)`,
                    }"
                  >
                    <div
                      v-for="i in (gridState.cols * gridState.rows)"
                      :key="`cell:${i}`"
                      class="rounded-md border"
                      :class="gridCellActive(i) ? 'border-white/5 bg-white/5' : 'border-transparent bg-transparent'"
                    />
                  </div>

                  <div
                    v-if="gridHover"
                    class="absolute rounded-lg border-2"
                    :class="gridHover.canFit ? 'border-emerald-400/80 bg-emerald-400/15' : 'border-rose-400/80 bg-rose-400/15'"
                    :style="{
                      left: `${gridHover.x * gridCellPx}px`,
                      top: `${gridHover.y * gridCellPx}px`,
                      width: `${gridHover.w * gridCellPx}px`,
                      height: `${gridHover.h * gridCellPx}px`,
                    }"
                  />

                  <button
                    v-for="it in (gridState.items || [])"
                    :key="`gi:${it.uid}`"
                    class="absolute flex items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/10 text-center text-[11px] font-semibold text-white hover:bg-white/15"
                    :style="{
                      left: `${it.x * gridCellPx}px`,
                      top: `${it.y * gridCellPx}px`,
                      width: `${it.w * gridCellPx}px`,
                      height: `${it.h * gridCellPx}px`,
                      opacity: gridDrag && gridDrag.uid === it.uid ? 0.65 : 1,
                    }"
                    @pointerdown="(e) => onGridItemPointerDown(e, it.uid)"
                  >
                    <div class="relative h-full w-full">
                      <div
                        v-if="Number(it.count) > 1"
                        class="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/90"
                      >
                        x{{ it.count }}
                      </div>
                      <div
                        v-if="String(it.itemId || '').startsWith('canister_')"
                        class="relative h-full w-full"
                        :class="gridItemIsExhausted(it) ? 'opacity-60 grayscale' : 'opacity-95'"
                      >
                        <img
                          class="absolute inset-0 h-full w-full object-contain p-1"
                          :src="gridItemBaseIconSrc(it.itemId)"
                          alt="item"
                        >
                        <img
                          v-if="gridItemAvatarSrc(it)"
                          class="absolute right-1 top-1 h-6 w-6 rounded border border-black/40 object-cover"
                          :src="gridItemAvatarSrc(it)"
                          alt="avatar"
                        >
                      </div>
                      <img
                        v-else-if="gridItemBaseIconSrc(it.itemId)"
                        class="h-full w-full opacity-95 object-contain p-2"
                        :src="gridItemBaseIconSrc(it.itemId)"
                        alt="item"
                      >
                      <span v-else class="absolute inset-x-2 bottom-1 truncate">
                        {{ itemLabel(it.itemId) }}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div class="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-sm font-bold text-white/90">
                    说明
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      v-if="inventorySelected?.itemId === 'material_gun'"
                      class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                      @click="equipItem('material_gun')"
                    >
                      装备/收起
                    </button>
                    <button
                      v-if="inventorySelected?.itemId && inventorySelected.itemId.startsWith('canister_')"
                      class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                      @click="equipSelectedCanister"
                    >
                      装备/抱起
                    </button>
                    <button
                      v-if="inventoryPanel === 'warehouse' && inventorySelected?.itemId"
                      class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                      @click="transferItem('backpack', 'warehouse', inventorySelected.itemId, 1)"
                    >
                      存入
                    </button>
                    <button
                      :disabled="!inventorySelected?.uid"
                      class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
                      @click="requestDropSelected"
                    >
                      丢弃
                    </button>
                  </div>
                </div>
                <div v-if="inventorySelected?.itemId" class="mt-2">
                  <div class="text-sm font-semibold">
                    {{ itemLabel(inventorySelected.itemId) }} <span class="text-xs opacity-80">x{{ Math.max(1, Math.floor(Number(inventorySelected.count) || 1)) }}</span>
                  </div>
                  <div class="mt-1 text-xs opacity-80">
                    {{ itemDescription(inventorySelected.itemId) }}
                  </div>
                </div>
                <div v-else class="mt-2 text-sm opacity-80">
                  点击选中一个道具以查看说明
                </div>
              </div>
            </div>
            <div v-else-if="bagEntries(inventoryData.backpack).length === 0" class="text-sm opacity-80">
              空
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="row in bagEntries(inventoryData.backpack)"
                :key="`bp:${row.id}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold">
                    {{ itemLabel(row.id) }}
                  </div>
                  <div class="text-xs opacity-80">
                    x{{ row.count }}
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <button
                    v-if="row.id === 'material_gun'"
                    class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                    @click="equipItem(row.id)"
                  >
                    装备/收起
                  </button>
                  <button
                    v-if="inventoryPanel === 'warehouse'"
                    class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                    @click="transferItem('backpack', 'warehouse', row.id, 1)"
                  >
                    存入
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="inventoryPanel === 'warehouse'" class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-2 flex items-center justify-between gap-3">
              <div class="text-sm font-bold text-white/90">
                仓库 · 第 {{ warehousePage }} 页
              </div>
              <div class="flex items-center gap-1">
                <button
                  v-for="p in warehousePagesTotal"
                  :key="`whp:${p}`"
                  class="rounded-lg border px-2 py-1 text-[11px] font-bold"
                  :class="p === warehousePage ? 'border-white/30 bg-white/15' : (p <= warehousePagesUnlocked ? 'border-white/15 bg-white/10 hover:bg-white/15' : 'border-white/10 bg-white/5 opacity-60')"
                  :disabled="p > warehousePagesUnlocked"
                  @click="setWarehousePage(p)"
                >
                  <span v-if="p <= warehousePagesUnlocked">{{ p }}</span>
                  <span v-else>锁 {{ p }}</span>
                </button>
              </div>
            </div>
            <div class="mb-3 text-xs opacity-70">
              默认解锁 1-{{ warehousePagesUnlocked }} 页；第 3-5 页锁定，后续可继续解锁
            </div>

            <div v-if="warehouseGridState" class="mb-4">
              <div
                class="relative rounded-xl border border-white/10 bg-black/35 p-3"
                :style="{ width: `${warehouseGridState.cols * gridCellPx + 24}px` }"
              >
                <div
                  ref="warehouseGridPointerEl"
                  class="relative"
                  :style="{ width: `${warehouseGridState.cols * gridCellPx}px`, height: `${warehouseGridState.rows * gridCellPx}px` }"
                  @pointermove="onWarehousePointerMove"
                  @pointerup="onWarehousePointerUp"
                  @pointerleave="onWarehousePointerUp"
                >
                  <div
                    class="absolute inset-0 grid gap-[2px]"
                    :style="{
                      gridTemplateColumns: `repeat(${warehouseGridState.cols}, ${gridCellPx - 2}px)`,
                      gridTemplateRows: `repeat(${warehouseGridState.rows}, ${gridCellPx - 2}px)`,
                    }"
                  >
                    <div
                      v-for="i in (warehouseGridState.cols * warehouseGridState.rows)"
                      :key="`whcell:${i}`"
                      class="rounded-md border"
                      :class="gridCellActiveBy(warehouseGridState, i) ? 'border-white/5 bg-white/5' : 'border-transparent bg-transparent'"
                    />
                  </div>

                  <div
                    v-if="warehouseHover"
                    class="absolute rounded-lg border-2"
                    :class="warehouseHover.canFit ? 'border-emerald-400/80 bg-emerald-400/15' : 'border-rose-400/80 bg-rose-400/15'"
                    :style="{
                      left: `${warehouseHover.x * gridCellPx}px`,
                      top: `${warehouseHover.y * gridCellPx}px`,
                      width: `${warehouseHover.w * gridCellPx}px`,
                      height: `${warehouseHover.h * gridCellPx}px`,
                    }"
                  />

                  <div
                    v-for="it in (warehouseGridState.items || [])"
                    :key="`whgi:${it.uid}`"
                    class="absolute flex items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/10 text-center text-[11px] font-semibold text-white hover:bg-white/15"
                    :style="{
                      left: `${it.x * gridCellPx}px`,
                      top: `${it.y * gridCellPx}px`,
                      width: `${it.w * gridCellPx}px`,
                      height: `${it.h * gridCellPx}px`,
                      opacity: gridDrag && gridDrag.uid === it.uid ? 0.65 : 1,
                    }"
                    @pointerdown="(e) => onWarehouseItemPointerDown(e, it.uid)"
                  >
                    <div class="relative h-full w-full">
                      <div
                        v-if="Number(it.count) > 1"
                        class="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/90"
                      >
                        x{{ it.count }}
                      </div>
                      <div
                        v-if="String(it.itemId || '').startsWith('canister_')"
                        class="relative h-full w-full"
                        :class="gridItemIsExhausted(it) ? 'opacity-60 grayscale' : 'opacity-95'"
                      >
                        <img
                          class="absolute inset-0 h-full w-full object-contain p-1"
                          :src="gridItemBaseIconSrc(it.itemId)"
                          alt="item"
                        >
                        <img
                          v-if="gridItemAvatarSrc(it)"
                          class="absolute right-1 top-1 h-6 w-6 rounded border border-black/40 object-cover"
                          :src="gridItemAvatarSrc(it)"
                          alt="avatar"
                        >
                      </div>
                      <img
                        v-else-if="gridItemBaseIconSrc(it.itemId)"
                        class="h-full w-full opacity-95 object-contain p-2"
                        :src="gridItemBaseIconSrc(it.itemId)"
                        alt="item"
                      >
                      <span v-else class="absolute inset-x-2 bottom-1 truncate">
                        {{ itemLabel(it.itemId) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="bagEntries(inventoryData.warehouse).length === 0" class="text-sm opacity-80">
              空
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="row in bagEntries(inventoryData.warehouse)"
                :key="`wh:${row.id}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold">
                    {{ itemLabel(row.id) }}
                  </div>
                  <div class="text-xs opacity-80">
                    x{{ row.count }}
                  </div>
                </div>
                <button
                  class="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                  @click="transferItem('warehouse', 'backpack', row.id, 1)"
                >
                  取出
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && !inventoryPanel"
      class="fixed bottom-6 right-6 z-[9200] flex items-center gap-2"
    >
      <div class="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 text-white shadow-xl backdrop-blur-md">
        <button
          v-for="(slot, i) in quickHudSlots"
          :key="`qhud:${i}:${slot?.kind || 'none'}:${slot?.entry?.uid || slot?.itemId || 'empty'}:${slot?.entry?.metaIndex ?? -1}`"
          class="relative h-12 w-12 rounded-xl border border-white/15 bg-white/10 p-1 hover:bg-white/15 disabled:opacity-40"
          :disabled="!slot?.enabled"
          @click="slot?.kind === 'weapon' ? triggerQuickHotkey('1') : (slot?.kind === 'canister' ? quickCanisterPick(slot.entry) : (slot?.kind === 'build' ? equipItem(slot.itemId) : null))"
        >
          <div class="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/90">
            {{ quickHudKeys[i] }}
          </div>
          <img
            v-if="slot?.kind === 'weapon' && slot?.iconSrc"
            class="h-full w-full rounded-lg border border-black/40 object-contain"
            :src="slot.iconSrc"
            alt="weapon"
          >
          <img
            v-else-if="slot?.kind === 'canister' && slot?.entry?.avatarSrc"
            class="h-full w-full rounded-lg border border-black/40 object-cover"
            :class="slot.entry.exhausted ? 'opacity-60 grayscale' : ''"
            :src="slot.entry.avatarSrc"
            alt="pet"
          >
          <img
            v-else-if="slot?.kind === 'build' && slot?.iconSrc"
            class="h-full w-full rounded-lg border border-black/40 object-contain p-1"
            :src="slot.iconSrc"
            alt="build"
          >
          <div
            v-else
            class="flex h-full w-full items-center justify-center rounded-lg border border-white/10 text-[10px] font-semibold"
            :class="slot?.entry?.exhausted ? 'opacity-60 grayscale' : 'opacity-80'"
          >
            {{ slot?.kind === 'weapon' ? '灵兽石' : (slot?.kind === 'build' ? itemLabel(slot.itemId) : (slot?.entry ? itemLabel(slot.entry.itemId) : '')) }}
          </div>
        </button>
      </div>
    </div>

    <StoryModal />
    <PlayerHUD />
    <GameCTA />
  </div>
</template>

<style scoped>
.three-canvas {
  width: 100vw;
  height: 100vh;
  display: block;
}
</style>
