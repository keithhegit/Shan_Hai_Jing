<script setup>
import { onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
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
const lockState = ref(null)
const inventoryPanel = ref(null)
const inventoryData = ref({ panel: null, backpack: {}, warehouse: {} })
const backpackGrid = ref(null)
const gridState = ref(null)
const gridDrag = ref(null)
const gridHover = ref(null)
const gridCellPx = 42
const warehousePage = ref(1)
const warehousePagesUnlocked = ref(2)
const warehousePagesTotal = ref(5)
const warehouseGrid = ref(null)
const warehouseGridState = ref(null)
const chestModal = ref(null)
const portalSelectModal = ref(null)
const visitedPortals = new Set()
let lastLoadingPortalId = null

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

function onCombatLock(payload) {
  lockState.value = payload
}

function onCombatLockClear() {
  lockState.value = null
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
}

function onInventoryUpdate(payload) {
  inventoryData.value = payload || { panel: inventoryPanel.value, backpack: {}, warehouse: {} }
  if (payload?.panel)
    inventoryPanel.value = payload.panel
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

function equipItem(itemId) {
  if (!itemId)
    return
  emitter.emit('inventory:equip', { itemId })
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
  if (id === 'coin')
    return '金币'
  if (id === 'material_gun')
    return '物质枪'
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

function isKeyItem(id) {
  return String(id).startsWith('key_')
}

function chestKeyEntries() {
  return bagEntries(inventoryData.value?.backpack).filter(row => isKeyItem(row.id))
}

function onKeyDown(event) {
  const key = event.key?.toLowerCase?.() ?? event.key
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
  if (key === 'escape' || (key === 'e' && interactableModal.value))
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

function onGridItemPointerDown(event, uid) {
  if (!gridState.value)
    return
  const item = gridFindItem(uid)
  if (!item)
    return
  gridDrag.value = {
    uid,
    startX: item.x,
    startY: item.y,
    w: item.w,
    h: item.h,
    rotated: !!item.rotated,
  }
  gridHover.value = null
  event.stopPropagation()
  event.preventDefault()
}

function onGridPointerMove(event) {
  const drag = gridDrag.value
  const grid = gridState.value
  if (!drag || !grid)
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
  if (!drag || !grid)
    return
  const cell = gridPointerToCell(event)
  if (cell && gridCanFit(drag.uid, cell.x, cell.y, drag.w, drag.h)) {
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
  gridDrag.value = null
  gridHover.value = null
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

function gridIconKind(id) {
  const key = String(id || '')
  if (key === 'coin')
    return 'coin'
  if (key === 'material_gun')
    return 'gun'
  if (key.startsWith('key_'))
    return 'key'
  if (key.startsWith('canister_'))
    return 'canister'
  return null
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
  emitter.on('dungeon:toast', onDungeonToast)
  emitter.on('dungeon:toast_clear', onDungeonToastClear)
  emitter.on('combat:lock', onCombatLock)
  emitter.on('combat:lock_clear', onCombatLockClear)
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
  emitter.off('dungeon:toast', onDungeonToast)
  emitter.off('dungeon:toast_clear', onDungeonToastClear)
  emitter.off('combat:lock', onCombatLock)
  emitter.off('combat:lock_clear', onCombatLockClear)
  emitter.off('inventory:open', onInventoryOpen)
  emitter.off('inventory:close_ui', onInventoryCloseUi)
  emitter.off('inventory:update', onInventoryUpdate)
  emitter.off('chest:open', onChestOpen)
  emitter.off('chest:update', onChestUpdate)
  emitter.off('chest:close_ui', onChestCloseUi)
  emitter.off('portal:select_open', onPortalSelectOpen)
  onDungeonToastClear()
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
      v-if="!portalSelectModal && !interactableModal && !chestModal && !loadingState && dungeonProgress"
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
            <span>E</span> <span>交互 / 关闭文本</span>
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
            <span>B</span> <span>背包</span>
          </div>
          <div class="flex justify-between">
            <span>E</span> <span>交互 / 打开仓库</span>
          </div>
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
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-black/35"
            @click="chooseDungeon(opt.id)"
          >
            <span class="truncate">{{ opt.name }}</span>
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
      <div class="w-full max-w-[860px] rounded-2xl border border-white/20 bg-white/15 p-5 text-white shadow-2xl backdrop-blur-md">
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
                    class="absolute flex items-center justify-center rounded-lg border border-white/15 bg-white/10 px-2 text-center text-[11px] font-semibold text-white hover:bg-white/15"
                    :style="{
                      left: `${it.x * gridCellPx}px`,
                      top: `${it.y * gridCellPx}px`,
                      width: `${it.w * gridCellPx}px`,
                      height: `${it.h * gridCellPx}px`,
                      opacity: gridDrag && gridDrag.uid === it.uid ? 0.65 : 1,
                    }"
                    @pointerdown="(e) => onGridItemPointerDown(e, it.uid)"
                  >
                    <div class="relative flex w-full items-center gap-2 overflow-hidden">
                      <div
                        v-if="Number(it.count) > 1"
                        class="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/90"
                      >
                        x{{ it.count }}
                      </div>
                      <svg
                        v-if="gridIconKind(it.itemId) === 'coin'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                        <path d="M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'key'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M10 14a4 4 0 1 1 1.17-2.83L20 11v3h-2v2h-2v2h-3v-2.2l-1.83-.12A4 4 0 0 1 10 14Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'canister'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l1-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                        <path d="M9 9h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'gun'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M4 14h10l2-4h4v4h-2v2h-6v-2H4v-2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                      </svg>
                      <span class="min-w-0 truncate">
                        {{ itemLabel(it.itemId) }}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div v-if="bagEntries(inventoryData.backpack).length === 0" class="text-sm opacity-80">
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
                  class="relative"
                  :style="{ width: `${warehouseGridState.cols * gridCellPx}px`, height: `${warehouseGridState.rows * gridCellPx}px` }"
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
                    v-for="it in (warehouseGridState.items || [])"
                    :key="`whgi:${it.uid}`"
                    class="pointer-events-none absolute flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-center text-[11px] font-semibold text-white/90"
                    :style="{
                      left: `${it.x * gridCellPx}px`,
                      top: `${it.y * gridCellPx}px`,
                      width: `${it.w * gridCellPx}px`,
                      height: `${it.h * gridCellPx}px`,
                    }"
                  >
                    <div class="relative flex w-full items-center gap-2 overflow-hidden">
                      <div
                        v-if="Number(it.count) > 1"
                        class="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/90"
                      >
                        x{{ it.count }}
                      </div>
                      <svg
                        v-if="gridIconKind(it.itemId) === 'coin'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                        <path d="M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'key'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M10 14a4 4 0 1 1 1.17-2.83L20 11v3h-2v2h-2v2h-3v-2.2l-1.83-.12A4 4 0 0 1 10 14Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'canister'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l1-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                        <path d="M9 9h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      </svg>
                      <svg
                        v-else-if="gridIconKind(it.itemId) === 'gun'"
                        class="h-4 w-4 shrink-0 opacity-90"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path d="M4 14h10l2-4h4v4h-2v2h-6v-2H4v-2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
                      </svg>
                      <span class="min-w-0 truncate">
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
