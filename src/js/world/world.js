import * as THREE from 'three'
import CameraRig from '../camera/camera-rig.js'
import { CHUNK_BASIC_CONFIG, TERRAIN_PARAMS } from '../config/chunk-config.js'
import Experience from '../experience.js'
// import BlockRaycaster from '../interaction/block-raycaster.js'
// import BlockSelectionHelper from '../interaction/block-selection-helper.js'
import emitter from '../utils/event-bus.js'
import BlockDungeonGenerator from './dungeon/block-dungeon-generator.js'
import HumanoidEnemy from './enemies/humanoid-enemy.js'
import Environment from './environment.js'
import Player from './player/player.js'
import { blocks } from './terrain/blocks-config.js'
import ChunkManager from './terrain/chunk-manager.js'

export default class World {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.scene.add(new THREE.AxesHelper(5))
    this.isPaused = false
    this.currentWorld = 'hub'
    this._activeInteractableId = null
    this._activeInteractable = null
    this._openedInteractableId = null
    this._dungeonInteractables = null
    this._dungeonInteractablesGroup = null
    this._dungeonName = null
    this._dungeonProgress = null
    this._dungeonState = null
    this._dungeonCompleted = false
    this._activeDungeonPortalId = null
    this._portalDungeonProgress = this._loadPortalDungeonProgress()
    this._activeDungeonExit = null
    this._activeDungeonExitPrompt = null
    this._dungeonEnemies = null
    this._dungeonEnemiesGroup = null
    this._lockedEnemy = null
    this._playerAttackCooldownUntil = 0
    this._dungeonRewardPending = null
    this._dungeonRewardSpawned = false
    // this._dungeonCollisionInfo = null // Deprecated
    // this._dungeonCollisionProvider = ... // Deprecated
    this._blockDungeonGenerator = null

    this._hubCenter = { x: 0, z: 0 }
    this._savedRespawnPosition = null

    this.terrain = null
    this.player = null
    this.cameraRig = null
    this.environment = null
    this.floor = null
    this.blockRaycaster = null
    this.blockSelectionHelper = null
    this.chunkManager = null
    this.portals = []

    emitter.on('core:ready', () => {
      this.chunkManager = new ChunkManager({
        chunkWidth: CHUNK_BASIC_CONFIG.chunkWidth,
        chunkHeight: CHUNK_BASIC_CONFIG.chunkHeight,
        viewDistance: CHUNK_BASIC_CONFIG.viewDistance, // 3×3
        seed: 1265, // 使用自定义 seed，覆盖默认值
        terrain: {
          scale: TERRAIN_PARAMS.scale,
          magnitude: TERRAIN_PARAMS.magnitude,
          offset: TERRAIN_PARAMS.offset,
          rockExpose: TERRAIN_PARAMS.rockExpose,
          fbm: TERRAIN_PARAMS.fbm,
        },
      })
      this.experience.terrainDataManager = this.chunkManager
      this.chunkManager.initInitialGrid()

      this._blockDungeonGenerator = new BlockDungeonGenerator(this.chunkManager)

      // Setup
      this.player = new Player()

      this._initAnimals()

      // Setup Camera Rig
      this.cameraRig = new CameraRig()
      this.cameraRig.attachPlayer(this.player)
      this.experience.camera.attachRig(this.cameraRig)

      this.environment = new Environment()

      // ===== 交互暂时禁用 (待适配 InstancedMesh) =====
      /*
      this.blockRaycaster = new BlockRaycaster({
        chunkManager: this.chunkManager,
        maxDistance: 10,
        useMouse: false,
      })
      this.blockSelectionHelper = new BlockSelectionHelper({
        enabled: true,
      })
      */

      // 默认编辑模式
      this.blockEditMode = 'remove'

      // 监听模式切换
      emitter.on('input:toggle_block_edit_mode', () => {
        this.blockEditMode = this.blockEditMode === 'remove' ? 'add' : 'remove'
        emitter.emit('game:block_edit_mode_changed', { mode: this.blockEditMode })
      })

      // ===== 交互事件绑定：删除/新增方块 =====
      emitter.on('input:mouse_down', (event) => {
        if (event.button === 1) {
          this._toggleLockOn()
          return
        }
        // 0 为左键
        if (event.button === 0 && this.blockRaycaster?.current) {
          // ... logic disabled
        }
      })

      this._onPunchStraight = () => {
        this._tryPlayerAttack({ damage: 1, range: 2.6, minDot: 0.35, cooldownMs: 220 })
      }
      this._onPunchHook = () => {
        this._tryPlayerAttack({ damage: 2, range: 2.4, minDot: 0.2, cooldownMs: 320 })
      }
      emitter.on('input:punch_straight', this._onPunchStraight)
      emitter.on('input:punch_hook', this._onPunchHook)

      this._portalMeshes = new THREE.Group()
      this.scene.add(this._portalMeshes)

      this._activePortalId = null
      this._activePortal = null

      const hubX = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)
      const hubZ = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)
      this._hubCenter = { x: hubX, z: hubZ }

      this._initPortals()
      this._initInteractables()

      this._onInteract = () => {
        if (this.isPaused)
          return
        if (this._activeInteractable) {
          this.isPaused = true
          this.experience.pointerLock?.exitLock?.()
          this._openedInteractableId = this._activeInteractable.id
          const payload = {
            id: this._activeInteractable.id,
            title: this._activeInteractable.title,
            description: this._activeInteractable.description,
          }
          this._emitDungeonState()
          emitter.emit('interactable:open', payload)
          emitter.emit('interactable:prompt_clear')
          emitter.emit('portal:prompt_clear')
          return
        }
        if (this._activeDungeonExit) {
          this._exitDungeon()
          return
        }
        if (this._activePortal)
          this._activatePortal(this._activePortal)
      }

