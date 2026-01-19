<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

const staminaPercent = ref(100)
const hp = ref(5)
const maxHp = ref(5)
const inventorySummary = ref({ backpackTotal: 0, warehouseTotal: 0, carriedPet: '' })

function updateStats(stats) {
  if (stats.hp !== undefined)
    hp.value = Number(stats.hp) || 0
  if (stats.maxHp !== undefined)
    maxHp.value = Number(stats.maxHp) || 0
  if (stats.stamina !== undefined)
    staminaPercent.value = stats.stamina
}

function updateInventorySummary(payload) {
  inventorySummary.value = payload || { backpackTotal: 0, warehouseTotal: 0, carriedPet: '' }
}

onMounted(() => {
  emitter.on('ui:update_stats', updateStats)
  emitter.on('inventory:summary', updateInventorySummary)
})

onBeforeUnmount(() => {
  emitter.off('ui:update_stats', updateStats)
  emitter.off('inventory:summary', updateInventorySummary)
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

      <div class="inventory-summary">
        <div class="inventory-row">
          <span>背包</span>
          <span>x{{ inventorySummary.backpackTotal }}</span>
          <span class="sep">·</span>
          <span>仓库</span>
          <span>x{{ inventorySummary.warehouseTotal }}</span>
        </div>
        <div v-if="inventorySummary.carriedPet" class="inventory-row carried-row">
          <span>携带</span>
          <span class="carried-name">{{ inventorySummary.carriedPet }}</span>
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
  top: 6.5rem;
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

.inventory-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.inventory-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.35);
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

.sep {
  opacity: 0.7;
}

.carried-row {
  opacity: 0.95;
}

.carried-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
