<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

const maxHearts = ref(5)
const currentHearts = ref(5)
const staminaPercent = ref(100)

function updateStats(stats) {
  if (stats.hp !== undefined)
    currentHearts.value = stats.hp
  if (stats.maxHp !== undefined)
    maxHearts.value = stats.maxHp
  if (stats.stamina !== undefined)
    staminaPercent.value = stats.stamina
}

onMounted(() => {
  emitter.on('ui:update_stats', updateStats)
})

onBeforeUnmount(() => {
  emitter.off('ui:update_stats', updateStats)
})
</script>

<template>
  <div class="player-hud">
    <!-- 血条 (红心) -->
    <div class="hearts-container">
      <div
        v-for="i in maxHearts"
        :key="i"
        class="heart"
        :class="{ lost: i > currentHearts }"
      >
        ❤️
      </div>
    </div>

    <!-- 体力条 (黄色进度条) -->
    <div class="stamina-bar-bg">
      <div class="stamina-bar-fill" :style="{ width: `${staminaPercent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.player-hud {
  position: absolute;
  top: 6.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.hearts-container {
  display: flex;
  gap: 4px;
}

.heart {
  font-size: 24px;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
  transition: all 0.3s;
}

.heart.lost {
  filter: grayscale(1) brightness(0.5) opacity(0.5);
  transform: scale(0.8);
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
</style>
