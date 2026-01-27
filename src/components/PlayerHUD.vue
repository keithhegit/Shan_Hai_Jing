<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

const staminaPercent = ref(100)
const hp = ref(5)
const maxHp = ref(5)
const captureHint = ref(null)
const hudHint = ref(null)
let hudHintTimer = null
const feed = ref([])
let feedSeq = 1
let lastLoadingTitle = ''

function updateStats(stats) {
  if (stats.hp !== undefined)
    hp.value = Number(stats.hp) || 0
  if (stats.maxHp !== undefined)
    maxHp.value = Number(stats.maxHp) || 0
  if (stats.stamina !== undefined)
    staminaPercent.value = stats.stamina
}

function onCaptureHint(payload) {
  captureHint.value = payload || null
}

function onHudHint(payload) {
  hudHint.value = payload || null
  if (hudHintTimer)
    clearTimeout(hudHintTimer)
  const ttl = Math.max(500, Math.floor(Number(payload?.ttlMs) || 3500))
  if (payload?.text) {
    hudHintTimer = setTimeout(() => {
      hudHint.value = null
      hudHintTimer = null
    }, ttl)
  }
}

function pushFeed(text) {
  const t = String(text || '').trim()
  if (!t)
    return
  feed.value.push({ id: feedSeq++, text: t })
  if (feed.value.length > 30)
    feed.value.splice(0, feed.value.length - 30)
}

function onDungeonToast(payload) {
  if (payload?.text)
    pushFeed(payload.text)
}

function onUiLog(payload) {
  if (typeof payload === 'string')
    pushFeed(payload)
  else if (payload?.text)
    pushFeed(payload.text)
}

function onLoadingShow(payload) {
  const title = String(payload?.title || '').trim()
  if (title) {
    lastLoadingTitle = title
    pushFeed(`传送：${title}`)
  }
  else {
    lastLoadingTitle = ''
    pushFeed('传送：进行中')
  }
}

function onLoadingHide() {
  if (lastLoadingTitle) {
    pushFeed(`传送：完成（${lastLoadingTitle}）`)
    lastLoadingTitle = ''
    return
  }
  pushFeed('传送：完成')
}

function onCombatLock(payload) {
  const title = payload?.title ? String(payload.title) : '已锁定'
  pushFeed(`锁定：${title}`)
}

function onCombatLockClear() {
  pushFeed('锁定：解除')
}

function onPlayerDamaged(payload) {
  const amount = Math.max(0, Math.floor(Number(payload?.amount) || 0))
  const hpNow = Number.isFinite(Number(payload?.hp)) ? Math.floor(Number(payload.hp)) : null
  const hpMax = Number.isFinite(Number(payload?.maxHp)) ? Math.floor(Number(payload.maxHp)) : null
  if (hpNow !== null && hpMax !== null)
    pushFeed(`受击：-${Math.max(1, amount)}（${hpNow}/${hpMax}）`)
  else
    pushFeed(`受击：-${Math.max(1, amount)}`)
}

onMounted(() => {
  emitter.on('ui:update_stats', updateStats)
  emitter.on('ui:capture_hint', onCaptureHint)
  emitter.on('ui:hud_hint', onHudHint)
  emitter.on('dungeon:toast', onDungeonToast)
  emitter.on('ui:log', onUiLog)
  emitter.on('loading:show', onLoadingShow)
  emitter.on('loading:hide', onLoadingHide)
  emitter.on('combat:lock', onCombatLock)
  emitter.on('combat:lock_clear', onCombatLockClear)
  emitter.on('combat:player_damaged', onPlayerDamaged)
})

onBeforeUnmount(() => {
  emitter.off('ui:update_stats', updateStats)
  emitter.off('ui:capture_hint', onCaptureHint)
  emitter.off('ui:hud_hint', onHudHint)
  emitter.off('dungeon:toast', onDungeonToast)
  emitter.off('ui:log', onUiLog)
  emitter.off('loading:show', onLoadingShow)
  emitter.off('loading:hide', onLoadingHide)
  emitter.off('combat:lock', onCombatLock)
  emitter.off('combat:lock_clear', onCombatLockClear)
  emitter.off('combat:player_damaged', onPlayerDamaged)
  if (hudHintTimer) {
    clearTimeout(hudHintTimer)
    hudHintTimer = null
  }
})
</script>

<template>
  <div class="player-hud">
    <div class="hp-hearts">
      <svg
        v-for="i in Math.max(0, Math.min(10, maxHp))"
        :key="`hp:${i}`"
        viewBox="0 0 24 24"
        class="hp-heart"
        :class="i <= hp ? 'filled' : 'empty'"
      >
        <path
          d="M12 21s-6.7-4.4-9.6-8.1C.2 10.1 1 6.6 3.8 4.9c2.1-1.2 4.6-.7 6.1.9L12 7.9l2.1-2.1c1.5-1.6 4-2.1 6.1-.9 2.8 1.7 3.6 5.2 1.4 8-2.9 3.7-9.6 8.1-9.6 8.1Z"
        />
      </svg>
      <div class="hp-text">
        {{ hp }}/{{ maxHp }}
      </div>
    </div>

    <div class="hud-center">
      <div class="stamina-bar-bg">
        <div class="stamina-bar-fill" :style="{ width: `${staminaPercent}%` }" />
      </div>

      <div v-if="captureHint?.text" class="hud-hint">
        {{ captureHint.text }}
      </div>

      <div v-if="hudHint?.text" class="hud-hint">
        {{ hudHint.text }}
      </div>
    </div>

    <div class="absolute bottom-4 left-4 pointer-events-auto">
      <div class="w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/15 bg-white/10 p-3 text-[12px] text-white/90 shadow-2xl backdrop-blur-md opacity-35 transition-opacity duration-150 hover:opacity-95">
        <div class="mb-2 flex items-center justify-between">
          <div class="text-xs font-bold text-white/90">
            日志
          </div>
          <div class="text-[10px] opacity-70">
            {{ feed.length }}
          </div>
        </div>
        <div class="max-h-[180px] space-y-1 overflow-auto pr-1">
          <div
            v-for="row in feed"
            :key="`log:${row.id}`"
            class="rounded-lg border border-white/5 bg-black/20 px-2 py-1 leading-snug"
          >
            {{ row.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hud-center {
  position: absolute;
  top: 9rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hp-hearts {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
  backdrop-filter: blur(6px);
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.hp-heart {
  width: 18px;
  height: 18px;
}

.hp-heart.filled {
  fill: #d40027;
}

.hp-heart.empty {
  fill: #0b0b0b;
}

.hp-text {
  font-size: 12px;
  opacity: 0.9;
  margin-left: 4px;
}

.stamina-bar-bg {
  width: 200px;
  height: 8px;
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 4px;
  overflow: hidden;
}

.stamina-bar-fill {
  height: 100%;
  background: #ffaa00;
  transition: width 0.1s linear;
  box-shadow: 0 0 5px #ffaa00;
}

.hud-hint {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
  backdrop-filter: blur(6px);
  font-size: 16px;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
</style>