      this._onInteractableClose = (payload) => {
        if (!this.isPaused)
          return
        const closedId = payload?.id || this._openedInteractableId
        if (closedId) {
          const pool = []
          if (this.interactables)
            pool.push(...this.interactables)
          if (this._dungeonInteractables)
            pool.push(...this._dungeonInteractables)
          const item = pool.find(i => i.id === closedId)
          if (item && !item.read) {
            item.read = true
            if (item.mesh?.material) {
              item.mesh.material.emissiveIntensity = 0.22
              item.mesh.material.roughness = 0.55
              item.mesh.material.metalness = 0.05
            }
            if (item.outline?.material) {
              item.outline.material.opacity = 0.45
            }
            if (this.currentWorld === 'dungeon')
              this._emitDungeonProgress()
          }
        }
        this._openedInteractableId = null
        this.isPaused = false
        this._emitDungeonState()
        this.experience.pointerLock?.requestLock?.()
      }

      this._onPause = () => {
        this.isPaused = true
        this._emitDungeonState()
      }

      this._onResume = () => {
        this.isPaused = false
        this._emitDungeonState()
      }

      this._onQuickReturn = () => {
        if (this.isPaused)
          return
        if (this.currentWorld !== 'dungeon')
          return
        if (!this._dungeonCompleted) {
          emitter.emit('dungeon:toast', { text: '完成探索后可按 R 快速返回' })
          return
        }
        this._exitDungeon()
      }

