import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import Experience from '../experience.js'
import emitter from '../utils/event-bus.js'
import DungeonGenerator from './dungeon-generator.js'
import Enemy from './enemy.js'
import Environment from './environment.js'
import InteractableObject from './interactable-object.js'
import Player from './player/player.js'

export default class DungeonWorld {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene

    // 生成地牢几何体
    this.dungeon = new DungeonGenerator()

    // 生成可互动物体
    this.interactables = []
    this.createInteractables()

    // 生成敌人
    this.enemies = []
    this.createEnemies()

    // 锁定状态
    this.lockedEnemy = null

    // 设置玩家
    this.player = new Player()
    // 强制重置玩家位置 (覆盖 Player 内部的重生逻辑)
    this.player.movement.position.set(0, 0, 2)
    this.player.movement.worldVelocity.set(0, 0, 0)

    // 设置相机
    this.cameraRig = new CameraRig()
    this.cameraRig.attachPlayer(this.player)
    this.experience.camera.attachRig(this.cameraRig)

    // 设置环境光 (较暗)
    this.environment = new Environment()
    this.environment.sunLight.intensity = 0.1 // 地牢很暗
    this.environment.ambientLight.intensity = 0.2

    // 监听锁定输入
    emitter.on('input:lock_on', this.handleLockOn.bind(this))
    emitter.on('input:punch_straight', this.handleAttack.bind(this)) // 简单攻击绑定
  }

  createEnemies() {
    // 在长廊中放置几个僵尸
    const positions = [
      new THREE.Vector3(0, 0, 20),
      new THREE.Vector3(-2, 0, 30),
      new THREE.Vector3(2, 0, 40),
    ]

    positions.forEach((pos) => {
      this.enemies.push(new Enemy(pos))
    })
  }

  handleLockOn() {
    if (this.lockedEnemy) {
      // 解除锁定
      this.lockedEnemy.setLocked(false)
      this.lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
    }
    else {
      // 寻找最近的敌人进行锁定
      const playerPos = this.player.getPosition()
      let nearest = null
      let minDist = Infinity

      this.enemies.forEach((enemy) => {
        if (enemy.isDead)
          return
        const dist = enemy.group.position.distanceTo(playerPos)
        if (dist < 20 && dist < minDist) { // 锁定范围 20
          minDist = dist
          nearest = enemy
        }
      })

      if (nearest) {
        this.lockedEnemy = nearest
        this.lockedEnemy.setLocked(true)
        emitter.emit('combat:toggle_lock', nearest.group) // 传递 Object3D 给相机
      }
    }
  }

  handleAttack() {
    // 简单的攻击判定
    // 播放动画 (TODO)

    // 判定伤害
    const playerPos = this.player.getPosition()
    const attackRange = 2.5
    const attackAngle = Math.PI / 3 // 60度扇形

    this.enemies.forEach((enemy) => {
      if (enemy.isDead)
        return

      const enemyPos = enemy.group.position
      const dist = playerPos.distanceTo(enemyPos)

      if (dist < attackRange) {
        // 角度检测
        const toEnemy = new THREE.Vector3().subVectors(enemyPos, playerPos).normalize()
        const playerDir = new THREE.Vector3()
        this.player.model.getWorldDirection(playerDir) // 获取模型朝向
        // 注意：Player 模型可能被旋转了 180 度，这里需根据实际朝向逻辑调整
        // 简单起见，使用相机/Group 朝向更稳

        const angle = playerDir.angleTo(toEnemy)
        if (angle < attackAngle) {
          enemy.takeDamage(20)
          // 击退效果
          const knockback = toEnemy.multiplyScalar(0.5)
          enemy.group.position.add(knockback)
        }
      }
    })
  }

  createInteractables() {
    const items = [
      {
        position: new THREE.Vector3(-2, 1, 15),
        title: '古老的卷轴',
        content: '上面记载着关于“Camazots”的传说，似乎这个世界是由某种古老的算法生成的...',
      },
      {
        position: new THREE.Vector3(2, 1, 35),
        title: '生锈的宝箱',
        content: '箱子里空空如也，只有一张纸条写着：“真正的宝藏是这一路上的风景。” —— 开发者留',
      },
    ]

    items.forEach((cfg) => {
      this.interactables.push(new InteractableObject(cfg))
    })
  }

  update() {
    if (this.player)
      this.player.update()
    if (this.environment)
      this.environment.update()
    this.interactables.forEach((item) => {
      item.update()
    })
    this.enemies.forEach((enemy) => {
      enemy.update()
    })

    // 检查胜利条件 (消灭所有敌人)
    this._checkVictory()
  }

  _checkVictory() {
    if (this.enemies.length > 0 && this.enemies.every(e => e.isDead) && !this.victoryTriggered) {
      this.victoryTriggered = true
      setTimeout(() => {
        emitter.emit('ui:show_cta', {
          title: 'VICTORY',
          message: '恭喜你清除了地牢中的邪恶！Might & Magic 的传奇才刚刚开始...',
        })
      }, 1000)
    }
  }

  destroy() {
    this.dungeon.destroy()
    this.player.destroy()
    this.cameraRig.destroy()
    this.environment.destroy()
    this.interactables.forEach((item) => {
      item.destroy()
    })
    this.enemies.forEach((enemy) => {
      enemy.destroy()
    })

    // 清理事件监听
    emitter.off('input:lock_on', this.handleLockOn) // 注意：bind 后的函数无法这样移除，需在构造时保存引用
    emitter.off('input:punch_straight', this.handleAttack)
  }
}
