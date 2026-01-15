import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'

export default class InteractableObject {
  constructor(config = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.player = null // 需在 update 中获取或传入

    this.position = config.position || new THREE.Vector3(0, 0, 0)
    this.title = config.title || 'Mysterious Item'
    this.content = config.content || 'It seems ancient and powerful...'
    this.image = config.image || null

    this.radius = 2.0 // 触发半径
    this.isPlayerInside = false

    this.init()
  }

  init() {
    // 3D 物体 (宝箱/文物)
    this.geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
    this.material = new THREE.MeshStandardMaterial({
      color: 0xFFD700,
      emissive: 0xAA5500,
      emissiveIntensity: 0.2,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.position.copy(this.position)
    this.mesh.castShadow = true
    this.scene.add(this.mesh)

    // 交互提示 (CSS2D)
    this.createLabel()

    // 监听按键
    window.addEventListener('keydown', this.handleInput.bind(this))
  }

  createLabel() {
    const div = document.createElement('div')
    div.className = 'interaction-label'
    div.textContent = '按 [E] 互动'
    div.style.color = 'white'
    div.style.fontFamily = 'Arial'
    div.style.fontSize = '14px'
    div.style.padding = '4px 8px'
    div.style.background = 'rgba(0,0,0,0.6)'
    div.style.borderRadius = '4px'
    div.style.pointerEvents = 'none'
    div.style.opacity = '0'
    div.style.transition = 'opacity 0.2s'

    this.label = new CSS2DObject(div)
    this.label.position.set(0, 1.2, 0)
    this.mesh.add(this.label)
    this.labelElement = div
  }

  handleInput(e) {
    if (this.isPlayerInside && (e.key === 'e' || e.key === 'E')) {
      this.trigger()
    }
  }

  trigger() {
    emitter.emit('ui:show_story', {
      title: this.title,
      content: this.content,
      image: this.image,
    })
  }

  update() {
    // 简单距离检测
    // 注意：这里需要获取 player 实例，可以通过 Experience.world.player 获取
    if (this.experience.world && this.experience.world.player) {
      const playerPos = this.experience.world.player.getPosition?.()
      if (playerPos) {
        const dist = this.position.distanceTo(playerPos)

        if (dist < this.radius) {
          if (!this.isPlayerInside) {
            this.isPlayerInside = true
            this.labelElement.style.opacity = '1'
            this.material.emissiveIntensity = 0.8
          }
        }
        else {
          if (this.isPlayerInside) {
            this.isPlayerInside = false
            this.labelElement.style.opacity = '0'
            this.material.emissiveIntensity = 0.2
          }
        }
      }
    }

    // 自旋动效
    this.mesh.rotation.y += this.experience.time.delta * 0.001
    this.mesh.position.y = this.position.y + Math.sin(this.experience.time.elapsed * 0.002) * 0.1
  }

  destroy() {
    window.removeEventListener('keydown', this.handleInput.bind(this))
    this.scene.remove(this.mesh)
    this.geometry.dispose()
    this.material.dispose()
    // CSS2DObject 会自动清理吗？通常还是移除为好
    this.mesh.remove(this.label)
  }
}
