import * as THREE from 'three'
import Experience from '../experience.js'

export default class Enemy {
  constructor(position) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.player = this.experience.world?.player // 获取玩家引用

    // 配置
    this.config = {
      detectionRadius: 10,
      attackRadius: 1.5,
      speed: 2.0,
      hp: 100,
    }

    // 状态
    this.isDead = false
    this.isLocked = false

    // 初始化
    this.position = new THREE.Vector3().copy(position)
    this.velocity = new THREE.Vector3()

    this._initMesh()
    this._initLockVisuals()
    this._initHealthBar()

    // 添加到可锁定目标列表 (需全局管理，这里简化处理)
    // 可以在 World 中维护一个 enemies 数组
  }

  _initHealthBar() {
    // 简单的 Billboard 血条
    const bgGeo = new THREE.PlaneGeometry(1, 0.1)
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333 })
    this.hpBarBg = new THREE.Mesh(bgGeo, bgMat)
    this.hpBarBg.position.y = 2.4
    this.group.add(this.hpBarBg)

    const fillGeo = new THREE.PlaneGeometry(1, 0.1)
    const fillMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 })
    this.hpBarFill = new THREE.Mesh(fillGeo, fillMat)
    this.hpBarFill.position.z = 0.01 // 稍微前移
    this.hpBarBg.add(this.hpBarFill)

    // 初始缩放
    this.hpBarFill.scale.x = 1
    // 锚点修正：默认 Plane 中心在中点，缩放会向两边缩
    // 简单起见，这里不改锚点，只缩放，看起来像是两边一起减血
  }

  _initMesh() {
    this.group = new THREE.Group()
    this.group.position.copy(this.position)
    this.scene.add(this.group)

    // 简单的僵尸模型 (绿色方块人)
    const material = new THREE.MeshStandardMaterial({ color: 0x55AA55 })

    // 身体
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), material)
    this.body.position.y = 0.9
    this.body.castShadow = true
    this.group.add(this.body)

    // 头部
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material)
    this.head.position.y = 1.8 + 0.25
    this.head.castShadow = true
    this.group.add(this.head)

    // 手臂 (前伸)
    const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2)
    this.armL = new THREE.Mesh(armGeo, material)
    this.armL.position.set(-0.4, 1.4, 0.4)
    this.armL.rotation.x = -Math.PI / 2
    this.group.add(this.armL)

    this.armR = new THREE.Mesh(armGeo, material)
    this.armR.position.set(0.4, 1.4, 0.4)
    this.armR.rotation.x = -Math.PI / 2
    this.group.add(this.armR)
  }

  _initLockVisuals() {
    // 锁定标记 (红色光圈)
    const ringGeo = new THREE.RingGeometry(0.4, 0.5, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthTest: false, // 始终显示在最上层
    })
    this.lockRing = new THREE.Mesh(ringGeo, ringMat)
    this.lockRing.rotation.x = -Math.PI / 2
    this.lockRing.position.y = 0.05
    this.group.add(this.lockRing)

    // 锁定箭头 (头顶)
    const arrowGeo = new THREE.ConeGeometry(0.2, 0.5, 4)
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0 })
    this.lockArrow = new THREE.Mesh(arrowGeo, arrowMat)
    this.lockArrow.position.y = 2.8
    this.lockArrow.rotation.x = Math.PI
    this.group.add(this.lockArrow)
  }

  setLocked(locked) {
    this.isLocked = locked
    const opacity = locked ? 1 : 0
    this.lockRing.material.opacity = opacity
    this.lockArrow.material.opacity = opacity

    // 描边效果 (可选)
    this.body.material.emissive = locked ? new THREE.Color(0x330000) : new THREE.Color(0x000000)
  }

  update() {
    if (this.isDead)
      return

    // 简单的 AI 逻辑
    if (this.experience.world && this.experience.world.player) {
      const playerPos = this.experience.world.player.getPosition?.()
      if (!playerPos)
        return

      // 血条朝向相机
      this.hpBarBg.lookAt(this.experience.camera.instance.position)

      const dist = this.group.position.distanceTo(playerPos)

      // 1. 追击
      if (dist < this.config.detectionRadius && dist > this.config.attackRadius) {
        const direction = new THREE.Vector3()
          .subVectors(playerPos, this.group.position)
          .normalize()

        // 忽略 Y 轴差异 (简单地面移动)
        direction.y = 0

        // 移动
        this.group.position.addScaledVector(direction, this.config.speed * this.experience.time.delta * 0.001)

        // 朝向玩家
        this.group.lookAt(playerPos.x, this.group.position.y, playerPos.z)
      }

      // 2. 锁定视觉更新 (自旋动画)
      if (this.isLocked) {
        this.lockRing.rotation.z += this.experience.time.delta * 0.005
        this.lockArrow.position.y = 2.8 + Math.sin(this.experience.time.elapsed * 0.005) * 0.2
      }
    }
  }

  takeDamage(amount) {
    this.config.hp -= amount

    // 更新血条
    const percent = Math.max(0, this.config.hp / 100)
    this.hpBarFill.scale.x = percent

    // 受击红闪
    this.body.material.color.setHex(0xFF0000)
    setTimeout(() => {
      this.body.material.color.setHex(0x55AA55)
    }, 100)

    if (this.config.hp <= 0) {
      this.die()
    }
  }

  die() {
    this.isDead = true
    this.group.rotation.x = -Math.PI / 2 // 倒下
    // TODO: 播放死亡特效或移除
    setTimeout(() => {
      this.destroy()
    }, 2000)
  }

  destroy() {
    this.scene.remove(this.group)
    // 资源清理...
  }
}
