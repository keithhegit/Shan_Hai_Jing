import * as THREE from 'three'

import Camera from './camera/camera.js'
import Renderer from './renderer.js'
import sources from './sources.js'
import Debug from './utils/debug.js'
import emitter from './utils/event-bus.js'
import IMouse from './utils/imouse.js'
import InputManager from './utils/input.js'
import PointerLockManager from './utils/pointer-lock.js'
import Resources from './utils/resources.js'
import Sizes from './utils/sizes.js'
import Stats from './utils/stats.js'
import Time from './utils/time.js'
import DungeonWorld from './world/dungeon-world.js'
import World from './world/world.js'

let instance

export default class Experience {
  constructor(canvas) {
    // Singleton
    if (instance) {
      return instance
    }

    instance = this

    // Global access
    window.Experience = this

    this.canvas = canvas

    // Panel
    this.debug = new Debug()
    this.stats = new Stats()
    this.sizes = new Sizes()
    this.time = new Time()
    this.scene = new THREE.Scene()
    this.camera = new Camera()
    this.renderer = new Renderer()
    this.resources = new Resources(sources)
    this.iMouse = new IMouse()
    this.input = new InputManager()
    this.pointerLock = new PointerLockManager() // 鼠标锁定管理器
    this.terrainDataManager = null // 地形数据管理器 - 将在 World 中初始化
    this.world = new World()

    // 世界切换事件监听
    emitter.on('game:switch_world', (worldId) => {
      this.switchWorld(worldId)
    })

    emitter.on('core:resize', () => {
      this.resize()
    })

    emitter.on('core:tick', () => {
      this.update()
    })

    window.addEventListener('beforeunload', () => {
      this.destroy()
    })
  }

  resize() {
    this.camera.resize()
    this.renderer.resize()
  }

  /**
   * 切换游戏世界
   * @param {string} worldId - 目标世界 ID ('hub', 'dungeon1', etc.)
   */
  async switchWorld(worldId) {
    console.warn(`[Experience] Switching to world: ${worldId}`)

    // 1. 暂停 tick 更新防止报错
    // this.time.stop()

    // 2. 清理当前世界
    if (this.world) {
      this.world.destroy()
      this.world = null
    }

    // 3. 显示加载界面 (TODO: Vue UI Event)
    emitter.emit('ui:show_loading', { worldId })

    // 4. 模拟异步加载 (预留给资源加载)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 5. 初始化新世界
    // 这里暂时只有 World (Hub)，后续会根据 ID 实例化不同 World 类
    // e.g., if (worldId === 'dungeon') this.world = new DungeonWorld()
    if (worldId.startsWith('dungeon')) {
      this.world = new DungeonWorld()
    }
    else {
      this.world = new World()
    }

    // 6. 隐藏加载界面
    emitter.emit('ui:hide_loading')

    // 7. 恢复
    // this.time.start()
  }

  update() {
    if (this.camera)
      this.camera.update()
    if (this.world)
      this.world.update()
    if (this.renderer)
      this.renderer.update()
    if (this.stats)
      this.stats.update()
    if (this.iMouse)
      this.iMouse.update()
  }

  destroy() {
    // 1. Stop update loop first
    this.time?.destroy()

    // 2. Destroy child components (reverse init order)
    this.world?.destroy()
    this.pointerLock?.destroy()
    this.input?.destroy()
    this.iMouse?.destroy()
    this.resources?.destroy()
    this.renderer?.destroy()
    this.camera?.destroy()

    // 3. Destroy utils
    this.stats?.destroy()
    this.sizes?.destroy()
    this.debug?.destroy()

    // 4. Clear scene
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child.geometry)
          child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          }
          else {
            child.material.dispose()
          }
        }
      })
      this.scene.clear()
    }

    // 5. Clear all mitt events (unified cleanup)
    emitter.all.clear()

    // 6. Clear global references
    if (window.Experience === this) {
      window.Experience = null
    }

    // 7. Reset singleton
    instance = null
  }
}
