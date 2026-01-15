<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Experience from '../js/experience.js'
import emitter from '../js/utils/event-bus.js'

const visible = ref(false)
const title = ref('')
const content = ref('')
const image = ref(null)

let experience = null

function getExperience() {
  if (!experience)
    experience = new Experience()
  return experience
}

function show(data) {
  const exp = getExperience()
  title.value = data.title
  content.value = data.content
  image.value = data.image
  visible.value = true

  // 暂停游戏时间
  exp.time?.stop?.()
  // 释放鼠标锁定以便点击
  document.exitPointerLock()
}

function close() {
  const exp = getExperience()
  visible.value = false
  // 恢复游戏时间
  exp.time?.start?.()
  // 重新锁定鼠标 (可选，体验更好)
  exp.canvas?.requestPointerLock?.()
}

function handleKeydown(e) {
  if (visible.value && e.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  emitter.on('ui:show_story', show)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  emitter.off('ui:show_story', show)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div v-if="visible" class="story-modal-overlay" @click="close">
    <div class="story-modal-content" @click.stop>
      <div v-if="image" class="modal-image">
        <img :src="image" :alt="title">
      </div>
      <div class="modal-text">
        <h2>{{ title }}</h2>
        <p>{{ content }}</p>
        <button class="close-btn" @click="close">
          关闭 [ESC]
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.story-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(5px);
}

.story-modal-content {
  background: #1a1a1a;
  border: 2px solid #444;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  overflow: hidden;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.modal-image img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  display: block;
}

.modal-text {
  padding: 24px;
  color: #eee;
}

h2 {
  margin-top: 0;
  color: #ffaa00;
  font-family: 'Minecraft', serif;
}

p {
  line-height: 1.6;
  color: #ccc;
}

.close-btn {
  margin-top: 20px;
  padding: 8px 16px;
  background: #333;
  border: 1px solid #666;
  color: white;
  cursor: pointer;
  float: right;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #555;
  border-color: #888;
}
</style>
