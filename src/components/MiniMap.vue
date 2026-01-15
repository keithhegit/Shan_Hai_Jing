<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { blocks } from '../js/world/terrain/blocks-config.js'

const canvas = ref(null)
const size = 150 // Canvas 像素大小
const playerPos = ref({ x: 0, z: 0 })
const mapMeta = ref({ originX: -50, originZ: -50, worldSize: 100 })

let experience = null
let ctx = null
let animationFrame = null

// 计算玩家标记位置 (相对于 Canvas 中心)
const markerStyle = computed(() => {
  const ratio = size / (mapMeta.value.worldSize || 1)
  const cx = (playerPos.value.x - mapMeta.value.originX) * ratio
  const cy = (playerPos.value.z - mapMeta.value.originZ) * ratio

  return {
    transform: `translate(${cx}px, ${cy}px)`,
  }
})

onMounted(() => {
  // 等待 World 初始化完成
  // 也可以直接尝试获取，因为 Vue 组件通常在 Experience 之后挂载
  initMap()

  // 监听更新循环来同步玩家位置
  animationFrame = requestAnimationFrame(updatePlayer)
})

onBeforeUnmount(() => {
  if (animationFrame)
    cancelAnimationFrame(animationFrame)
})

function initMap() {
  experience = window.Experience || null
  if (!experience) {
    setTimeout(initMap, 100)
    return
  }
  const dataManager = experience.terrainDataManager

  if (dataManager && canvas.value) {
    ctx = canvas.value.getContext('2d')
    drawStaticMap(dataManager)
  }
  else {
    // Retry if not ready
    setTimeout(initMap, 100)
  }
}

function drawStaticMap(dataManager) {
  ctx.clearRect(0, 0, size, size)

  // 绘制背景
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, size, size)

  if (typeof dataManager?.size === 'number' && Array.isArray(dataManager?.dataBlocks)) {
    const worldSize = dataManager.size
    const halfSize = worldSize / 2
    const ratio = size / worldSize
    mapMeta.value = { originX: -halfSize, originZ: -halfSize, worldSize }

    dataManager.dataBlocks.forEach((block) => {
      const cx = (block.x + halfSize) * ratio
      const cy = (block.z + halfSize) * ratio
      const w = 1 * ratio
      const h = 1 * ratio

      ctx.fillStyle = `#${block.color.getHexString()}`
      ctx.fillRect(cx, cy, w, h)
    })
    return
  }

  if (typeof dataManager?.getTopSolidYWorld === 'function' && typeof dataManager?.getBlockWorld === 'function') {
    const chunkWidth = dataManager.chunkWidth ?? 64
    const viewDistance = dataManager.viewDistance ?? 1
    const worldSize = chunkWidth * (viewDistance * 2 + 1)
    const centerX = chunkWidth * 0.5
    const centerZ = chunkWidth * 0.5
    const originX = centerX - worldSize * 0.5
    const originZ = centerZ - worldSize * 0.5
    mapMeta.value = { originX, originZ, worldSize }

    const ratio = size / worldSize

    const colorForBlockId = (blockId) => {
      if (blockId === blocks.grass.id)
        return '#2f8d46'
      if (blockId === blocks.dirt.id)
        return '#6b4f2a'
      if (blockId === blocks.stone.id)
        return '#555b62'
      if (blockId === blocks.sand?.id)
        return '#cdbb6a'
      if (blockId === blocks.snow?.id)
        return '#e9f2ff'
      if (blockId === blocks.ice?.id || blockId === blocks.packedIce?.id)
        return '#8fd0ff'
      if (blockId === blocks.gravel?.id)
        return '#7b7b7b'
      return '#1c1f22'
    }

    for (let py = 0; py < size; py++) {
      const worldZ = originZ + py / ratio
      for (let px = 0; px < size; px++) {
        const worldX = originX + px / ratio
        const topY = dataManager.getTopSolidYWorld(worldX, worldZ)
        if (typeof topY !== 'number')
          continue
        const block = dataManager.getBlockWorld(Math.floor(worldX), topY, Math.floor(worldZ))
        if (!block?.id || block.id === blocks.empty.id)
          continue
        ctx.fillStyle = colorForBlockId(block.id)
        ctx.fillRect(px, py, 1, 1)
      }
    }
  }
}

function updatePlayer() {
  if (experience && experience.world && experience.world.player) {
    const p = experience.world.player.getPosition?.()
    if (p)
      playerPos.value = { x: p.x, z: p.z }
  }
  animationFrame = requestAnimationFrame(updatePlayer)
}
</script>

<template>
  <div class="minimap-container">
    <canvas ref="canvas" :width="size" :height="size" />
    <div class="player-marker" :style="markerStyle" />
  </div>
</template>

<style scoped>
.minimap-container {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 150px;
  height: 150px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  overflow: hidden;
  pointer-events: none; /* 穿透点击 */
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.player-marker {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 6px;
  background: red;
  border: 1px solid white;
  border-radius: 50%;
  margin-left: -3px; /* Center anchor */
  margin-top: -3px;
  box-shadow: 0 0 4px red;
}
</style>
