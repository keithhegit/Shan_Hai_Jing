<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Crosshair from './components/Crosshair.vue'
import GameCTA from './components/GameCTA.vue'
import MiniMap from './components/MiniMap.vue'
import PlayerHUD from './components/PlayerHUD.vue'
import StoryModal from './components/StoryModal.vue'
import Experience from './js/experience.js'
import emitter from './js/utils/event-bus.js'

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
const chestModal = ref(null)

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
}

function onLoadingHide() {
  loadingState.value = null
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

function bagEntries(bag) {
  return Object.entries(bag || {})
    .map(([id, count]) => ({ id, count }))
    .filter(row => Number.isFinite(Number(row.count)) && Number(row.count) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function itemLabel(id) {
  if (id === 'fence')
    return 'Fence'
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
  if (chestModal.value && key === 'escape') {
    closeChestModal()
    return
  }
  if (inventoryPanel.value && key === 'escape') {
    closeInventoryPanel()
    return
  }
  if (key === 'escape' || (key === 'e' && interactableModal.value))
    closeInteractableModal()
}

onMounted(() => {
  if (!threeCanvas.value) {
    console.error('Three.js canvas not found!')
    return
  }

  experience = new Experience(threeCanvas.value)
  emitter.on('portal:prompt', onPortalPrompt)
  emitter.on('portal:prompt_clear', onPortalPromptClear)
  emitter.on('interactable:prompt', onInteractablePrompt)
  emitter.on('interactable:prompt_clear', onInteractablePromptClear)
  emitter.on('interactable:open', onInteractableOpen)
  emitter.on('loading:show', onLoadingShow)
  emitter.on('loading:hide', onLoadingHide)
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
      v-if="!interactableModal && !chestModal && !loadingState && dungeonProgress"
      class="pointer-events-none absolute left-1/2 top-6 z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-white/15 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ dungeonProgress.name }}地牢 · 已阅读 {{ dungeonProgress.read }}/{{ dungeonProgress.total }}<span v-if="dungeonProgress.canQuickReturn"> · 按 R 快速返回</span>
      </div>
    </div>
    <div
      v-if="!interactableModal && !chestModal && !loadingState && dungeonToast"
      class="pointer-events-none absolute left-1/2 top-[3.75rem] z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-black/35 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ dungeonToast.text }}
      </div>
    </div>
    <div
      v-if="!interactableModal && !chestModal && !loadingState && lockState"
      class="pointer-events-none absolute left-1/2 top-24 z-[1800] -translate-x-1/2 px-4"
    >
      <div class="mx-auto w-fit rounded-full border border-white/20 bg-black/35 px-4 py-2 text-center text-xs font-semibold text-white shadow-xl backdrop-blur-md">
        {{ lockState.title }} · {{ lockState.hint }}
      </div>
    </div>
    <div
      v-if="!interactableModal && !chestModal && !loadingState && (interactablePrompt || portalPrompt)"
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
      v-if="!interactableModal && !chestModal && !loadingState"
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
            <span>B / H</span> <span>背包 / 仓库</span>
          </div>
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
            关闭 (ESC/B/H)
          </button>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-bold text-white/90">
                背包
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
                <button
                  class="shrink-0 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
                  @click="transferItem('backpack', 'warehouse', row.id, 1)"
                >
                  存入
                </button>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/15 bg-black/30 p-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="text-sm font-bold text-white/90">
                仓库
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
      v-if="loadingState"
      class="pointer-events-none absolute inset-0 z-[12000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-[520px] rounded-2xl border border-white/20 bg-white/15 p-5 text-center text-white shadow-2xl backdrop-blur-md">
        <div class="text-lg font-semibold drop-shadow">
          {{ loadingState.title }}
        </div>
        <div class="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/15">
          <div class="h-full w-1/2 animate-pulse rounded-full bg-white/70" />
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
