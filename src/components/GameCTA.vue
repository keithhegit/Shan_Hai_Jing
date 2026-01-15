<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import emitter from '../js/utils/event-bus.js'

const visible = ref(false)
const title = ref('')
const message = ref('')
const actions = ref([])

function show(data) {
  title.value = data.title || 'Game Over'
  message.value = data.message || 'Thanks for playing!'
  actions.value = Array.isArray(data.actions) ? data.actions : []
  visible.value = true
  document.exitPointerLock()
}

function hide() {
  visible.value = false
  title.value = ''
  message.value = ''
  actions.value = []
}

function restart() {
  location.reload()
}

function openGithub() {
  window.open('https://github.com/keithhegit/might-magic_mc', '_blank')
}

function onAction(action) {
  const type = action?.type
  if (type === 'respawn') {
    emitter.emit('game:respawn')
    return
  }
  if (type === 'restart') {
    restart()
    return
  }
  if (type === 'github') {
    openGithub()
  }
}

onMounted(() => {
  emitter.on('ui:show_cta', show)
  emitter.on('ui:hide_cta', hide)
})

onBeforeUnmount(() => {
  emitter.off('ui:show_cta', show)
  emitter.off('ui:hide_cta', hide)
})
</script>

<template>
  <div v-if="visible" class="cta-overlay">
    <div class="cta-content">
      <h1>{{ title }}</h1>
      <p>{{ message }}</p>

      <div class="actions">
        <template v-if="actions.length">
          <button v-for="(action, idx) in actions" :key="idx" @click="onAction(action)">
            {{ action.label || action.type }}
          </button>
        </template>
        <template v-else>
          <button @click="restart">
            重新开始
          </button>
          <button @click="openGithub">
            Star on GitHub
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cta-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 20000;
}

.cta-content {
  text-align: center;
  color: white;
  animation: fadeIn 1s ease;
}

h1 {
  font-size: 48px;
  color: #ffaa00;
  margin-bottom: 24px;
  font-family: 'Minecraft', serif;
  text-shadow: 0 0 10px #ffaa00;
}

p {
  font-size: 18px;
  margin-bottom: 40px;
  color: #ccc;
}

.actions {
  display: flex;
  gap: 20px;
  justify-content: center;
}

button {
  padding: 12px 24px;
  font-size: 16px;
  cursor: pointer;
  background: #333;
  border: 1px solid #666;
  color: white;
  transition: all 0.2s;
  font-family: inherit;
}

button:hover {
  background: #555;
  border-color: #888;
  transform: scale(1.05);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