      emitter.on('input:interact', this._onInteract)
      emitter.on('interactable:close', this._onInteractableClose)
      emitter.on('input:quick_return', this._onQuickReturn)
      emitter.on('game:pause', this._onPause)
      emitter.on('game:resume', this._onResume)
    })
  }

  _getEnemyLockTargetPos(enemy) {
    if (!enemy?.group)
      return null
    const pos = new THREE.Vector3()
    enemy.group.getWorldPosition(pos)
    pos.y += 1.4
    return pos
  }

  _getNearestDungeonEnemy(maxDistance = 18) {
    if (!this._dungeonEnemies || !this.player)
      return null
    const pos = this.player.getPosition()
    let best = null
    let bestD2 = Infinity
    const maxD2 = maxDistance * maxDistance
    for (const enemy of this._dungeonEnemies) {
      if (!enemy?.group)
        continue
      const epos = new THREE.Vector3()
      enemy.group.getWorldPosition(epos)
      const dx = epos.x - pos.x
      const dz = epos.z - pos.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = enemy
      }
    }
    if (!best || bestD2 > maxD2)
      return null
    return best
  }

  _toggleLockOn() {
    if (this.isPaused)
      return
    if (this.currentWorld !== 'dungeon')
      return
    if (!this.player)
      return
    if (this._activeInteractableId !== null)
      return

    if (this._lockedEnemy) {
      this._lockedEnemy.setLocked?.(false)
      this._lockedEnemy = null
      this.cameraRig?.setLookAtOverride?.(null)
      emitter.emit('combat:lock_clear')
      return
    }

    const enemy = this._getNearestDungeonEnemy()
    if (!enemy)
      return

    this._lockedEnemy = enemy
    this._lockedEnemy.setLocked?.(true)
    const targetPos = this._getEnemyLockTargetPos(enemy)
    if (targetPos)
      this.cameraRig?.setLookAtOverride?.(targetPos)
    emitter.emit('combat:lock', { title: '已锁定', hint: '中键解除' })
  }

  _updateLockOn() {
    if (this.currentWorld !== 'dungeon' || !this.player) {
      if (this._lockedEnemy) {
        this._lockedEnemy.setLocked?.(false)
        this._lockedEnemy = null
        this.cameraRig?.setLookAtOverride?.(null)
        emitter.emit('combat:lock_clear')
      }
      return
    }
    if (!this._lockedEnemy)
      return

    const enemy = this._lockedEnemy
    if (!enemy?.group) {
      this._lockedEnemy = null
      this.cameraRig?.setLookAtOverride?.(null)
      emitter.emit('combat:lock_clear')
      return
    }

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 > 32 * 32) {
      enemy.setLocked?.(false)
      this._lockedEnemy = null
      this.cameraRig?.setLookAtOverride?.(null)
      emitter.emit('combat:lock_clear')
      return
    }

    const desired = Math.atan2(dx, dz)
    const current = this.player.getFacingAngle()
    const next = this._lerpAngle(current, desired, 0.12)
    this.player.setFacing(next)

    const targetPos = this._getEnemyLockTargetPos(enemy)
    if (targetPos)
      this.cameraRig?.setLookAtOverride?.(targetPos)
  }

  _lerpAngle(current, target, t) {
    const twoPi = Math.PI * 2
    const diff = THREE.MathUtils.euclideanModulo(target - current + Math.PI, twoPi) - Math.PI
    return current + diff * t
  }

  _loadPortalDungeonProgress() {
    try {
      if (typeof window === 'undefined')
        return {}
      const raw = window.localStorage?.getItem?.('mmmc:dungeon_progress_v1')
      if (!raw)
        return {}
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object')
        return {}
      return parsed
    }
    catch {
      return {}
    }
  }

  _savePortalDungeonProgress() {
    try {
      if (typeof window === 'undefined')
        return
      window.localStorage?.setItem?.('mmmc:dungeon_progress_v1', JSON.stringify(this._portalDungeonProgress || {}))
    }
    catch {
    }
  }

  _getSurfaceY(worldX, worldZ) {
    const topY = this.chunkManager?.getTopSolidYWorld?.(worldX, worldZ)
    if (typeof topY !== 'number' || Number.isNaN(topY))
      return 10
    return topY + 0.55
  }

  _getDungeonBlockWorld(x, y, z) {
    const info = this._dungeonCollisionInfo
    if (!info)
      return { id: blocks.empty.id, instanceId: null }

    const dx = x - info.originX
    const dz = z - info.originZ
    const s = dx * info.dirX + dz * info.dirZ
    const u = dx * info.sideX + dz * info.sideZ

    if (s < -1 || s > info.length + 1)
      return { id: blocks.empty.id, instanceId: null }

    const absU = Math.abs(u)
    if (absU > info.halfWidth + 0.75)
      return { id: blocks.empty.id, instanceId: null }

    const inWalkway = absU <= info.halfWidth - 0.75
    const inWallBand = absU >= info.halfWidth - 0.75 && absU <= info.halfWidth + 0.25

    if (y <= info.floorBlockY && y >= info.floorBlockY - 1 && inWalkway)
      return { id: blocks.stone.id, instanceId: null }

    if (y > info.floorBlockY && y <= info.floorBlockY + info.wallHeightBlocks && inWallBand)
      return { id: blocks.stone.id, instanceId: null }

    if (y === info.roofBlockY && inWalkway)
      return { id: blocks.stone.id, instanceId: null }

    const frontCap = s >= -0.5 && s <= 0.5
    const backCap = s >= info.length - 0.5 && s <= info.length + 0.5
    if ((frontCap || backCap) && y > info.floorBlockY && y <= info.roofBlockY && inWalkway)
      return { id: blocks.stone.id, instanceId: null }

    return { id: blocks.empty.id, instanceId: null }
  }

  _emitDungeonProgress() {
    if (this.currentWorld !== 'dungeon')
      return
    const list = this._dungeonInteractables || []
    const total = list.length
    const read = list.reduce((sum, item) => sum + (item.read ? 1 : 0), 0)
    const completed = this._dungeonCompleted || (total > 0 && read === total)
    const payload = {
      name: this._dungeonName || '',
      read,
      total,
      canQuickReturn: completed,
    }
    this._dungeonProgress = payload
    this._emitDungeonState()
    emitter.emit('dungeon:progress', payload)

    if (this._activeDungeonPortalId) {
      if (!this._portalDungeonProgress)
        this._portalDungeonProgress = {}
      this._portalDungeonProgress[this._activeDungeonPortalId] = {
        ...(this._portalDungeonProgress[this._activeDungeonPortalId] || {}),
        read,
        total,
        updatedAt: Date.now(),
      }
      this._savePortalDungeonProgress()
    }

    if (total > 0 && read === total && !this._dungeonCompleted) {
      this._dungeonCompleted = true
      if (this._activeDungeonPortalId) {
        this._portalDungeonProgress[this._activeDungeonPortalId] = {
          ...(this._portalDungeonProgress[this._activeDungeonPortalId] || {}),
          read,
          total,
          completed: true,
          completedAt: Date.now(),
        }
        this._savePortalDungeonProgress()
      }
      emitter.emit('dungeon:toast', { text: '探索完成：按 R 快速返回，或去出口按 E 返回' })
    }
  }

  _emitDungeonState() {
    const payload = {
      currentWorld: this.currentWorld,
      dungeonId: this._activeDungeonPortalId,
      dungeonName: this._dungeonName,
      progress: this._dungeonProgress,
      completed: !!this._dungeonCompleted,
      isPaused: !!this.isPaused,
    }
    this._dungeonState = payload
    emitter.emit('dungeon:state', payload)
  }

  _initPortals() {
    const centerX = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)
    const centerZ = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)

    const hub = { x: centerX, z: centerZ }
    const targetOffset = this.chunkManager.chunkWidth ?? 64

    this.portals = [
      {
        id: 'plains',
        name: '平原',
        anchor: { x: hub.x + 8, z: hub.z },
        target: { x: hub.x + targetOffset, z: hub.z },
        color: 0x5D_D2_FF,
      },
      {
        id: 'desert',
        name: '沙漠',
        anchor: { x: hub.x - 8, z: hub.z },
        target: { x: hub.x - targetOffset, z: hub.z },
        color: 0xFF_D4_5D,
      },
      {
        id: 'snow',
        name: '雪原',
        anchor: { x: hub.x, z: hub.z + 8 },
        target: { x: hub.x, z: hub.z + targetOffset },
        color: 0xD6_F6_FF,
      },
      {
        id: 'forest',
        name: '森林',
        anchor: { x: hub.x, z: hub.z - 8 },
        target: { x: hub.x, z: hub.z - targetOffset },
        color: 0x69_FF_93,
      },
    ]

    const ringGeometry = new THREE.TorusGeometry(1.25, 0.18, 16, 48)
    const completeRingGeometry = new THREE.TorusGeometry(1.5, 0.08, 16, 48)
    const columnGeometry = new THREE.CylinderGeometry(1.15, 1.15, 2.8, 32, 1, true)

    for (const portal of this.portals) {
      const group = new THREE.Group()
      group.userData.portalId = portal.id

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: portal.color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
      const completeRingMaterial = new THREE.MeshBasicMaterial({
        color: 0xB9_FF_C7,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
      const columnMaterial = new THREE.MeshBasicMaterial({
        color: portal.color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.rotation.x = Math.PI / 2
      const completeRing = new THREE.Mesh(completeRingGeometry, completeRingMaterial)
      completeRing.rotation.x = Math.PI / 2
      completeRing.visible = false

      const column = new THREE.Mesh(columnGeometry, columnMaterial)

      group.add(ring, completeRing, column)

      const y = this._getSurfaceY(portal.anchor.x, portal.anchor.z)
      group.position.set(portal.anchor.x, y + 0.9, portal.anchor.z)

      portal._mesh = group
      portal._completeRing = completeRing
      this._portalMeshes.add(group)
    }
  }

  _activatePortal(portal) {
    if (this.currentWorld !== 'hub')
      return

    this.isPaused = true
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')
    emitter.emit('loading:show', { title: `正在进入：${portal.name}` })

    setTimeout(() => {
      this._enterDungeon(portal)
      this.isPaused = false
      this._emitDungeonState()
      emitter.emit('loading:hide')
    }, 700)
  }

  _enterDungeon(portal) {
    const { x, z } = portal.target
    // 确保目标区域 chunk 加载
    this.chunkManager.updateStreaming({ x, z }, true)
    this.chunkManager.pumpIdleQueue()

    if (!this._dungeonGroup) {
      this._dungeonGroup = new THREE.Group()
      this.scene.add(this._dungeonGroup)
    }
    else {
      this._dungeonGroup.clear()
    }

    // 使用块状生成器构建地牢
    const dungeonInfo = this._blockDungeonGenerator.generate(x, z, portal.id)

    // 不再需要 BoxGeometry 的墙壁，因为已经生成了方块
    // 只需要生成 Exit 标记和 Enemy/Interactables

    const { spawn, exit, enemies, interactables, reward } = dungeonInfo

    // Exit Mesh (保持视觉标记)
    const exitGeometry = new THREE.TorusGeometry(1.15, 0.18, 16, 48)
    const exitMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF_FF_FF,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
    const exitMesh = new THREE.Mesh(exitGeometry, exitMaterial)
    // 稍微浮空一点
    exitMesh.position.set(exit.x, exit.y + 1.2, exit.z)
    exitMesh.rotation.x = Math.PI / 2
    this._dungeonGroup.add(exitMesh)

    this._dungeonExit = {
      mesh: exitMesh,
      x: exit.x,
      z: exit.z,
      range: 3,
    }

    this.currentWorld = 'dungeon'
    this._activeInteractableId = null
    this._activeInteractable = null
    this._dungeonName = portal.name
    this._activeDungeonPortalId = portal.id
    this._dungeonRewardPending = reward || null
    this._dungeonRewardSpawned = false

    // 初始化交互物 (使用 generator 返回的位置)
    this._initDungeonInteractablesV2(interactables, portal.id)

    const saved = this._portalDungeonProgress?.[portal.id]
    if (saved && this._dungeonInteractables) {
      const readCount = Math.min(saved.read ?? 0, this._dungeonInteractables.length)
      for (let i = 0; i < readCount; i++) {
        const item = this._dungeonInteractables[i]
        item.read = true
        if (item.mesh?.material) {
          item.mesh.material.emissiveIntensity = 0.22
          item.mesh.material.roughness = 0.55
          item.mesh.material.metalness = 0.05
        }
        if (item.outline?.material)
          item.outline.material.opacity = 0.45
      }
      if (saved.completed)
        this._dungeonCompleted = true
    }
    this._emitDungeonProgress()
    this._emitDungeonState()

    if (this._dungeonEnemiesGroup) {
      this._dungeonEnemiesGroup.clear()
    }
    else {
      this._dungeonEnemiesGroup = new THREE.Group()
      this._dungeonGroup.add(this._dungeonEnemiesGroup)
    }

    this._dungeonEnemies = []

    // 生成敌人
    enemies.forEach((pos) => {
      // 根据地牢类型选择敌人类型 (TODO: Move logic to a helper or config)
      let enemyType = 'skeleton'
      if (portal.id === 'snow')
        enemyType = 'yeti'
      else if (portal.id === 'plains')
        enemyType = 'goblin'
      else if (portal.id === 'desert')
        enemyType = 'skeleton_armor'
      else if (portal.id === 'forest')
        enemyType = 'zombie'

      // 临时使用 HumanoidEnemy (稍后改造)
      const isBoss = !!pos.isBoss
      const enemy = new HumanoidEnemy({
        position: new THREE.Vector3(pos.x, pos.y + 0.1, pos.z), // 稍微抬高
        rotationY: Math.random() * Math.PI * 2,
        scale: isBoss ? 1.15 : 1,
        colors: { accent: portal.color },
        type: enemyType, // 传递类型
        hp: isBoss ? 12 : 4,
      })
      enemy.isBoss = isBoss
      enemy.behavior = {
        state: 'walk',
        timer: 2 + Math.random() * 2,
        home: { x: pos.x, z: pos.z },
        radius: 4 + Math.random() * 2,
        targetDir: enemy.group.rotation.y,
      }
      enemy.playLocomotion?.()
      enemy.addTo(this._dungeonEnemiesGroup)
      this._dungeonEnemies.push(enemy)
    })

    this._activePortalId = null
    this._activePortal = null
    this._activeDungeonExit = null

    if (this.player?.movement?.config?.respawn?.position) {
      if (!this._savedRespawnPosition)
        this._savedRespawnPosition = { ...this.player.movement.config.respawn.position }
      // 设置重生点为地牢入口
      this.player.movement.config.respawn.position = { x: spawn.x, y: spawn.y + 1.5, z: spawn.z }
    }

    // 传送玩家
    this.player.teleportTo(spawn.x, spawn.y + 1.1, spawn.z)

    if (this.environment) {
      this.environment.params.fogDensity = 0.03
      this.environment.updateFog()
    }

    // 隐藏 Hub 动物
    if (this.animalsGroup)
      this.animalsGroup.visible = false

    // 重要：保持使用 chunkManager 作为碰撞源，不要切换到 _dungeonCollisionProvider
    this.experience.terrainDataManager = this.chunkManager
  }

  _exitDungeon() {
    this.isPaused = true
    this._emitDungeonState()
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')
    emitter.emit('loading:show', { title: '正在返回：超平坦世界' })

    setTimeout(() => {
      const { x, z } = this._hubCenter
      this.chunkManager.updateStreaming({ x, z }, true)
      this.chunkManager.pumpIdleQueue()
      const y = this._getSurfaceY(x, z)
      this.player.teleportTo(x, y + 1.1, z)

      this.currentWorld = 'hub'
      if (this.player?.movement?.config?.respawn?.position && this._savedRespawnPosition) {
        this.player.movement.config.respawn.position = { ...this._savedRespawnPosition }
        this._savedRespawnPosition = null
      }
      this._dungeonCollisionInfo = null
      this.experience.terrainDataManager = this.chunkManager
      this._activeInteractableId = null
      this._activeInteractable = null
      this._activeDungeonExit = null
      this._dungeonExit = null
      this._dungeonInteractables = null
      this._dungeonInteractablesGroup = null
      this._dungeonName = null
      this._dungeonProgress = null
      this._dungeonCompleted = false
      this._activeDungeonPortalId = null
      this._activeDungeonExitPrompt = null
      this._lockedEnemy = null
      this._dungeonRewardPending = null
      this._dungeonRewardSpawned = false
      if (this._dungeonEnemies) {
        for (const enemy of this._dungeonEnemies)
          enemy?.destroy?.()
      }
      this._dungeonEnemies = null
      this._dungeonEnemiesGroup = null
      this._dungeonGroup?.clear?.()
      emitter.emit('dungeon:progress_clear')
      emitter.emit('dungeon:toast_clear')

      if (this.environment) {
        this.environment.params.fogDensity = 0.01
        this.environment.updateFog()
      }

      // 显示 Hub 动物
      if (this.animalsGroup)
        this.animalsGroup.visible = true

      this.isPaused = false
      this._emitDungeonState()
      emitter.emit('loading:hide')
    }, 700)
  }

  _updateDungeonExit() {
    if (this.currentWorld !== 'dungeon' || !this._dungeonExit || !this.player)
      return

    if (this._activeInteractableId !== null) {
      if (this._activeDungeonExit) {
        this._activeDungeonExit = null
        emitter.emit('portal:prompt_clear')
      }
      return
    }

    const pos = this.player.getPosition()
    const dx = pos.x - this._dungeonExit.x
    const dz = pos.z - this._dungeonExit.z
    const d2 = dx * dx + dz * dz
    const shouldActivate = d2 <= this._dungeonExit.range * this._dungeonExit.range

    if (shouldActivate) {
      const progress = this._dungeonProgress
      const total = progress?.total ?? 0
      const read = progress?.read ?? 0
      const hint = total > 0 && read < total
        ? `按 E 返回（未读 ${total - read}/${total}）`
        : total > 0
          ? '按 E 返回（探索完成）'
          : '按 E 返回'
      const payload = { title: '返回超平坦', hint }

      if (!this._activeDungeonExit)
        this._activeDungeonExit = this._dungeonExit
      if (!this._activeDungeonExitPrompt || this._activeDungeonExitPrompt.hint !== payload.hint) {
        this._activeDungeonExitPrompt = payload
        emitter.emit('portal:prompt', payload)
      }
    }
    else if (this._activeDungeonExit) {
      this._activeDungeonExit = null
      this._activeDungeonExitPrompt = null
      emitter.emit('portal:prompt_clear')
    }

    if (this._dungeonExit.mesh)
      this._dungeonExit.mesh.rotation.y += 0.02
  }

  _initDungeonInteractablesV2(positions, portalId) {
    if (!this._dungeonGroup)
      return

    this._dungeonInteractablesGroup = new THREE.Group()
    this._dungeonGroup.add(this._dungeonInteractablesGroup)

    const itemConfigs = [
      {
        title: '裂纹石板',
        description: '石板上布满指痕，像是有人反复确认出口的位置。',
      },
      {
        title: '回声碎片',
        description: '你听见一句低语：别相信第一扇门。',
      },
    ]

    this._dungeonInteractables = positions.map((pos, index) => {
      const config = itemConfigs[index % itemConfigs.length]
      const id = `dungeon-${portalId}-${index}`

      let mesh
      const resource = this.resources.items.chest_closed
      if (resource) {
        mesh = resource.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else {
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
        const material = new THREE.MeshStandardMaterial({ color: 0xFFD700 })
        mesh = new THREE.Mesh(geometry, material)
      }

      // 确保箱子在地板上
      mesh.position.set(pos.x, pos.y + 0.5, pos.z) // box center is 0.5 up? GLTF origin is usually bottom.
      // If GLTF origin is bottom, then pos.y is fine. If center, pos.y + height/2.
      // Chest model usually bottom origin.
      // But let's assume bottom for now.

      this._dungeonInteractablesGroup.add(mesh)

      return {
        id,
        title: config.title,
        description: config.description,
        x: pos.x,
        z: pos.z,
        mesh,
        range: 2.6,
        read: false,
      }
    })
  }

  _updateDungeonInteractables() {
    if (this.currentWorld !== 'dungeon' || !this.player || !this._dungeonInteractables || this._dungeonInteractables.length === 0)
      return

    const pos = this.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const item of this._dungeonInteractables) {
      const dx = pos.x - item.x
      const dz = pos.z - item.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = item
      }
    }

    const shouldActivate = best && bestD2 <= best.range * best.range

    if (shouldActivate) {
      if (this._activeInteractableId !== best.id) {
        this._activeInteractableId = best.id
        this._activeInteractable = best
        emitter.emit('interactable:prompt', { title: best.title, hint: best.read ? '按 E 回顾' : '按 E 查看' })
      }
    }
    else if (this._activeInteractableId !== null && this._activeInteractable && this._activeInteractableId.startsWith('dungeon-')) {
      this._activeInteractableId = null
      this._activeInteractable = null
      emitter.emit('interactable:prompt_clear')
    }

    for (const item of this._dungeonInteractables) {
      if (item.outline)
        item.outline.visible = item.id === this._activeInteractableId
      if (item.mesh)
        item.mesh.rotation.y += 0.01
      if (item.outline && item.mesh)
        item.outline.rotation.y = item.mesh.rotation.y
    }
  }

  _initInteractables() {
    this._interactablesGroup = new THREE.Group()
    this.scene.add(this._interactablesGroup)

    const centerX = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)
    const centerZ = Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)

    const items = [
      {
        id: 'story-1',
        title: '古旧纸条',
        description: '“在紫色门后，回声会说出你的名字。”',
        x: centerX + 4,
        z: centerZ + 4,
      },
      {
        id: 'story-2',
        title: '破损徽章',
        description: '徽章背面刻着一行小字：别回头。',
        x: centerX - 4,
        z: centerZ + 4,
      },
      {
        id: 'story-3',
        title: '黯淡水晶',
        description: '它在你靠近时微微发热，像在等待被唤醒。',
        x: centerX,
        z: centerZ - 6,
      },
    ]

    // Use Chest Model for Hub Interactables
    this.interactables = items.map((item) => {
      let mesh
      const resource = this.resources.items.chest_closed
      if (resource) {
        mesh = resource.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else {
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshStandardMaterial({
          color: 0x9B_6B_FF,
          emissive: new THREE.Color(0x9B_6B_FF),
          emissiveIntensity: 0.6,
          roughness: 0.35,
          metalness: 0.1,
        })
        mesh = new THREE.Mesh(geometry, material)
      }

      const outlineGeometry = new THREE.BoxGeometry(1.08, 1.08, 1.08)
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0xFF_FF_FF,
        transparent: true,
        opacity: 0.9,
        wireframe: true,
        depthWrite: false,
      })
      const outline = new THREE.Mesh(outlineGeometry, outlineMaterial)
      outline.visible = false

      const y = this._getSurfaceY(item.x, item.z)
      // Adjust Y based on model pivot
      mesh.position.set(item.x, y + 0.5, item.z)
      outline.position.copy(mesh.position)

      this._interactablesGroup.add(mesh, outline)

      return {
        ...item,
        mesh,
        outline,
        range: 2.6,
        read: false,
      }
    })
  }

  _updateInteractables() {
    if (!this.player || !this.interactables || this.interactables.length === 0)
      return

    const pos = this.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const item of this.interactables) {
      const dx = pos.x - item.x
      const dz = pos.z - item.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = item
      }
    }

    const shouldActivate = best && bestD2 <= best.range * best.range

    if (shouldActivate) {
      if (this._activeInteractableId !== best.id) {
        this._activeInteractableId = best.id
        this._activeInteractable = best
        emitter.emit('interactable:prompt', { title: best.title, hint: best.read ? '按 E 回顾' : '按 E 查看' })
      }
    }
    else if (this._activeInteractableId !== null) {
      this._activeInteractableId = null
      this._activeInteractable = null
      emitter.emit('interactable:prompt_clear')
    }

    for (const item of this.interactables) {
      if (item.outline)
        item.outline.visible = item.id === this._activeInteractableId
      if (item.mesh) {
        item.mesh.rotation.y += 0.01
      }
      if (item.outline) {
        item.outline.rotation.y = item.mesh.rotation.y
      }
    }
  }

  _initAnimals() {
    this.animals = []
    this.animalsGroup = new THREE.Group()
    this.scene.add(this.animalsGroup)

    const types = ['animal_pig', 'animal_sheep', 'animal_chicken', 'animal_cat', 'animal_wolf', 'animal_horse', 'animal_dog']
    const count = 15

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)]
      // Random position within safe range
      const range = 40
      const x = (Math.random() - 0.5) * 2 * range
      const z = (Math.random() - 0.5) * 2 * range

      const y = this._getSurfaceY(x, z)

      const animal = new HumanoidEnemy({
        position: new THREE.Vector3(x, y, z),
        scale: 0.8,
        type,
      })

      animal.group.rotation.y = Math.random() * Math.PI * 2
      animal.addTo(this.animalsGroup)

      // Custom behavior state
      animal.behavior = {
        state: 'idle',
        timer: Math.random() * 5,
      }

      this.animals.push(animal)
    }
  }

  _updateAnimals() {
    if (!this.animals)
      return

    const dt = this.experience.time.delta * 0.001

    this.animals.forEach((animal) => {
      animal.update()

      if (!animal.behavior)
        return

      const data = animal.behavior
      data.timer -= dt

      if (data.timer <= 0) {
        if (data.state === 'idle') {
          data.state = 'walk'
          data.timer = 2 + Math.random() * 3
          animal.playAnimation('Walk')
          data.targetDir = Math.random() * Math.PI * 2
          animal.group.rotation.y = data.targetDir
        }
        else {
          data.state = 'idle'
          data.timer = 3 + Math.random() * 4
          animal.playAnimation('Idle')
        }
      }

      if (data.state === 'walk') {
        const speed = 1.5 * dt
        animal.group.translateZ(speed)

        const pos = animal.group.position
        const groundY = this._getSurfaceY(pos.x, pos.z)
        // Smooth lerp Y
        animal.group.position.y += (groundY - animal.group.position.y) * 0.1
      }
    })
  }

  _updateDungeonEnemies() {
    if (!this._dungeonEnemies || this.currentWorld !== 'dungeon')
      return

    const dt = this.experience.time.delta * 0.001
    const now = this.experience.time?.elapsed ?? 0
    const playerPos = this.player?.getPosition?.()
    const playerDead = !!this.player?.isDead

    for (const enemy of this._dungeonEnemies) {
      enemy?.update?.()

      if (enemy?.isBoss && enemy?.isDead) {
        if (!this._dungeonRewardSpawned)
          this._spawnDungeonReward()
      }
      if (enemy?.isDead)
        continue

      const data = enemy?.behavior
      if (!data || !enemy?.group)
        continue

      if (playerPos && !playerDead && !enemy.isDead) {
        const ex = enemy.group.position.x
        const ez = enemy.group.position.z
        const dxp = playerPos.x - ex
        const dzp = playerPos.z - ez
        const d2p = dxp * dxp + dzp * dzp
        const aggro2 = 9.0 * 9.0
        const attack2 = 2.2 * 2.2

        if (d2p <= aggro2) {
          const len = Math.hypot(dxp, dzp)
          const nx = len > 0.0001 ? (dxp / len) : 0
          const nz = len > 0.0001 ? (dzp / len) : 1

          const facing = Math.atan2(dxp, dzp)
          enemy.group.rotation.y = facing

          if (d2p > attack2) {
            data.state = 'chase'
            enemy.playWalk?.() || enemy.playAnimation?.('Walk')
            const speed = (enemy.isBoss ? 1.55 : 1.35) * dt
            enemy.group.position.x += nx * speed
            enemy.group.position.z += nz * speed
          }
          else {
            data.state = 'attack'
            enemy.tryAttack?.({ now, damage: enemy.isBoss ? 2 : 1, range: enemy.isBoss ? 2.35 : 2.1, windupMs: enemy.isBoss ? 220 : 260 })
          }

          const hit = enemy.consumeAttackHit?.({ now })
          if (hit && this.player?.takeDamage) {
            const source = new THREE.Vector3(enemy.group.position.x, enemy.group.position.y, enemy.group.position.z)
            this.player.takeDamage({ amount: hit.damage, canBeBlocked: true, sourcePosition: source })
          }

          const pos = enemy.group.position
          const groundY = this._getSurfaceY(pos.x, pos.z)
          enemy.group.position.y += (groundY - enemy.group.position.y) * 0.18
          continue
        }
      }

      data.timer -= dt

      if (data.timer <= 0) {
        if (data.state === 'idle') {
          data.state = 'walk'
          data.timer = 2 + Math.random() * 3
          data.targetDir = Math.random() * Math.PI * 2
          enemy.group.rotation.y = data.targetDir
          enemy.playWalk?.() || enemy.playAnimation?.('Walk')
        }
        else {
          data.state = 'idle'
          data.timer = 1.5 + Math.random() * 2.5
          enemy.playAnimation?.('Idle')
        }
      }

      if (data.state === 'walk') {
        const speed = 1.2 * dt
        enemy.group.translateZ(speed)

        const pos = enemy.group.position
        const dx = pos.x - data.home.x
        const dz = pos.z - data.home.z
        const d2 = dx * dx + dz * dz
        const radius = data.radius ?? 5
        if (d2 > radius * radius) {
          const backDir = Math.atan2(data.home.x - pos.x, data.home.z - pos.z)
          data.targetDir = backDir
          enemy.group.rotation.y = backDir
        }

        const groundY = this._getSurfaceY(pos.x, pos.z)
        enemy.group.position.y += (groundY - enemy.group.position.y) * 0.15
      }
    }
  }

  _updatePortals() {
    if (!this.player || !this.portals || this.portals.length === 0)
      return
    if (this._activeInteractableId !== null) {
      if (this._activePortalId !== null) {
        this._activePortalId = null
        this._activePortal = null
        emitter.emit('portal:prompt_clear')
      }
      return
    }
    if (this.currentWorld !== 'hub')
      return

    const pos = this.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const portal of this.portals) {
      const dx = pos.x - portal.anchor.x
      const dz = pos.z - portal.anchor.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = portal
      }
    }

    const activationD2 = 3.0 * 3.0
    const shouldActivate = best && bestD2 <= activationD2

    if (shouldActivate) {
      if (this._activePortalId !== best.id) {
        this._activePortalId = best.id
        this._activePortal = best
        const saved = this._portalDungeonProgress?.[best.id]
        const total = saved?.total ?? 0
        const read = saved?.read ?? 0
        const progressText = total > 0 ? ` · ${read}/${total}` : ''
        const suffix = saved?.completed ? ' · 已完成' : ''
        emitter.emit('portal:prompt', { title: best.name, hint: `按 E 传送${suffix}${progressText}` })
      }
    }
    else if (this._activePortalId !== null) {
      this._activePortalId = null
      this._activePortal = null
      emitter.emit('portal:prompt_clear')
    }

    for (const portal of this.portals) {
      const saved = this._portalDungeonProgress?.[portal.id]
      if (portal._completeRing)
        portal._completeRing.visible = !!saved?.completed
      if (portal._mesh)
        portal._mesh.rotation.y += 0.01
    }
  }

  update() {
    if (this.isPaused)
      return

    // Step2：先做 chunk streaming，确保玩家碰撞查询能尽量命中已加载 chunk
    if (this.chunkManager && this.player) {
      const pos = this.player.getPosition()
      this.chunkManager.updateStreaming({ x: pos.x, z: pos.z })
      this.chunkManager.pumpIdleQueue()
    }

    // 更新动画材质（树叶摇摆等）
    if (this.chunkManager)
      this.chunkManager.update()

    if (this.player)
      this.player.update()
    if (this.floor)
      this.floor.update()
    if (this.environment)
      this.environment.update()

    // 每帧射线检测：用于 hover 提示与后续交互
    if (this.blockRaycaster)
      this.blockRaycaster.update()

    // 更新辅助框位置
    if (this.blockSelectionHelper)
      this.blockSelectionHelper.update()

    if (this.currentWorld === 'hub') {
      this._updateInteractables()
      this._updatePortals()
      this._updateAnimals()

      if (!this.player)
        return

      const pos = this.player.getPosition()
      const dx = pos.x - this._hubCenter.x
      const dz = pos.z - this._hubCenter.z
      const d2 = dx * dx + dz * dz
      const radius = 50
      if (d2 > radius * radius) {
        const d = Math.sqrt(d2)
        const nx = dx / d
        const nz = dz / d
        const clampedX = this._hubCenter.x + nx * (radius - 0.5)
        const clampedZ = this._hubCenter.z + nz * (radius - 0.5)
        const y = this._getSurfaceY(clampedX, clampedZ)
        this.player.teleportTo(clampedX, y + 1.1, clampedZ)
      }
    }
    else if (this.currentWorld === 'dungeon') {
      this._updateDungeonInteractables()
      this._updateDungeonExit()
      this._updateLockOn()
      this._updateDungeonEnemies()
      this._resolvePlayerEnemyCollisions()
    }
  }

  _resolvePlayerEnemyCollisions() {
    if (this.currentWorld !== 'dungeon')
      return
    const movement = this.player?.movement
    if (!movement || !this._dungeonEnemies || this._dungeonEnemies.length === 0)
      return

    const base = movement.position
    const pr = movement.capsule?.radius ?? 0.3
    const v = movement.worldVelocity
    for (const enemy of this._dungeonEnemies) {
      if (!enemy?.group || enemy.isDead)
        continue
      const er = enemy.hitRadius ?? 0.9
      const r = pr + er

      const dx = base.x - enemy.group.position.x
      const dz = base.z - enemy.group.position.z
      const d2 = dx * dx + dz * dz
      if (d2 <= 0.000001 || d2 >= r * r)
        continue

      const d = Math.sqrt(d2)
      const nx = dx / d
      const nz = dz / d
      const overlap = r - d

      base.x += nx * overlap
      base.z += nz * overlap
      movement.group.position.copy(base)

      if (v) {
        const vn = v.x * nx + v.z * nz
        if (vn < 0) {
          v.x -= vn * nx
          v.z -= vn * nz
        }
      }
    }
  }

  destroy() {
    // Destroy child components
    this.blockSelectionHelper?.dispose()
    this.blockRaycaster?.destroy()
    this.environment?.destroy()
    this.cameraRig?.destroy()
    this.player?.destroy()
    this.chunkManager?.destroy()
    this._portalMeshes?.clear?.()
    this._portalMeshes?.removeFromParent?.()
    this._interactablesGroup?.clear?.()
    this._interactablesGroup?.removeFromParent?.()
    this._dungeonGroup?.clear?.()
    this._dungeonGroup?.removeFromParent?.()
    if (this._onInteract)
      emitter.off('input:interact', this._onInteract)
    if (this._onInteractableClose)
      emitter.off('interactable:close', this._onInteractableClose)
    if (this._onQuickReturn)
      emitter.off('input:quick_return', this._onQuickReturn)
    if (this._onPause)
      emitter.off('game:pause', this._onPause)
    if (this._onResume)
      emitter.off('game:resume', this._onResume)
    if (this._onPunchStraight)
      emitter.off('input:punch_straight', this._onPunchStraight)
    if (this._onPunchHook)
      emitter.off('input:punch_hook', this._onPunchHook)

    // Clear terrainDataManager reference
    if (this.experience.terrainDataManager === this.chunkManager) {
      this.experience.terrainDataManager = null
    }
  }

  _clearLockOn() {
    if (!this._lockedEnemy)
      return
    this._lockedEnemy.setLocked?.(false)
    this._lockedEnemy = null
    this.cameraRig?.setLookAtOverride?.(null)
    emitter.emit('combat:lock_clear')
  }

  _isEnemyInFront(enemy, range, minDot) {
    if (!enemy?.group || !this.player)
      return false

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)

    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const d2 = dx * dx + dz * dz
    const hitRadius = enemy.hitRadius ?? 0
    const effectiveRange = range + hitRadius
    if (d2 > effectiveRange * effectiveRange)
      return false

    const len = Math.sqrt(d2)
    if (len < 0.0001)
      return true

    const facing = this.player.getFacingAngle?.() ?? 0
    const fx = Math.sin(facing)
    const fz = Math.cos(facing)

    const nx = dx / len
    const nz = dz / len
    const dot = fx * nx + fz * nz
    if (dot >= minDot)
      return true
    return hitRadius > 0 && len <= hitRadius * 1.05
  }

  _getBestDungeonEnemyForAttack(range, minDot) {
    if (!this._dungeonEnemies || !this.player)
      return null

    let best = null
    let bestD2 = Infinity
    const p = this.player.getPosition()
    const facing = this.player.getFacingAngle?.() ?? 0
    const fx = Math.sin(facing)
    const fz = Math.cos(facing)

    for (const enemy of this._dungeonEnemies) {
      if (!enemy?.group || enemy.isDead)
        continue

      const epos = new THREE.Vector3()
      enemy.group.getWorldPosition(epos)
      const dx = epos.x - p.x
      const dz = epos.z - p.z
      const d2 = dx * dx + dz * dz
      const hitRadius = enemy.hitRadius ?? 0
      const effectiveRange = range + hitRadius
      if (d2 > effectiveRange * effectiveRange)
        continue

      const len = Math.sqrt(d2)
      if (len > 0.0001) {
        const nx = dx / len
        const nz = dz / len
        const dot = fx * nx + fz * nz
        if (dot < minDot && !(hitRadius > 0 && len <= hitRadius * 1.05))
          continue
      }

      if (d2 < bestD2) {
        bestD2 = d2
        best = enemy
      }
    }

    return best
  }

  _getNearestDungeonEnemyInRange(range) {
    if (!this._dungeonEnemies || !this.player)
      return null

    let best = null
    let bestD2 = Infinity
    const p = this.player.getPosition()

    for (const enemy of this._dungeonEnemies) {
      if (!enemy?.group || enemy.isDead)
        continue

      const epos = new THREE.Vector3()
      enemy.group.getWorldPosition(epos)
      const dx = epos.x - p.x
      const dz = epos.z - p.z
      const d2 = dx * dx + dz * dz
      const hitRadius = enemy.hitRadius ?? 0
      const effectiveRange = range + hitRadius
      if (d2 > effectiveRange * effectiveRange)
        continue

      if (d2 < bestD2) {
        bestD2 = d2
        best = enemy
      }
    }

    return best
  }

  _spawnDungeonReward() {
    if (this.currentWorld !== 'dungeon')
      return
    if (this._dungeonRewardSpawned || !this._dungeonRewardPending)
      return
    if (!this._dungeonGroup)
      return

    if (!this._dungeonInteractables)
      this._dungeonInteractables = []
    if (!this._dungeonInteractablesGroup) {
      this._dungeonInteractablesGroup = new THREE.Group()
      this._dungeonGroup.add(this._dungeonInteractablesGroup)
    }

    const portalId = this._activeDungeonPortalId || 'dungeon'
    const index = this._dungeonInteractables.length
    const id = `dungeon-${portalId}-${index}`

    let mesh
    const resource = this.resources.items.chest_closed
    if (resource) {
      mesh = resource.scene.clone()
      mesh.scale.set(0.5, 0.5, 0.5)
    }
    else {
      const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
      const material = new THREE.MeshStandardMaterial({ color: 0xFFD700 })
      mesh = new THREE.Mesh(geometry, material)
    }

    mesh.position.set(this._dungeonRewardPending.x, this._dungeonRewardPending.y + 0.5, this._dungeonRewardPending.z)
    this._dungeonInteractablesGroup.add(mesh)

    this._dungeonInteractables.push({
      id,
      title: '任务宝箱',
      description: '你听见机关松动的声音，宝箱出现了。',
      x: this._dungeonRewardPending.x,
      z: this._dungeonRewardPending.z,
      mesh,
      range: 2.6,
      read: false,
    })

    this._dungeonRewardSpawned = true
    this._emitDungeonProgress()
    this._emitDungeonState()
  }

  _tryPlayerAttack({ damage, range, minDot, cooldownMs }) {
    if (this.isPaused)
      return
    if (this.currentWorld !== 'dungeon')
      return
    if (!this.player || !this._dungeonEnemies || this._dungeonEnemies.length === 0)
      return

    const now = this.experience.time?.elapsed ?? 0
    if (now < this._playerAttackCooldownUntil)
      return
    this._playerAttackCooldownUntil = now + (cooldownMs ?? 250)

    let target = null
    if (this._lockedEnemy && !this._lockedEnemy.isDead && this._isEnemyInFront(this._lockedEnemy, range, minDot))
      target = this._lockedEnemy
    if (!target)
      target = this._getBestDungeonEnemyForAttack(range, minDot)
    if (!target)
      target = this._getNearestDungeonEnemyInRange((range ?? 2.4) * 0.75)
    if (!target)
      return

    const hit = target.takeDamage?.(damage ?? 1)
    if (!hit)
      return

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    target.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const len = Math.hypot(dx, dz)
    if (len > 0.0001) {
      target.group.position.x += (dx / len) * 0.18
      target.group.position.z += (dz / len) * 0.18
    }

    if (target.isDead) {
      if (this._lockedEnemy === target)
        this._clearLockOn()
    }
  }
}
