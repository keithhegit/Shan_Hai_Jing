import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
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
    this._dungeonSurfaceY = null
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

    this._inventory = this._loadInventory()
    this._inventoryConfig = {
      backpack: { slots: 24, maxWeight: 60 },
      grid: { cols: 8, rows: 6 },
      itemSizes: {
        canister_small: { w: 1, h: 1 },
        canister_medium: { w: 1, h: 2 },
        canister_large: { w: 2, h: 2 },
      },
      itemWeights: {
        stone: 1,
        fence: 4,
        coin: 0,
        crystal_big: 6,
        crystal_small: 3,
        canister_small: 4,
        canister_medium: 8,
        canister_large: 16,
        material_gun: 2,
        Axe_Wood: 4,
        Axe_Stone: 5,
        Axe_Gold: 4,
        Axe_Diamond: 6,
        Pickaxe_Wood: 4,
        Pickaxe_Stone: 5,
        Pickaxe_Gold: 4,
        Pickaxe_Diamond: 6,
        Shovel_Wood: 3,
        Shovel_Stone: 4,
        Shovel_Gold: 3,
        Shovel_Diamond: 5,
        Sword_Wood: 3,
        Sword_Stone: 4,
        Sword_Gold: 3,
        Sword_Diamond: 5,
      },
    }
    this._toolLootPool = [
      'Axe_Wood',
      'Axe_Stone',
      'Axe_Gold',
      'Axe_Diamond',
      'Pickaxe_Wood',
      'Pickaxe_Stone',
      'Pickaxe_Gold',
      'Pickaxe_Diamond',
      'Shovel_Wood',
      'Shovel_Stone',
      'Shovel_Gold',
      'Shovel_Diamond',
      'Sword_Wood',
      'Sword_Stone',
      'Sword_Gold',
      'Sword_Diamond',
    ]
    this._inventorySaveTimer = null
    this._activeInventoryPanel = null
    this._lockedChests = this._loadLockedChests()
    this._lockedChestsSaveTimer = null
    this._activeChestId = null

    this._carriedAnimal = null
    this._hubAutomation = null
    this._hubAutomationGroup = null
    this._hubDrops = []
    this._hubDropsGroup = null
    this._hubDropSeq = 1
    this._hubDropGeo = null
    this._hubDropMaterials = null
    this._nameLabelEntries = []
    this._nameLabelCamPos = new THREE.Vector3()
    this._nameLabelTargetPos = new THREE.Vector3()
    this._isMaterialGunEquipped = false
    this._isMaterialGunFiring = false
    this._materialGunLastDamageAt = 0
    this._materialGunBeam = null
    this._materialGunBeamPositions = new Float32Array(6)
    this._captureBeam = null
    this._captureBeamPositions = new Float32Array(6)
    this._captureState = null
    this._captureTarget = null
    this._captureHolding = false
    this._captureStartAt = 0
    this._captureDurationMs = 4000
    this._captureCooldownUntil = 0
    this._canisterVisualGroup = null
    this._heartHud = null
    this._heartHudBase = null
    this._heartHudBaseScale = 0.2
    this._heartHudBasePos = new THREE.Vector3(0, -0.32, -1.0)
    this._heartHudLowHp = false
    this._npcStats = this._createNpcStatsTable()

    this._initMaterialGunBeam()
    this._initCaptureBeam()

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
      this._initCanisterVisuals()
      this._applyBurdenEffects()

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
      this._onToggleBlockEditMode = () => {
        this.blockEditMode = this.blockEditMode === 'remove' ? 'add' : 'remove'
        emitter.emit('game:block_edit_mode_changed', { mode: this.blockEditMode })
      }
      emitter.on('input:toggle_block_edit_mode', this._onToggleBlockEditMode)

      // ===== 交互事件绑定：删除/新增方块 =====
      this._onMouseDown = (event) => {
        if (event.button === 2) {
          this._throwCarriedAnimal()
          return
        }
        if (event.button === 0) {
          if (this._isMaterialGunEquipped)
            this._startMaterialGunFire()
          else
            this._fireMatterGun()
        }
      }
      emitter.on('input:mouse_down', this._onMouseDown)

      this._onMouseUp = (event) => {
        if (event.button === 0)
          this._stopMaterialGunFire()
      }
      emitter.on('input:mouse_up', this._onMouseUp)

      this._onLockOn = () => {
        this._toggleLockOn()
      }
      emitter.on('input:lock_on', this._onLockOn)

      this._onCaptureInput = (payload) => {
        const pressed = !!payload?.pressed
        this._captureHolding = pressed
        if (pressed)
          this._tryStartCapture()
        else
          this._breakCapture({ reason: 'release', healTarget: false })
      }
      emitter.on('input:capture', this._onCaptureInput)

      this._onPlayerDamaged = () => {
        this._breakCapture({ reason: 'damaged', healTarget: true })
      }
      emitter.on('combat:player_damaged', this._onPlayerDamaged)

      this._onPunchStraight = () => {
        if (this.player?.isBlocking || !!this.player?.inputState?.c)
          return
        this._tryPlayerAttack({ damage: 1, range: 2.6, minDot: 0.35, cooldownMs: 220 })
      }
      this._onPunchHook = () => {
        if (this.player?.isBlocking || !!this.player?.inputState?.c)
          return
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
      this._initHubAutomation()
      this._initAnimals()

      this._onInteract = () => {
        if (this.isPaused)
          return
        if (this._activeInteractable) {
          if (this._activeInteractable.pickupItemId) {
            if (this._activeInteractable.read) {
              this._activeInteractableId = null
              this._activeInteractable = null
              emitter.emit('interactable:prompt_clear')
              emitter.emit('portal:prompt_clear')
              return
            }
            const itemId = this._activeInteractable.pickupItemId
            const count = Math.max(1, Math.floor(Number(this._activeInteractable.pickupAmount) || 1))
            if (this._canAddToBackpack(itemId, count)) {
              this._addInventoryItem('backpack', itemId, count)
              emitter.emit('dungeon:toast', { text: `获得：${this._getModelFilenameByResourceKey(itemId)} x${count}（已放入背包）` })
            }
            else {
              if (this.currentWorld === 'dungeon') {
                emitter.emit('dungeon:toast', { text: `背包已满或超重：${this._getModelFilenameByResourceKey(itemId)} x${count}` })
                return
              }
              this._addInventoryItem('warehouse', itemId, count)
              emitter.emit('dungeon:toast', { text: `背包已满或超重：${this._getModelFilenameByResourceKey(itemId)} x${count}（已入库）` })
            }

            this._activeInteractable.read = true
            if (this._activeInteractable.mesh) {
              this._activeInteractable.mesh.visible = false
              this._activeInteractable.mesh.parent?.remove?.(this._activeInteractable.mesh)
            }
            if (this._activeInteractable.outline) {
              this._activeInteractable.outline.visible = false
              this._activeInteractable.outline.parent?.remove?.(this._activeInteractable.outline)
            }
            if (this.currentWorld === 'dungeon')
              this._emitDungeonProgress()
            this._scheduleInventorySave()
            this._emitInventorySummary()
            this._emitInventoryState()
            this._activeInteractable.range = 0
            this._activeInteractableId = null
            this._activeInteractable = null
            emitter.emit('interactable:prompt_clear')
            emitter.emit('portal:prompt_clear')
            return
          }
          if (this._activeInteractable.openInventoryPanel) {
            this._toggleInventoryPanel(this._activeInteractable.openInventoryPanel)
            emitter.emit('interactable:prompt_clear')
            emitter.emit('portal:prompt_clear')
            return
          }
          if (this._activeInteractable.lockedChestId) {
            this._openLockedChest(this._activeInteractable.lockedChestId)
            emitter.emit('interactable:prompt_clear')
            emitter.emit('portal:prompt_clear')
            return
          }
          this.isPaused = true
          this.experience.pointerLock?.exitLock?.()
          this._openedInteractableId = this._activeInteractable.id
          const payload = {
            id: this._activeInteractable.id,
            title: this._activeInteractable.title,
            description: this._activeInteractable.description,
          }
          if (this._activeInteractable.title === '任务宝箱' && !this._activeInteractable.read) {
            payload.actions = [
              { id: 'claim_reward', label: '领取奖励' },
            ]
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
          this._openDungeonSelect()
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

      this._onInteractableAction = (payload) => {
        if (!payload?.id || !payload?.action)
          return
        if (payload.action !== 'claim_reward')
          return
        const item = (this._dungeonInteractables || []).find(i => i.id === payload.id)
          || (this.interactables || []).find(i => i.id === payload.id)
        if (!item || item.title !== '任务宝箱' || item.read)
          return

        this._addInventoryItem('backpack', 'fence', 1)
        const pool = this._toolLootPool || []
        if (pool.length > 0) {
          const toolId = pool[Math.floor(Math.random() * pool.length)]
          if (this._canAddToBackpack(toolId, 1)) {
            this._addInventoryItem('backpack', toolId, 1)
            emitter.emit('dungeon:toast', { text: `获得：${this._getModelFilenameByResourceKey(toolId)} x1（已放入背包）` })
          }
          else {
            this._addInventoryItem('warehouse', toolId, 1)
            emitter.emit('dungeon:toast', { text: `背包已满或超重：${this._getModelFilenameByResourceKey(toolId)} x1（已入库）` })
          }
        }
        item.read = true
        if (item.mesh) {
          item.mesh.visible = false
          item.mesh.parent?.remove?.(item.mesh)
        }
        if (item.outline) {
          item.outline.visible = false
          item.outline.parent?.remove?.(item.outline)
        }
        if (this.currentWorld === 'dungeon')
          this._emitDungeonProgress()
        emitter.emit('dungeon:toast', { text: '获得：Fence x1（已放入背包）' })
        this._scheduleInventorySave()
        this._emitInventorySummary()
        this._emitInventoryState()
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
      emitter.on('interactable:action', this._onInteractableAction)
      emitter.on('input:quick_return', this._onQuickReturn)
      emitter.on('game:pause', this._onPause)
      emitter.on('game:resume', this._onResume)

      this._onToggleBackpack = () => {
        this._toggleBackpackPanel()
      }
      this._onToggleWarehouse = () => {
        this._toggleInventoryPanel('warehouse')
      }
      this._onInventoryClose = () => {
        this._closeInventoryPanel()
      }
      this._onInventoryTransfer = (payload) => {
        this._transferInventory(payload)
      }
      this._onInventoryEquip = (payload) => {
        this._equipInventoryItem(payload)
      }
      this._onGrabPet = () => {
        this._toggleCarryAnimal()
      }

      emitter.on('input:toggle_backpack', this._onToggleBackpack)
      emitter.on('input:toggle_warehouse', this._onToggleWarehouse)
      emitter.on('inventory:close', this._onInventoryClose)
      emitter.on('inventory:transfer', this._onInventoryTransfer)
      emitter.on('inventory:equip', this._onInventoryEquip)
      emitter.on('input:grab_pet', this._onGrabPet)

      this._onChestClose = (payload) => {
        const id = payload?.id || this._activeChestId
        if (id && this._activeChestId === id) {
          this._activeChestId = null
        }
        if (this.isPaused) {
          this.isPaused = false
          this._emitDungeonState()
          this.experience.pointerLock?.requestLock?.()
        }
      }
      this._onChestUseKey = (payload) => {
        this._useKeyForLockedChest(payload)
      }
      this._onChestTakeItem = (payload) => {
        this._takeLockedChestLoot(payload)
      }

      emitter.on('chest:close', this._onChestClose)
      emitter.on('chest:use_key', this._onChestUseKey)
      emitter.on('chest:take', this._onChestTakeItem)

      this._onPortalSelectClose = () => {
        if (this.currentWorld !== 'hub')
          return
        if (this.isPaused) {
          this.isPaused = false
          this._emitDungeonState()
          this.experience.pointerLock?.requestLock?.()
        }
      }
      this._onPortalSelect = (payload) => {
        if (this.currentWorld !== 'hub')
          return
        const id = payload?.id
        if (!id)
          return
        const portal = (this._dungeonPortals || []).find(p => p?.id === id)
        if (!portal)
          return
        this._activatePortal(portal)
      }

      emitter.on('portal:select_close', this._onPortalSelectClose)
      emitter.on('portal:select', this._onPortalSelect)

      this._ensureStarterMatterGun()
      this._emitInventorySummary()
    })
  }

  _createNpcStatsTable() {
    return {
      animal_chicken: { hp: 2, damage: 1, speed: 1.9, aggroRadius: 8, attackRange: 2.0, windupMs: 300 },
      animal_pig: { hp: 4, damage: 1, speed: 1.7, aggroRadius: 8, attackRange: 2.0, windupMs: 300 },
      animal_sheep: { hp: 4, damage: 1, speed: 1.65, aggroRadius: 8, attackRange: 2.0, windupMs: 300 },
      animal_cat: { hp: 3, damage: 1, speed: 2.2, aggroRadius: 8, attackRange: 2.0, windupMs: 280 },
      animal_dog: { hp: 5, damage: 2, speed: 2.15, aggroRadius: 9, attackRange: 2.1, windupMs: 260 },
      animal_horse: { hp: 6, damage: 2, speed: 2.35, aggroRadius: 9, attackRange: 2.15, windupMs: 260 },
      animal_wolf: { hp: 8, damage: 3, speed: 2.45, aggroRadius: 10, attackRange: 2.25, windupMs: 240 },
      enemy_default: { hp: 4, damage: 1, speed: 1.35, aggroRadius: 9, attackRange: 2.1, windupMs: 260 },
      material_gun: { tickMs: 900, tickDamage: 1, maxRange: 24 },
    }
  }

  _initMaterialGunBeam() {
    const radius = 0.09
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xFF_3B_3B,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const beam = new THREE.Mesh(geo, mat)
    beam.frustumCulled = false
    beam.visible = false
    this._materialGunBeam = beam
    this.scene.add(beam)
  }

  _initCaptureBeam() {
    const radius = 0.07
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x66FFAA,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const beam = new THREE.Mesh(geo, mat)
    beam.frustumCulled = false
    beam.visible = false
    this._captureBeam = beam
    this.scene.add(beam)
  }

  _initCanisterVisuals() {
    if (!this.player?.movement?.group)
      return
    if (this._canisterVisualGroup)
      this._canisterVisualGroup.removeFromParent?.()
    this._canisterVisualGroup = new THREE.Group()
    this._canisterVisualGroup.frustumCulled = false
    const anchor = this._findPlayerBackAnchor() || this.player.movement.group
    anchor.add(this._canisterVisualGroup)
    this._updateCanisterVisuals()
  }

  _findPlayerBackAnchor() {
    const root = this.player?.model
    if (!root)
      return null
    const candidates = []
    root.traverse((obj) => {
      if (!obj)
        return
      const name = String(obj.name || '').toLowerCase()
      if (!name)
        return
      if (name.includes('uppertorso') || name.includes('torso') || name.includes('chest') || name.includes('spine'))
        candidates.push(obj)
    })
    if (candidates.length === 0)
      return null
    candidates.sort((a, b) => String(a.name || '').length - String(b.name || '').length)
    return candidates[0]
  }

  _updateCanisterVisuals() {
    if (!this._canisterVisualGroup)
      return
    const items = this._getBagItems('backpack')
    const small = Math.max(0, Math.floor(Number(items.canister_small) || 0))
    const medium = Math.max(0, Math.floor(Number(items.canister_medium) || 0))
    const large = Math.max(0, Math.floor(Number(items.canister_large) || 0))
    const total = small + medium + large

    const gltf = this.resources?.items?.canister
    const scene = gltf?.scene || null

    this._canisterVisualGroup.clear?.()
    if (!scene || total <= 0)
      return

    const list = []
    for (let i = 0; i < small; i++)
      list.push({ type: 'small', scale: 0.18, z: 0.16 })
    for (let i = 0; i < medium; i++)
      list.push({ type: 'medium', scale: 0.22, z: 0.22 })
    for (let i = 0; i < large; i++)
      list.push({ type: 'large', scale: 0.28, z: 0.3 })

    let zAccum = 0
    for (let i = 0; i < list.length; i++) {
      const entry = list[i]
      const obj = scene.clone(true)
      obj.traverse((child) => {
        if (!child?.isMesh)
          return
        child.castShadow = true
        child.receiveShadow = true
        child.frustumCulled = false
        if (child.material) {
          child.material.transparent = true
          child.material.depthWrite = false
        }
      })
      obj.rotation.y = Math.PI
      obj.position.set(0, 1.22, -(0.28 + zAccum))
      obj.scale.setScalar(entry.scale)
      zAccum += entry.z
      this._canisterVisualGroup.add(obj)
    }
  }

  _initHeartHud() {
    const camera = this.experience?.camera?.instance
    if (!camera)
      return
    const gltf = this.resources?.items?.heart_ui
    const heartScene = gltf?.scene
    if (!heartScene)
      return

    if (this._heartHud)
      this._heartHud.removeFromParent?.()

    const root = new THREE.Group()
    root.position.copy(this._heartHudBasePos)
    root.frustumCulled = false

    const base = heartScene.clone(true)
    base.traverse((child) => {
      if (!child?.isMesh)
        return
      child.frustumCulled = false
      child.castShadow = false
      child.receiveShadow = false
      if (child.material) {
        child.material.transparent = true
        child.material.depthWrite = false
      }
    })
    base.scale.setScalar(this._heartHudBaseScale)
    root.add(base)

    camera.add(root)
    this._heartHud = root
    this._heartHudBase = base
  }

  _updateHeartHud() {
    if (!this._heartHud || !this._heartHudBase || !this.player)
      return
    const hp = Math.max(0, Number(this.player.hp) || 0)
    const maxHp = Math.max(1, Number(this.player.maxHp) || 1)
    const ratio = Math.max(0, Math.min(1, hp / maxHp))

    const bpm = 60 + (1 - ratio) * 120
    const phase = (this.experience.time.elapsed ?? 0) * 0.001 * (bpm / 60) * Math.PI * 2
    const pulse = 1 + Math.sin(phase) * 0.11
    this._heartHudBase.scale.setScalar(this._heartHudBaseScale * pulse)

    const low = ratio < 0.3
    if (low !== this._heartHudLowHp) {
      this._heartHudLowHp = low
      this._heartHudBase.traverse((child) => {
        if (!child?.isMesh)
          return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (!mat)
            continue
          if (!mat.userData)
            mat.userData = {}
          if (!mat.userData._origColor && mat.color)
            mat.userData._origColor = mat.color.clone()
        }
      })
    }

    const basePos = this._heartHudBasePos
    if (low) {
      const shake = 0.006 + (1 - ratio) * 0.014
      this._heartHud.position.set(
        basePos.x + (Math.random() - 0.5) * shake,
        basePos.y + (Math.random() - 0.5) * shake,
        basePos.z,
      )
      this._heartHudBase.traverse((child) => {
        if (!child?.isMesh)
          return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (!mat?.color)
            continue
          mat.color.setHex(0x330000)
          if (mat.emissive)
            mat.emissive.setHex(0x110000)
          if (mat.emissiveIntensity !== undefined)
            mat.emissiveIntensity = 0.6
        }
      })
    }
    else {
      this._heartHud.position.copy(basePos)
      this._heartHudBase.traverse((child) => {
        if (!child?.isMesh)
          return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (!mat)
            continue
          if (mat.userData?._origColor && mat.color)
            mat.color.copy(mat.userData._origColor)
          if (mat.emissive)
            mat.emissive.setHex(0x000000)
          if (mat.emissiveIntensity !== undefined)
            mat.emissiveIntensity = 0
        }
      })
    }
  }

  _getCaptureCandidate() {
    if (!this._lockedEnemy || this._lockedEnemy.isDead)
      return null
    if (this.currentWorld !== 'dungeon')
      return null
    const target = this._lockedEnemy
    const ratio = (target.maxHp || 1) > 0 ? (target.hp / target.maxHp) : 0
    if (ratio > 0.15)
      return null
    if (!target.isStunned?.())
      return null
    return target
  }

  _tryStartCapture() {
    const now = this.experience.time?.elapsed ?? 0
    if (this.isPaused)
      return
    if (!this.player)
      return
    if (this._captureTarget || this._captureState)
      return
    if (now < (this._captureCooldownUntil ?? 0))
      return

    const target = this._getCaptureCandidate()
    if (!target)
      return

    this._captureTarget = target
    this._captureStartAt = now
    this._captureState = 'channeling'

    this.player.setControlLocked?.(true)
    this.player.setSpeedMultiplier?.(0)
    this.player.setSprintDisabled?.(true)

    if (this._captureBeam)
      this._captureBeam.visible = true
  }

  _breakCapture({ reason, healTarget } = {}) {
    if (!this._captureTarget || !this._captureState)
      return
    const now = this.experience.time?.elapsed ?? 0
    const target = this._captureTarget
    this._captureTarget = null
    this._captureState = null
    this._captureStartAt = 0
    this._captureCooldownUntil = now + 700

    if (this._captureBeam)
      this._captureBeam.visible = false

    this.player?.setControlLocked?.(false)
    this._applyBurdenEffects()

    if (healTarget && target?.heal && !target.isDead) {
      const heal = Math.max(1, Math.ceil((target.maxHp || 1) * 0.1))
      target.heal(heal)
      emitter.emit('dungeon:toast', { text: '捕捉中断：目标恢复' })
      return
    }
    if (reason === 'release')
      emitter.emit('dungeon:toast', { text: '捕捉取消' })
  }

  _completeCapture() {
    const target = this._captureTarget
    if (!target)
      return
    const now = this.experience.time?.elapsed ?? 0
    this._captureTarget = null
    this._captureState = null
    this._captureStartAt = 0
    this._captureCooldownUntil = now + 1200

    if (this._captureBeam)
      this._captureBeam.visible = false

    this.player?.setControlLocked?.(false)

    if (!target.isDead) {
      target.die?.()
    }

    const canisterId = this._pickCanisterIdForTarget(target)
    if (canisterId) {
      this._addInventoryItem('backpack', canisterId, 1)
      emitter.emit('dungeon:toast', { text: `获得：${canisterId}` })
    }

    this._applyBurdenEffects()
    this._updateCanisterVisuals()
  }

  _pickCanisterIdForTarget(target) {
    if (!target)
      return 'canister_small'
    const maxHp = Number(target.maxHp) || 0
    if (maxHp >= 14)
      return 'canister_large'
    if (maxHp >= 7)
      return 'canister_medium'
    return 'canister_small'
  }

  _updateCaptureBeam() {
    if (!this._captureBeam || !this._captureTarget || !this.player)
      return
    const muzzle = this.player.getMatterGunMuzzleWorldPosition?.()
    const start = muzzle || new THREE.Vector3(this.player.getPosition().x, this.player.getPosition().y + 1.35, this.player.getPosition().z)
    const end = this._getEnemyLockTargetPos(this._captureTarget)
      || new THREE.Vector3(this._captureTarget.group.position.x, this._captureTarget.group.position.y + 1.35, this._captureTarget.group.position.z)

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z
    const d2 = dx * dx + dy * dy + dz * dz
    const len = Math.sqrt(Math.max(0.000001, d2))
    const mid = new THREE.Vector3(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    )
    const dir = new THREE.Vector3(dx, dy, dz).multiplyScalar(1 / len)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    this._captureBeam.position.copy(mid)
    this._captureBeam.quaternion.copy(q)
    this._captureBeam.scale.set(1, len, 1)
    this._captureBeam.visible = true
  }

  _updateCapture() {
    if (!this._captureState || !this._captureTarget) {
      if (this._captureBeam)
        this._captureBeam.visible = false
      return
    }
    if (!this._captureHolding) {
      this._breakCapture({ reason: 'release', healTarget: false })
      return
    }

    const target = this._captureTarget
    if (target.isDead || !target.group) {
      this._breakCapture({ reason: 'invalid', healTarget: false })
      return
    }

    const now = this.experience.time?.elapsed ?? 0
    const ratio = (target.maxHp || 1) > 0 ? (target.hp / target.maxHp) : 0
    if (ratio > 0.15 || !target.isStunned?.(now)) {
      this._breakCapture({ reason: 'invalid', healTarget: false })
      return
    }

    this._updateCaptureBeam()

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    target.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const desired = this._getFacingTo(dx, dz)
    this.player.setFacing?.(desired)

    if (now - (this._captureStartAt ?? 0) >= this._captureDurationMs) {
      this._completeCapture()
    }
  }

  _applyBurdenEffects() {
    if (!this.player)
      return
    const items = this._getBagItems('backpack')
    const medium = Math.max(0, Math.floor(Number(items.canister_medium) || 0))
    const large = Math.max(0, Math.floor(Number(items.canister_large) || 0))
    const penalty = medium * 0.1 + large * 0.25
    const multiplier = Math.max(0.25, 1 - penalty)
    this.player.setSpeedMultiplier?.(multiplier)
    this.player.setSprintDisabled?.(large > 0)
  }

  _ensureStarterMatterGun() {
    try {
      if (typeof window === 'undefined')
        return
      const key = 'mmmc:starter_matter_gun_v1'
      const has = window.localStorage?.getItem?.(key)
      if (has)
        return
      const items = this._getBagItems('backpack')
      if (!items.material_gun || items.material_gun <= 0)
        this._addInventoryItem('backpack', 'material_gun', 1)
      window.localStorage?.setItem?.(key, '1')
    }
    catch {
    }
  }

  _equipInventoryItem(payload) {
    const itemId = payload?.itemId
    if (itemId !== 'material_gun')
      return
    const items = this._getBagItems('backpack')
    const count = Math.max(0, Math.floor(Number(items?.[itemId]) || 0))
    if (count <= 0) {
      emitter.emit('dungeon:toast', { text: '背包里没有物质枪' })
      return
    }

    const next = !this._isMaterialGunEquipped
    this._isMaterialGunEquipped = next
    this.player?.setMatterGunEquipped?.(next)
    if (!next)
      this._stopMaterialGunFire()
    emitter.emit('dungeon:toast', { text: next ? '已装备物质枪' : '已收起物质枪' })
  }

  _startMaterialGunFire() {
    if (!this._isMaterialGunEquipped)
      return
    this._isMaterialGunFiring = true
  }

  _stopMaterialGunFire() {
    if (!this._isMaterialGunFiring && !this._materialGunBeam?.visible)
      return
    this._isMaterialGunFiring = false
    this.player?.setMatterGunAiming?.(false)
    if (this._materialGunBeam)
      this._materialGunBeam.visible = false
  }

  _updateMaterialGun() {
    if (!this.player || !this._isMaterialGunEquipped || !this._materialGunBeam) {
      this._stopMaterialGunFire()
      return
    }

    const target = this._lockedEnemy
    const validTarget = !!target?.group && !target?.isDead
    if (!this._isMaterialGunFiring || !validTarget) {
      this.player.setMatterGunAiming(false)
      this._materialGunBeam.visible = false
      return
    }

    const cfg = this._npcStats?.material_gun || {}
    const maxRange = Number.isFinite(cfg.maxRange) ? cfg.maxRange : 24
    const tickMs = Math.max(120, Math.floor(Number(cfg.tickMs) || 900))
    const tickDamage = Math.max(1, Math.floor(Number(cfg.tickDamage) || 1))

    const muzzle = this.player.getMatterGunMuzzleWorldPosition?.()
    const start = muzzle || new THREE.Vector3(this.player.getPosition().x, this.player.getPosition().y + 1.35, this.player.getPosition().z)
    const end = this._getEnemyLockTargetPos(target) || new THREE.Vector3(target.group.position.x, target.group.position.y + 1.35, target.group.position.z)

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 > maxRange * maxRange) {
      this._materialGunBeam.visible = false
      this.player.setMatterGunAiming(false)
      return
    }

    this._materialGunBeamPositions[0] = start.x
    this._materialGunBeamPositions[1] = start.y
    this._materialGunBeamPositions[2] = start.z
    this._materialGunBeamPositions[3] = end.x
    this._materialGunBeamPositions[4] = end.y
    this._materialGunBeamPositions[5] = end.z

    const beam = this._materialGunBeam
    const len = Math.sqrt(d2)
    const mid = new THREE.Vector3(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    )
    const dir = new THREE.Vector3(dx, dy, dz).multiplyScalar(1 / Math.max(0.000001, len))
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

    beam.position.copy(mid)
    beam.quaternion.copy(q)
    beam.scale.set(1, len, 1)
    beam.visible = true
    this.player.setMatterGunAiming(true)

    const now = this.experience.time?.elapsed ?? 0
    if (now - this._materialGunLastDamageAt < tickMs)
      return
    this._materialGunLastDamageAt = now

    const hit = target.takeDamage?.(tickDamage)
    if (hit)
      this._forceNpcAggro(target, now + 8000)

    if (target.isDead && this._lockedEnemy === target) {
      this._clearLockOn()
      this._stopMaterialGunFire()
    }
  }

  _forceNpcAggro(npc, untilMs) {
    if (!npc)
      return
    if (!npc.behavior)
      npc.behavior = {}
    npc.behavior.forceAggroUntil = Math.max(Number(npc.behavior.forceAggroUntil) || 0, Math.floor(Number(untilMs) || 0))
  }

  _getEnemyLockTargetPos(enemy) {
    if (!enemy?.group)
      return null
    const pos = new THREE.Vector3()
    enemy.group.getWorldPosition(pos)
    pos.y += 1.4
    return pos
  }

  _getNearestHubAnimal(maxDistance = 50) {
    if (!this.animals || !this.player)
      return null
    const pos = this.player.getPosition()
    let best = null
    let bestD2 = Infinity
    const maxD2 = maxDistance * maxDistance
    for (const animal of this.animals) {
      if (!animal?.group || animal?.isDead)
        continue
      if (animal === this._carriedAnimal)
        continue
      const epos = new THREE.Vector3()
      animal.group.getWorldPosition(epos)
      const dx = epos.x - pos.x
      const dz = epos.z - pos.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = animal
      }
    }
    if (!best || bestD2 > maxD2)
      return null
    return best
  }

  _getNearestDungeonEnemy(maxDistance = 50) {
    if (!this._dungeonEnemies || !this.player)
      return null
    const pos = this.player.getPosition()
    let best = null
    let bestD2 = Infinity
    const maxD2 = maxDistance * maxDistance
    for (const enemy of this._dungeonEnemies) {
      if (!enemy?.group || enemy.isDead)
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
    if (this.currentWorld !== 'dungeon' && this.currentWorld !== 'hub')
      return
    if (!this.player)
      return

    if (this._lockedEnemy) {
      this._lockedEnemy.setLocked?.(false)
      this._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      return
    }

    const enemy = this.currentWorld === 'hub' ? this._getNearestHubAnimal() : this._getNearestDungeonEnemy()
    if (!enemy)
      return

    this._lockedEnemy = enemy
    this._lockedEnemy.setLocked?.(true)
    emitter.emit('combat:toggle_lock', enemy.group)
    emitter.emit('combat:lock', { title: '已锁定', hint: '中键解除' })

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const desired = this._getFacingTo(dx, dz)
    this.player.setFacing(desired)
    if (typeof this.player.targetFacingAngle === 'number')
      this.player.targetFacingAngle = desired
  }

  _updateLockOn() {
    if ((this.currentWorld !== 'dungeon' && this.currentWorld !== 'hub') || !this.player) {
      if (this._lockedEnemy) {
        this._lockedEnemy.setLocked?.(false)
        this._lockedEnemy = null
        emitter.emit('combat:toggle_lock', null)
        emitter.emit('combat:lock_clear')
      }
      return
    }
    if (!this._lockedEnemy)
      return

    const enemy = this._lockedEnemy
    if (!enemy?.group) {
      this._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      return
    }

    const p = this.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 > 50 * 50) {
      enemy.setLocked?.(false)
      this._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      this._stopMaterialGunFire()
      return
    }

    const desired = this._getFacingTo(dx, dz)
    const current = this.player.getFacingAngle()
    const next = this._lerpAngle(current, desired, this._isMaterialGunFiring ? 0.35 : 0.12)
    this.player.setFacing(next)
    if (typeof this.player.targetFacingAngle === 'number')
      this.player.targetFacingAngle = next
  }

  _getFacingTo(dx, dz) {
    return Math.atan2(-dx, -dz)
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

  _loadLockedChests() {
    try {
      if (typeof window === 'undefined')
        return {}
      const raw = window.localStorage?.getItem?.('mmmc:locked_chests_v1')
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

  _saveLockedChestsNow() {
    try {
      if (typeof window === 'undefined')
        return
      window.localStorage?.setItem?.('mmmc:locked_chests_v1', JSON.stringify(this._lockedChests || {}))
    }
    catch {
    }
  }

  _scheduleLockedChestsSave() {
    if (this._lockedChestsSaveTimer)
      clearTimeout(this._lockedChestsSaveTimer)
    this._lockedChestsSaveTimer = setTimeout(() => {
      this._lockedChestsSaveTimer = null
      this._saveLockedChestsNow()
    }, 250)
  }

  _loadInventory() {
    try {
      if (typeof window === 'undefined')
        return { backpack: { items: {} }, warehouse: { items: {} } }
      const raw = window.localStorage?.getItem?.('mmmc:inventory_v1')
      if (!raw)
        return { backpack: { items: {} }, warehouse: { items: {} } }
      const parsed = JSON.parse(raw)
      const backpack = parsed?.backpack?.items && typeof parsed.backpack.items === 'object'
        ? parsed.backpack.items
        : {}
      const warehouse = parsed?.warehouse?.items && typeof parsed.warehouse.items === 'object'
        ? parsed.warehouse.items
        : {}
      return {
        backpack: { items: this._sanitizeItemMap(backpack) },
        warehouse: { items: this._sanitizeItemMap(warehouse) },
      }
    }
    catch {
      return { backpack: { items: {} }, warehouse: { items: {} } }
    }
  }

  _sanitizeItemMap(map) {
    const next = {}
    for (const [key, value] of Object.entries(map || {})) {
      if (typeof key !== 'string')
        continue
      const n = Number(value)
      if (!Number.isFinite(n))
        continue
      const count = Math.floor(n)
      if (count <= 0)
        continue
      next[key] = count
    }
    return next
  }

  _saveInventoryNow() {
    try {
      if (typeof window === 'undefined')
        return
      window.localStorage?.setItem?.('mmmc:inventory_v1', JSON.stringify(this._inventory || {}))
    }
    catch {
    }
  }

  _scheduleInventorySave() {
    if (this._inventorySaveTimer)
      clearTimeout(this._inventorySaveTimer)
    this._inventorySaveTimer = setTimeout(() => {
      this._inventorySaveTimer = null
      this._saveInventoryNow()
    }, 250)
  }

  _getBagItems(bagName) {
    if (!this._inventory)
      this._inventory = { backpack: { items: {} }, warehouse: { items: {} } }
    if (bagName === 'warehouse') {
      if (!this._inventory.warehouse)
        this._inventory.warehouse = { items: {} }
      if (!this._inventory.warehouse.items)
        this._inventory.warehouse.items = {}
      return this._inventory.warehouse.items
    }
    if (!this._inventory.backpack)
      this._inventory.backpack = { items: {} }
    if (!this._inventory.backpack.items)
      this._inventory.backpack.items = {}
    return this._inventory.backpack.items
  }

  _getItemTotalCount(items) {
    return Object.values(items || {}).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0)
  }

  _getItemWeight(itemId) {
    const w = this._inventoryConfig?.itemWeights?.[itemId]
    return Number.isFinite(w) ? w : 1
  }

  _getBackpackMaxSlots() {
    const v = this._inventoryConfig?.backpack?.slots
    return Number.isFinite(v) ? v : 24
  }

  _getBackpackMaxWeight() {
    const v = this._inventoryConfig?.backpack?.maxWeight
    return Number.isFinite(v) ? v : 60
  }

  _getBagWeight(items) {
    let sum = 0
    for (const [id, count] of Object.entries(items || {})) {
      const n = Math.max(0, Math.floor(Number(count) || 0))
      if (n <= 0)
        continue
      sum += this._getItemWeight(id) * n
    }
    return sum
  }

  _getResourcePathByKey(resourceKey) {
    const list = this.resources?.sources || []
    const found = list.find(s => s?.name === resourceKey)
    return found?.path || ''
  }

  _getModelFilenameByResourceKey(resourceKey) {
    if (resourceKey === 'key_plains')
      return '平原钥匙'
    if (resourceKey === 'key_snow')
      return '雪原钥匙'
    if (resourceKey === 'key_desert')
      return '沙漠钥匙'
    if (resourceKey === 'key_forest')
      return '森林钥匙'
    const path = this._getResourcePathByKey(resourceKey)
    if (!path)
      return resourceKey || ''
    if (!String(path).startsWith('models/'))
      return resourceKey || ''
    const parts = String(path).split('/')
    const name = parts[parts.length - 1] || resourceKey || ''
    return String(name).replace(/\.(?:gltf|glb)$/i, '')
  }

  _getPortalChestType(portalId) {
    if (!portalId)
      return null
    if (portalId === 'plains')
      return 'snow'
    if (portalId === 'snow')
      return 'desert'
    if (portalId === 'desert')
      return 'forest'
    if (portalId === 'forest')
      return 'plains'
    return null
  }

  _getRequiredKeyForPortalChest(portalId) {
    const chestType = this._getPortalChestType(portalId)
    if (!chestType)
      return null
    return `key_${chestType}`
  }

  _getLockedChestPool() {
    const pool = []
    if (this.interactables)
      pool.push(...this.interactables)
    if (this._dungeonInteractables)
      pool.push(...this._dungeonInteractables)
    return pool
  }

  _findLockedChest(chestId) {
    if (!chestId)
      return null
    return this._getLockedChestPool().find(i => i?.id === chestId && i.lockedChestId) || null
  }

  _getLockedChestPayload(chestId) {
    const chest = this._findLockedChest(chestId)
    if (!chest)
      return null
    const state = this._lockedChests?.[chestId] || {}
    const loot = state?.loot?.itemId
      ? [{ id: state.loot.itemId, count: Math.max(1, Math.floor(Number(state.loot.count) || 1)) }]
      : []
    return {
      id: chestId,
      title: chest.title || '宝箱',
      requiredKeyId: chest.requiredKeyId || null,
      unlocked: !!state.unlocked,
      looted: !!state.looted,
      loot,
    }
  }

  _createToolMesh(itemId) {
    let mesh = null
    const resource = this.resources?.items?.[itemId]
    if (resource?.scene) {
      mesh = resource.scene.clone()
    }
    else {
      const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6)
      const material = new THREE.MeshStandardMaterial({ color: 0xFFCC66, roughness: 0.6, metalness: 0.15, emissive: 0x332200, emissiveIntensity: 0.25 })
      mesh = new THREE.Mesh(geometry, material)
    }

    mesh.traverse?.((child) => {
      if (child?.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    try {
      const box = new THREE.Box3().setFromObject(mesh)
      const size = new THREE.Vector3()
      box.getSize(size)
      const max = Math.max(size.x, size.y, size.z)
      if (Number.isFinite(max) && max > 0.0001) {
        const target = 0.9
        const s = target / max
        mesh.scale.multiplyScalar(s)
      }
    }
    catch {
    }

    return mesh
  }

  _removeLockedChestLootVisual(chestId) {
    const chest = this._findLockedChest(chestId)
    const visual = chest?._lootVisual
    if (!visual?.mesh)
      return
    visual.mesh.visible = false
    visual.mesh.removeFromParent?.()
    chest._lootVisual = null
  }

  _ensureLockedChestLootVisual(chestId, withPop = false) {
    const chest = this._findLockedChest(chestId)
    if (!chest)
      return
    const state = this._lockedChests?.[chestId] || {}
    const itemId = state?.loot?.itemId || null
    if (!state.unlocked || state.looted || !itemId) {
      this._removeLockedChestLootVisual(chestId)
      return
    }

    if (chest._lootVisual?.mesh) {
      if (chest._lootVisual.itemId !== itemId) {
        this._removeLockedChestLootVisual(chestId)
      }
      else {
        return
      }
    }

    const mesh = this._createToolMesh(itemId)
    const base = chest.mesh?.position
    const x = base?.x ?? chest.x
    const z = base?.z ?? chest.z
    const startY = (base?.y ?? (this._getSurfaceY(x, z) + 0.5)) + 0.6
    mesh.position.set(x, startY, z)
    mesh.rotation.y = Math.random() * Math.PI * 2
    const group = chest.parentGroup || this._interactablesGroup || this._dungeonInteractablesGroup || null
    group?.add?.(mesh)

    const now = this.experience.time.elapsed ?? 0
    chest._lootVisual = {
      mesh,
      itemId,
      startMs: now,
      durationMs: withPop ? 820 : 0,
      startY,
      peakY: startY + 1.05,
      settleY: startY + 0.55,
      phase: Math.random() * Math.PI * 2,
      done: !withPop,
    }
    if (!withPop) {
      mesh.position.y = chest._lootVisual.settleY
    }
  }

  _updateLockedChestLootVisual(chest, dt, t) {
    const visual = chest?._lootVisual
    if (!visual?.mesh)
      return
    const state = this._lockedChests?.[chest.id] || {}
    const itemId = state?.loot?.itemId || null
    if (!state.unlocked || state.looted || !itemId || itemId !== visual.itemId) {
      this._removeLockedChestLootVisual(chest.id)
      return
    }

    const mesh = visual.mesh
    if (!visual.done && visual.durationMs > 0) {
      const now = this.experience.time.elapsed ?? 0
      const p = (now - visual.startMs) / visual.durationMs
      const clamped = Math.min(1, Math.max(0, p))
      if (clamped >= 1) {
        visual.done = true
        mesh.position.y = visual.settleY
      }
      else if (clamped < 0.55) {
        const tt = clamped / 0.55
        const e = 1 - (1 - tt) ** 3
        mesh.position.y = visual.startY + (visual.peakY - visual.startY) * e
      }
      else {
        const tt = (clamped - 0.55) / 0.45
        const e = tt * tt * tt
        mesh.position.y = visual.peakY + (visual.settleY - visual.peakY) * e
      }
      mesh.rotation.y += 2.2 * dt
      mesh.rotation.x = Math.sin(clamped * Math.PI * 2) * 0.25 * (1 - clamped)
      return
    }

    mesh.rotation.y += 1.15 * dt
    mesh.position.y = visual.settleY + Math.sin(t * 2.2 + visual.phase) * 0.06
  }

  _openLockedChest(chestId) {
    if (!chestId)
      return
    if (this._activeInventoryPanel)
      this._closeInventoryPanel()

    const payload = this._getLockedChestPayload(chestId)
    if (!payload)
      return

    this._activeChestId = chestId
    this.isPaused = true
    this.experience.pointerLock?.exitLock?.()
    this._emitDungeonState()
    this._emitInventoryState()
    emitter.emit('chest:open', payload)
  }

  _useKeyForLockedChest(payload) {
    const chestId = payload?.id
    const keyId = payload?.keyId
    if (!chestId || !keyId)
      return

    const chest = this._findLockedChest(chestId)
    if (!chest || chest.read)
      return

    const state = this._lockedChests?.[chestId] || {}
    if (state.unlocked) {
      emitter.emit('chest:update', this._getLockedChestPayload(chestId))
      return
    }

    const requiredKeyId = chest.requiredKeyId
    if (!requiredKeyId || keyId !== requiredKeyId) {
      emitter.emit('dungeon:toast', { text: '钥匙不匹配' })
      return
    }

    const backpack = this._getBagItems('backpack')
    if (!backpack?.[keyId] || backpack[keyId] <= 0) {
      emitter.emit('dungeon:toast', { text: '背包中没有对应钥匙' })
      return
    }

    this._removeInventoryItem('backpack', keyId, 1)

    let lootItemId = state?.loot?.itemId || null
    let lootCount = state?.loot?.count || 0
    if (!lootItemId) {
      const pool = this._toolLootPool || []
      lootItemId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'fence'
      lootCount = 1
    }

    this._lockedChests[chestId] = {
      unlocked: true,
      looted: false,
      loot: { itemId: lootItemId, count: lootCount },
    }

    chest.unlocked = true
    chest.hint = '按 E 打开宝箱'
    chest.description = requiredKeyId ? `需要${this._getModelFilenameByResourceKey(requiredKeyId)}解锁` : chest.description
    this._ensureLockedChestLootVisual(chestId, true)

    this._scheduleInventorySave()
    this._scheduleLockedChestsSave()
    this._emitInventorySummary()
    this._emitInventoryState()
    emitter.emit('dungeon:toast', { text: `已解锁：${chest.title}` })
    emitter.emit('chest:update', this._getLockedChestPayload(chestId))

    emitter.emit('chest:close_ui', { id: chestId })

    const autoLootItemId = lootItemId
    const autoLootCount = lootCount
    setTimeout(() => {
      const st = this._lockedChests?.[chestId] || {}
      if (!st.unlocked || st.looted)
        return
      if (!st.loot?.itemId || st.loot.itemId !== autoLootItemId)
        return
      this._takeLockedChestLoot({ id: chestId, itemId: autoLootItemId, amount: autoLootCount })
    }, 900)
  }

  _takeLockedChestLoot(payload) {
    const chestId = payload?.id
    const itemId = payload?.itemId
    const amount = Math.max(1, Math.floor(Number(payload?.amount) || 1))
    if (!chestId || !itemId)
      return

    const chest = this._findLockedChest(chestId)
    if (!chest || chest.read)
      return

    const state = this._lockedChests?.[chestId] || {}
    if (!state.unlocked || !state.loot?.itemId)
      return
    if (state.loot.itemId !== itemId)
      return

    const takeCount = Math.min(amount, Math.max(1, Math.floor(Number(state.loot.count) || 1)))

    if (this._canAddToBackpack(itemId, takeCount)) {
      this._addInventoryItem('backpack', itemId, takeCount)
      emitter.emit('dungeon:toast', { text: `获得：${this._getModelFilenameByResourceKey(itemId)} x${takeCount}（已放入背包）` })
    }
    else {
      this._addInventoryItem('warehouse', itemId, takeCount)
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${this._getModelFilenameByResourceKey(itemId)} x${takeCount}（已入库）` })
    }

    const remaining = Math.max(0, Math.floor(Number(state.loot.count) || 1) - takeCount)
    if (remaining <= 0) {
      this._lockedChests[chestId] = { unlocked: true, looted: true, loot: null }
      this._removeLockedChestLootVisual(chestId)
      chest.read = true
      chest.looted = true
      chest.range = 0
      chest.hint = '已开启'
      if (chest.mesh) {
        chest.mesh.visible = false
        chest.mesh.parent?.remove?.(chest.mesh)
      }
      if (chest.outline) {
        chest.outline.visible = false
        chest.outline.parent?.remove?.(chest.outline)
      }
      if (this._activeInteractableId === chestId) {
        this._activeInteractableId = null
        this._activeInteractable = null
        emitter.emit('interactable:prompt_clear')
      }
    }
    else {
      this._lockedChests[chestId] = { unlocked: true, looted: false, loot: { itemId, count: remaining } }
    }

    this._scheduleInventorySave()
    this._scheduleLockedChestsSave()
    this._emitInventorySummary()
    this._emitInventoryState()
    emitter.emit('chest:update', this._getLockedChestPayload(chestId))
  }

  _createNameLabel(text) {
    const div = document.createElement('div')
    div.textContent = String(text || '')
    div.style.color = 'rgba(255,255,255,0.95)'
    div.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial'
    div.style.fontSize = '12px'
    div.style.fontWeight = '700'
    div.style.padding = '3px 6px'
    div.style.background = 'rgba(0,0,0,0.45)'
    div.style.border = '1px solid rgba(255,255,255,0.15)'
    div.style.borderRadius = '8px'
    div.style.pointerEvents = 'none'
    div.style.whiteSpace = 'nowrap'

    return new CSS2DObject(div)
  }

  _attachNameLabel(target, text, y = 1.25, maxDistance = 18, scope = null) {
    if (!target)
      return null
    if (!target.userData)
      target.userData = {}
    if (target.userData._nameLabel) {
      const el = target.userData._nameLabel.element
      if (el)
        el.textContent = String(text || '')
      if (Number.isFinite(maxDistance) && maxDistance > 0)
        target.userData._nameLabelMaxDistance = maxDistance
      return target.userData._nameLabel
    }

    const label = this._createNameLabel(text)
    label.position.set(0, y, 0)
    target.add(label)
    target.userData._nameLabel = label
    target.userData._nameLabelMaxDistance = (Number.isFinite(maxDistance) && maxDistance > 0) ? maxDistance : 18
    const entry = { target, scope: scope || null }
    target.userData._nameLabelEntry = entry
    target.userData._nameLabelScope = entry.scope
    this._nameLabelEntries.push(entry)
    return label
  }

  _detachNameLabel(target, entry) {
    if (!target?.userData)
      return
    const label = target.userData._nameLabel
    const resolvedEntry = entry || target.userData._nameLabelEntry || null
    if (label?.removeFromParent)
      label.removeFromParent()
    const el = label?.element
    if (el?.remove)
      el.remove()
    delete target.userData._nameLabel
    delete target.userData._nameLabelMaxDistance
    delete target.userData._nameLabelEntry
    delete target.userData._nameLabelScope
    if (resolvedEntry && this._nameLabelEntries && this._nameLabelEntries.length > 0) {
      const index = this._nameLabelEntries.indexOf(resolvedEntry)
      if (index >= 0)
        this._nameLabelEntries.splice(index, 1)
    }
  }

  _clearNameLabelsByScope(scope) {
    if (!scope || !this._nameLabelEntries || this._nameLabelEntries.length === 0)
      return
    for (let i = this._nameLabelEntries.length - 1; i >= 0; i--) {
      const entry = this._nameLabelEntries[i]
      const target = entry?.target
      const s = entry?.scope || target?.userData?._nameLabelScope || null
      if (s !== scope)
        continue
      if (target)
        this._detachNameLabel(target, entry)
      else
        this._nameLabelEntries.splice(i, 1)
    }
  }

  _updateNameLabelVisibility() {
    if (!this._nameLabelEntries || this._nameLabelEntries.length === 0)
      return
    const camera = this.experience.camera?.instance
    if (!camera)
      return
    camera.getWorldPosition(this._nameLabelCamPos)
    for (let i = this._nameLabelEntries.length - 1; i >= 0; i--) {
      const entry = this._nameLabelEntries[i]
      const target = entry?.target
      const label = target?.userData?._nameLabel
      const el = label?.element
      if (!target || !label || !el || !target.parent) {
        if (target)
          this._detachNameLabel(target, entry)
        else
          this._nameLabelEntries.splice(i, 1)
        continue
      }
      const maxDistance = target.userData?._nameLabelMaxDistance ?? 18
      target.getWorldPosition(this._nameLabelTargetPos)
      const d = this._nameLabelCamPos.distanceTo(this._nameLabelTargetPos)
      el.style.display = d > maxDistance ? 'none' : ''
    }
  }

  _canAddToBackpack(itemId, amount = 1) {
    const items = this._getBagItems('backpack')
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return false

    const maxSlots = this._getBackpackMaxSlots()
    const stacks = Object.keys(items || {}).length
    const needsNewSlot = !Object.prototype.hasOwnProperty.call(items, itemId)
    if (needsNewSlot && stacks + 1 > maxSlots)
      return false

    const maxWeight = this._getBackpackMaxWeight()
    const weight = this._getBagWeight(items)
    const nextWeight = weight + this._getItemWeight(itemId) * delta
    if (nextWeight > maxWeight)
      return false

    return true
  }

  _emitInventorySummary() {
    const backpackItems = this._getBagItems('backpack')
    const warehouseItems = this._getBagItems('warehouse')
    const backpackWeight = this._getBagWeight(backpackItems)
    emitter.emit('inventory:summary', {
      backpackTotal: this._getItemTotalCount(backpackItems),
      warehouseTotal: this._getItemTotalCount(warehouseItems),
      backpackStacks: Object.keys(backpackItems).length,
      warehouseStacks: Object.keys(warehouseItems).length,
      backpackWeight,
      backpackMaxWeight: this._getBackpackMaxWeight(),
      backpackSlots: Object.keys(backpackItems).length,
      backpackMaxSlots: this._getBackpackMaxSlots(),
      carriedPet: this._carriedAnimal?.group ? (this._carriedAnimal._typeLabel || this._carriedAnimal._resourceKey || '') : '',
    })
  }

  _emitInventoryState() {
    const backpackItems = this._getBagItems('backpack')
    emitter.emit('inventory:update', {
      panel: this._activeInventoryPanel,
      backpack: { ...backpackItems },
      warehouse: { ...this._getBagItems('warehouse') },
      backpackMeta: {
        slots: Object.keys(backpackItems).length,
        maxSlots: this._getBackpackMaxSlots(),
        weight: this._getBagWeight(backpackItems),
        maxWeight: this._getBackpackMaxWeight(),
      },
      grid: { ...(this._inventoryConfig?.grid || { cols: 8, rows: 6 }) },
      itemSizes: { ...(this._inventoryConfig?.itemSizes || {}) },
      backpackGrid: this._buildBackpackGridSnapshot(backpackItems),
    })
  }

  _buildBackpackGridSnapshot(items) {
    const cfg = this._inventoryConfig?.grid || { cols: 8, rows: 6 }
    const cols = Math.max(1, Math.floor(Number(cfg.cols) || 8))
    const rows = Math.max(1, Math.floor(Number(cfg.rows) || 6))
    const sizes = this._inventoryConfig?.itemSizes || {}

    const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null))
    const placed = []
    const overflow = []

    const expanded = []
    let seq = 1
    for (const [id, count] of Object.entries(items || {})) {
      const n = Math.max(0, Math.floor(Number(count) || 0))
      if (n <= 0)
        continue
      const size = sizes?.[id] || { w: 1, h: 1 }
      const w = Math.max(1, Math.floor(Number(size.w) || 1))
      const h = Math.max(1, Math.floor(Number(size.h) || 1))
      for (let i = 0; i < n; i++) {
        expanded.push({
          uid: `${id}:${seq++}`,
          itemId: id,
          w,
          h,
        })
      }
    }

    const canFitAt = (uid, x, y, w, h) => {
      if (x < 0 || y < 0 || x + w > cols || y + h > rows)
        return false
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const v = cells[yy][xx]
          if (v && v !== uid)
            return false
        }
      }
      return true
    }

    const fill = (uid, x, y, w, h, value) => {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          cells[yy][xx] = value
        }
      }
    }

    for (const item of expanded) {
      let found = null
      for (let y = 0; y < rows && !found; y++) {
        for (let x = 0; x < cols; x++) {
          if (canFitAt(item.uid, x, y, item.w, item.h)) {
            found = { x, y, w: item.w, h: item.h, rotated: false }
            break
          }
        }
      }
      if (!found) {
        overflow.push({ ...item, x: -1, y: -1, rotated: false })
        continue
      }
      fill(item.uid, found.x, found.y, found.w, found.h, item.uid)
      placed.push({ ...item, ...found })
    }

    return {
      cols,
      rows,
      cells,
      items: placed,
      overflow,
    }
  }

  _toggleInventoryPanel(panel) {
    if (this._activeInventoryPanel) {
      if (this._activeInventoryPanel === panel) {
        this._closeInventoryPanel()
        return
      }
      if (panel === 'warehouse' && (this.currentWorld !== 'hub' || this._activeInteractable?.id !== 'warehouse'))
        return
      this._activeInventoryPanel = panel
      this._emitInventoryState()
      emitter.emit('inventory:open', { panel })
      return
    }
    if (this.isPaused)
      return
    if (panel === 'warehouse' && (this.currentWorld !== 'hub' || this._activeInteractable?.id !== 'warehouse'))
      return
    this._openInventoryPanel(panel)
  }

  _toggleBackpackPanel() {
    if (this._activeInventoryPanel) {
      this._closeInventoryPanel()
      return
    }
    if (this.isPaused)
      return
    this._openInventoryPanel('backpack')
  }

  _openInventoryPanel(panel) {
    this._activeInventoryPanel = panel
    this.isPaused = true
    this.experience.pointerLock?.exitLock?.()
    this._emitDungeonState()
    this._emitInventoryState()
    emitter.emit('inventory:open', { panel })
  }

  _closeInventoryPanel() {
    if (!this._activeInventoryPanel)
      return
    this._activeInventoryPanel = null
    this.isPaused = false
    this._emitDungeonState()
    emitter.emit('inventory:close_ui')
    this.experience.pointerLock?.requestLock?.()
  }

  _addInventoryItem(bagName, itemId, amount = 1) {
    const items = this._getBagItems(bagName)
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return
    if (bagName === 'backpack' && !this._canAddToBackpack(itemId, delta)) {
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${itemId} x${delta}` })
      return
    }
    items[itemId] = (items[itemId] || 0) + delta
    this._emitInventorySummary()
    this._emitInventoryState()
    this._updateCanisterVisuals()
    this._applyBurdenEffects()
    this._scheduleInventorySave()
  }

  _removeInventoryItem(bagName, itemId, amount = 1) {
    const items = this._getBagItems(bagName)
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (!itemId || delta <= 0)
      return false
    const current = items[itemId] || 0
    if (current < delta)
      return false
    const next = current - delta
    if (next <= 0)
      delete items[itemId]
    else
      items[itemId] = next
    this._emitInventorySummary()
    this._emitInventoryState()
    this._updateCanisterVisuals()
    this._applyBurdenEffects()
    this._scheduleInventorySave()
    return true
  }

  _transferInventory(payload) {
    const from = payload?.from
    const to = payload?.to
    const itemId = payload?.itemId
    const amount = payload?.amount ?? 1
    if (!from || !to || from === to || !itemId)
      return
    if ((from === 'warehouse' || to === 'warehouse') && (this.currentWorld !== 'hub' || this._activeInventoryPanel !== 'warehouse' || this._activeInteractable?.id !== 'warehouse'))
      return
    const delta = Math.max(0, Math.floor(Number(amount) || 0))
    if (to === 'backpack' && !this._canAddToBackpack(itemId, delta)) {
      emitter.emit('dungeon:toast', { text: `背包已满或超重：${itemId} x${delta}` })
      return
    }
    const ok = this._removeInventoryItem(from, itemId, amount)
    if (!ok)
      return
    this._addInventoryItem(to, itemId, amount)
  }

  _getSurfaceY(worldX, worldZ) {
    if (this.currentWorld === 'dungeon' && Number.isFinite(Number(this._dungeonSurfaceY)))
      return Number(this._dungeonSurfaceY)
    const topY = this.chunkManager?.getTopSolidYWorld?.(worldX, worldZ)
    if (typeof topY !== 'number' || Number.isNaN(topY))
      return 10
    return topY + 0.55
  }

  _findGrabCandidateAnimal(options = {}) {
    if (this.currentWorld !== 'hub' || !this.player || !this.animals || this.animals.length === 0)
      return null
    const camera = this.experience.camera?.instance
    if (!camera)
      return null
    const maxDist = Number.isFinite(options.maxDist) ? options.maxDist : 1.7
    const minDot = Number.isFinite(options.minDot) ? options.minDot : 0.72

    const playerPos = this.player.getPosition?.()
    if (!playerPos)
      return null

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)

    let best = null
    let bestScore = Infinity
    for (const animal of this.animals) {
      if (!animal?.group)
        continue
      if (animal === this._carriedAnimal)
        continue
      if (animal.behavior?.physics)
        continue

      const aPos = new THREE.Vector3()
      animal.group.getWorldPosition(aPos)
      aPos.y += 0.9

      const dx = aPos.x - playerPos.x
      const dz = aPos.z - playerPos.z
      const dist = Math.hypot(dx, dz)
      if (dist > maxDist || dist < 0.0001)
        continue
      const vx = aPos.x - camPos.x
      const vy = aPos.y - camPos.y
      const vz = aPos.z - camPos.z
      const vLen = Math.hypot(vx, vy, vz)
      if (vLen < 0.0001)
        continue
      const nx = vx / vLen
      const ny = vy / vLen
      const nz = vz / vLen
      const dot = nx * camDir.x + ny * camDir.y + nz * camDir.z
      if (dot < minDot)
        continue
      const score = dist / Math.max(0.001, dot)
      if (score < bestScore) {
        bestScore = score
        best = animal
      }
    }
    return best
  }

  _findFrontHubDrop(options = {}) {
    if (!this._hubDrops || this._hubDrops.length === 0)
      return null
    const camera = this.experience.camera?.instance
    if (!camera)
      return null
    const maxDist = Number.isFinite(options.maxDist) ? options.maxDist : 12
    const minDot = Number.isFinite(options.minDot) ? options.minDot : 0.84

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)

    let best = null
    let bestScore = Infinity

    for (const drop of this._hubDrops) {
      const mesh = drop?.mesh
      if (!mesh || mesh.visible === false)
        continue
      const pos = mesh.position
      const dx = pos.x - camPos.x
      const dy = (pos.y + 0.15) - camPos.y
      const dz = pos.z - camPos.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist > maxDist || dist < 0.0001)
        continue
      const nx = dx / dist
      const ny = dy / dist
      const nz = dz / dist
      const dot = nx * camDir.x + ny * camDir.y + nz * camDir.z
      if (dot < minDot)
        continue
      const score = dist / Math.max(0.001, dot)
      if (score < bestScore) {
        bestScore = score
        best = drop
      }
    }

    return best
  }

  _suckHubDrop(drop) {
    if (!drop?.id)
      return false
    const removed = this._removeHubDropById(drop.id)
    if (!removed)
      return false
    const itemId = removed.itemId || 'stone'
    const count = Math.max(1, Math.floor(Number(removed.count) || 1))
    this._addInventoryItem('backpack', itemId, count)
    emitter.emit('dungeon:toast', { text: `获得：${itemId} x${count}（已放入背包）` })
    this._scheduleInventorySave()
    this._emitInventorySummary()
    this._emitInventoryState()
    return true
  }

  _findFrontDungeonOre(options = {}) {
    if (!this._mineOres || this._mineOres.length === 0)
      return null
    const camera = this.experience.camera?.instance
    if (!camera)
      return null
    const maxDist = Number.isFinite(options.maxDist) ? options.maxDist : 12
    const minDot = Number.isFinite(options.minDot) ? options.minDot : 0.84

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)

    let best = null
    let bestScore = Infinity

    for (const ore of this._mineOres) {
      const mesh = ore?.mesh
      if (!mesh || mesh.visible === false)
        continue
      const pos = mesh.position
      const dx = pos.x - camPos.x
      const dy = (pos.y + 0.35) - camPos.y
      const dz = pos.z - camPos.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist > maxDist || dist < 0.0001)
        continue
      const nx = dx / dist
      const ny = dy / dist
      const nz = dz / dist
      const dot = nx * camDir.x + ny * camDir.y + nz * camDir.z
      if (dot < minDot)
        continue
      const score = dist / Math.max(0.001, dot)
      if (score < bestScore) {
        bestScore = score
        best = ore
      }
    }

    return best
  }

  _suckDungeonOre(ore) {
    const mesh = ore?.mesh
    if (!mesh)
      return false
    const itemId = ore.itemId || 'crystal'
    const count = Math.max(1, Math.floor(Number(ore.count) || 1))
    mesh.visible = false
    mesh.removeFromParent?.()
    const index = this._mineOres?.indexOf?.(ore) ?? -1
    if (index >= 0)
      this._mineOres.splice(index, 1)
    this._addInventoryItem('backpack', itemId, count)
    emitter.emit('dungeon:toast', { text: `获得：${itemId} x${count}（已放入背包）` })
    this._scheduleInventorySave()
    this._emitInventorySummary()
    this._emitInventoryState()
    return true
  }

  _fireMatterGun() {
    if (this.isPaused)
      return

    if (this.currentWorld === 'hub') {
      const drop = this._findFrontHubDrop({ maxDist: 14, minDot: 0.72 })
      if (drop)
        this._suckHubDrop(drop)
      return
    }

    if (this.currentWorld === 'dungeon') {
      const ore = this._findFrontDungeonOre({ maxDist: 14, minDot: 0.72 })
      if (ore)
        this._suckDungeonOre(ore)
    }
  }

  _toggleCarryAnimal() {
    if (this.isPaused)
      return
    if (this.currentWorld !== 'hub')
      return
    if (this._carriedAnimal) {
      this._dropCarriedAnimal()
      return
    }
    const target = this._findGrabCandidateAnimal()
    if (!target)
      return
    this._carriedAnimal = target
    if (!this._carriedAnimal.behavior)
      this._carriedAnimal.behavior = {}
    this._carriedAnimal.behavior.state = 'carried'
    this._carriedAnimal.behavior.timer = 0
    this._carriedAnimal.behavior.physics = null
    this._carriedAnimal.playAnimation?.('Idle')
    this._emitInventorySummary()
  }

  _dropCarriedAnimal() {
    if (!this._carriedAnimal || !this.player)
      return
    const animal = this._carriedAnimal
    this._carriedAnimal = null
    if (!animal.behavior)
      animal.behavior = {}
    animal.behavior.state = 'idle'
    animal.behavior.timer = 1 + Math.random() * 2
    animal.playAnimation?.('Idle')
    const p = this.player.getPosition()
    const angle = this.player.getFacingAngle()
    const fx = Math.sin(angle)
    const fz = Math.cos(angle)
    animal.group.position.set(p.x + fx * 1.4, p.y + 0.6, p.z + fz * 1.4)
    const groundY = this._getSurfaceY(animal.group.position.x, animal.group.position.z)
    animal.group.position.y = groundY
    this._emitInventorySummary()
  }

  _throwCarriedAnimal() {
    if (this.isPaused)
      return
    if (this.currentWorld !== 'hub')
      return
    if (!this._carriedAnimal || !this.player)
      return

    const camera = this.experience.camera?.instance
    if (!camera) {
      this._dropCarriedAnimal()
      return
    }

    const animal = this._carriedAnimal
    this._carriedAnimal = null

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.normalize()

    const camPos = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    const start = camPos.clone().add(dir.clone().multiplyScalar(2.1))
    start.y -= 0.65
    const groundY = this._getSurfaceY(start.x, start.z) + 0.25
    if (start.y < groundY)
      start.y = groundY
    animal.group.position.copy(start)

    const baseSpeed = 12
    const vel = dir.multiplyScalar(baseSpeed)
    const pv = this.player.getVelocity()
    vel.x += pv.x * 0.35
    vel.z += pv.z * 0.35
    vel.y += Math.max(0.2, pv.y * 0.15)

    if (!animal.behavior)
      animal.behavior = {}
    animal.behavior.state = 'thrown'
    animal.behavior.wasThrown = true
    animal.behavior.physics = {
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
      spin: (Math.random() - 0.5) * 10,
      rollX: (Math.random() - 0.5) * 16,
      rollZ: (Math.random() - 0.5) * 16,
      bounces: 0,
    }
    animal.group.rotation.x = 0
    animal.group.rotation.z = 0
    animal.playAnimation?.('Idle')
    this._emitInventorySummary()
  }

  _spawnAnimalThought(animal, text, durationSeconds) {
    if (!animal?.group || !text)
      return
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.arc(64, 64, 48, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.82)'
    ctx.font = '56px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 66)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.scale.set(1.2, 1.2, 1.2)
    sprite.position.set(0, 2.35, 0)
    animal.group.add(sprite)

    const ttl = Math.max(0.2, Number(durationSeconds) || 1.0) * 1000
    setTimeout(() => {
      sprite.visible = false
      sprite.removeFromParent?.()
      spriteMaterial.map?.dispose?.()
      spriteMaterial.dispose?.()
    }, ttl)
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

    this._dungeonPortals = [
      {
        id: 'forest',
        name: '森林',
        target: { x: hub.x, z: hub.z - targetOffset },
        color: 0x69_FF_93,
      },
      {
        id: 'plains',
        name: '平原',
        target: { x: hub.x + targetOffset, z: hub.z },
        color: 0x5D_D2_FF,
      },
      {
        id: 'desert',
        name: '沙漠',
        target: { x: hub.x - targetOffset, z: hub.z },
        color: 0xFF_D4_5D,
      },
      {
        id: 'snow',
        name: '雪原',
        target: { x: hub.x, z: hub.z + targetOffset },
        color: 0xD6_F6_FF,
      },
      {
        id: 'mine',
        name: '矿山',
        target: { x: hub.x + targetOffset, z: hub.z + targetOffset },
        color: 0x9D_AA_FF,
      },
    ]

    this.portals = [
      {
        id: 'dungeon_selector',
        name: '地牢入口',
        anchor: { x: hub.x + 10, z: hub.z },
        color: 0x9D_AA_FF,
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

  _openDungeonSelect() {
    if (this.currentWorld !== 'hub')
      return
    if (this.isPaused)
      return

    this.isPaused = true
    this._emitDungeonState()
    this.experience.pointerLock?.exitLock?.()
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')

    const options = (this._dungeonPortals || []).map((p) => {
      const saved = this._portalDungeonProgress?.[p.id] || {}
      return {
        id: p.id,
        name: p.name,
        completed: !!saved.completed,
        read: saved.read ?? 0,
        total: saved.total ?? 0,
      }
    })

    emitter.emit('portal:select_open', { title: '选择地牢入口', options })
  }

  _activatePortal(portal) {
    if (this.currentWorld !== 'hub')
      return

    if (this._activeInventoryPanel)
      this._closeInventoryPanel()
    if (this._carriedAnimal)
      this._dropCarriedAnimal()

    this.isPaused = true
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')
    emitter.emit('loading:show', { title: `正在进入：${portal.name}` })

    setTimeout(() => {
      this._enterDungeon(portal)
      this.isPaused = false
      this._emitDungeonState()
      emitter.emit('loading:hide')
      this.experience.pointerLock?.requestLock?.()
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

    const { surfaceY, spawn, exit, enemies, interactables, reward } = dungeonInfo

    // Exit Mesh (保持视觉标记)
    const exitGeometry = new THREE.TorusGeometry(1.55, 0.22, 16, 48)
    const exitMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF_FF_FF,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const exitMesh = new THREE.Mesh(exitGeometry, exitMaterial)
    exitMesh.rotation.x = Math.PI / 2

    const beamGeo = new THREE.CylinderGeometry(0.55, 0.55, 7.5, 12, 1, true)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xFF_FF_FF,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const exitBeam = new THREE.Mesh(beamGeo, beamMat)

    const exitLight = new THREE.PointLight(0xFF_FF_FF, 1.35, 14, 1.4)

    const exitGroup = new THREE.Group()
    exitGroup.position.set(exit.x, exit.y, exit.z)
    exitMesh.position.set(0, 1.2, 0)
    exitBeam.position.set(0, 4.2, 0)
    exitLight.position.set(0, 3.0, 0)
    exitGroup.add(exitMesh, exitBeam, exitLight)
    this._dungeonGroup.add(exitGroup)

    this._dungeonExit = {
      mesh: exitGroup,
      x: exit.x,
      z: exit.z,
      range: 3,
    }
    if (portal.id === 'mine') {
      exitGroup.position.set(spawn.x, spawn.y, spawn.z)
      this._dungeonExit.x = spawn.x
      this._dungeonExit.z = spawn.z
      this._dungeonExit.range = 3.5
    }

    this.currentWorld = 'dungeon'
    this._activeInteractableId = null
    this._activeInteractable = null
    this._dungeonName = portal.name
    this._activeDungeonPortalId = portal.id
    this._dungeonRewardPending = reward || null
    this._dungeonRewardSpawned = false
    this._dungeonSurfaceY = Number.isFinite(Number(surfaceY)) ? (Number(surfaceY) + 0.05) : null

    // 初始化交互物 (使用 generator 返回的位置)
    this._initDungeonInteractablesV2(interactables, portal.id)
    if (portal.id === 'mine')
      this._initMineOres(spawn)

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
      const isBoss = !!pos.isBoss
      const enemyType = String(pos?.type || '').trim() || 'skeleton'
      const hp = Number.isFinite(Number(pos?.hp)) ? Number(pos.hp) : (isBoss ? 12 : 4)
      const baseScale = Number.isFinite(Number(pos?.scale)) ? Number(pos.scale) : (isBoss ? 1.15 : 1)
      const scale = baseScale * (isBoss ? (2 / 3) : 0.5)

      const enemy = new HumanoidEnemy({
        position: new THREE.Vector3(pos.x, pos.y + 0.1, pos.z),
        rotationY: Math.random() * Math.PI * 2,
        scale,
        colors: { accent: portal.color },
        type: enemyType,
        hp,
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
    if (this._hubAutomationGroup)
      this._hubAutomationGroup.visible = false
    if (this._hubDropsGroup)
      this._hubDropsGroup.visible = false

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
      this.currentWorld = 'hub'
      const { x, z } = this._hubCenter
      this.chunkManager.updateStreaming({ x, z }, true)
      this.chunkManager.pumpIdleQueue()
      const y = this._getSurfaceY(x, z)
      this.player.teleportTo(x, y + 1.1, z)

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
      this._dungeonSurfaceY = null
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
      this._clearNameLabelsByScope('dungeon')
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
      if (this._hubAutomationGroup)
        this._hubAutomationGroup.visible = true
      if (this._hubDropsGroup)
        this._hubDropsGroup.visible = true

      this.isPaused = false
      this._emitDungeonState()
      emitter.emit('loading:hide')
    }, 700)
  }

  _initMineOres(spawn) {
    if (!this._dungeonGroup || !spawn)
      return

    this._mineOres = []

    const group = new THREE.Group()
    this._dungeonGroup.add(group)

    const big = this.resources.items.crystal_big
    const small = this.resources.items.crystal_small

    const fallbackBigGeo = new THREE.DodecahedronGeometry(1.2, 0)
    const fallbackBigMat = new THREE.MeshStandardMaterial({ color: 0x7F_BB_FF, roughness: 0.35, metalness: 0.05 })
    const fallbackSmallGeo = new THREE.DodecahedronGeometry(0.7, 0)
    const fallbackSmallMat = new THREE.MeshStandardMaterial({ color: 0xA9_EF_FF, roughness: 0.35, metalness: 0.05 })

    const offsets = [
      { dx: 3, dz: 4, big: true },
      { dx: -4, dz: 5, big: false },
      { dx: 7, dz: 1, big: false },
      { dx: -7, dz: 2, big: true },
      { dx: 2, dz: -6, big: false },
      { dx: -3, dz: -7, big: true },
      { dx: 9, dz: -4, big: true },
      { dx: -9, dz: -4, big: false },
    ]

    for (const cfg of offsets) {
      const res = cfg.big ? big : small
      let mesh = null
      if (res?.scene) {
        mesh = res.scene.clone()
        const s = cfg.big ? 1.0 : 0.85
        mesh.scale.setScalar(s)
      }
      else {
        mesh = new THREE.Mesh(cfg.big ? fallbackBigGeo : fallbackSmallGeo, cfg.big ? fallbackBigMat : fallbackSmallMat)
      }

      const x = spawn.x + cfg.dx
      const z = spawn.z + cfg.dz
      const y = this._getSurfaceY(x, z)
      mesh.position.set(x, y + 0.1, z)
      mesh.rotation.y = Math.random() * Math.PI * 2
      mesh.traverse?.((child) => {
        if (child?.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      group.add(mesh)
      const itemId = cfg.big ? 'crystal_big' : 'crystal_small'
      this._attachNameLabel(mesh, this._getModelFilenameByResourceKey(itemId), cfg.big ? 1.25 : 0.95, 16, 'dungeon')
      this._mineOres.push({
        mesh,
        itemId,
        count: 1,
        hitRadius: this._getHitRadiusFromObject(mesh, cfg.big ? 1.2 : 0.8),
      })
    }
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

    const chestPortalIds = new Set(['plains', 'snow', 'desert', 'forest'])
    const chestTitles = {
      plains: '平原宝箱',
      snow: '雪原宝箱',
      desert: '沙漠宝箱',
      forest: '森林宝箱',
    }

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

    const list = []
    const dungeonPositions = Array.isArray(positions) ? positions : []

    let startIndex = 0
    if (chestPortalIds.has(portalId)) {
      const pos = dungeonPositions[0] || { x: 0, y: 0, z: 0 }
      const chestId = `portal-chest-${portalId}`
      const chestType = this._getPortalChestType(portalId) || portalId
      const requiredKeyId = this._getRequiredKeyForPortalChest(portalId)
      const state = this._lockedChests?.[chestId] || {}
      const unlocked = !!state.unlocked
      const looted = !!state.looted
      list.push({
        id: chestId,
        title: chestTitles?.[chestType] || '宝箱',
        description: requiredKeyId ? `需要${this._getModelFilenameByResourceKey(requiredKeyId)}解锁` : '需要钥匙解锁',
        hint: looted ? '已开启' : (unlocked ? '按 E 打开宝箱' : '按 E 解锁宝箱'),
        lockedChestId: chestId,
        requiredKeyId,
        unlocked,
        looted,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      })
      startIndex = 1
    }

    for (let i = startIndex; i < dungeonPositions.length; i++) {
      const pos = dungeonPositions[i]
      const config = itemConfigs[(i - startIndex) % itemConfigs.length]
      list.push({
        id: `dungeon-${portalId}-${i - startIndex}`,
        title: config.title,
        description: config.description,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      })
    }

    this._dungeonInteractables = list.map((item) => {
      if (item.lockedChestId) {
        const baseY = Math.floor(Number(item.y) || 0)
        const cx = Math.floor(Number(item.x) || 0)
        const cz = Math.floor(Number(item.z) || 0)
        for (let dy = 1; dy <= 12; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              this.chunkManager?.removeBlockWorld?.(cx + dx, baseY + dy, cz + dz)
            }
          }
        }
      }

      let mesh
      const resource = item.lockedChestId && item.looted
        ? (this.resources.items.chest_open || this.resources.items.chest_closed)
        : this.resources.items.chest_closed
      if (resource?.scene) {
        mesh = resource.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else {
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
        const material = new THREE.MeshStandardMaterial({ color: 0xFFD700 })
        mesh = new THREE.Mesh(geometry, material)
      }

      mesh.position.set(item.x, (item.y ?? 0) + 0.5, item.z)
      if (item.lockedChestId)
        mesh.renderOrder = 4
      this._dungeonInteractablesGroup.add(mesh)

      const hitRadius = this._getHitRadiusFromObject(mesh, 0.9)
      const outlineSize = Math.max(1.08, hitRadius * 2 * 1.08)
      const outline = new THREE.Mesh(
        new THREE.BoxGeometry(outlineSize, outlineSize, outlineSize),
        new THREE.MeshBasicMaterial({
          color: 0xFF_FF_FF,
          transparent: true,
          opacity: 0.9,
          wireframe: true,
          depthWrite: false,
        }),
      )
      outline.visible = false
      outline.position.copy(mesh.position)
      this._dungeonInteractablesGroup.add(outline)

      const range = item.looted ? 0 : (item.lockedChestId ? 3.0 : 2.6)

      const resolved = {
        ...item,
        mesh,
        outline,
        hitRadius,
        range,
        read: !!item.looted,
        spinSpeed: item.lockedChestId ? 0 : 0.01,
        parentGroup: this._dungeonInteractablesGroup,
      }
      return resolved
    })

    for (const item of this._dungeonInteractables) {
      if (!item?.lockedChestId)
        continue
      this._ensureLockedChestLootVisual(item.id, false)
    }
  }

  _updateDungeonInteractables() {
    if (this.currentWorld !== 'dungeon' || !this.player || !this._dungeonInteractables || this._dungeonInteractables.length === 0)
      return

    const pos = this.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const item of this._dungeonInteractables) {
      if (!(Number(item?.range) > 0))
        continue
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
        const hint = best.hint || (best.read ? '按 E 回顾' : '按 E 查看')
        emitter.emit('interactable:prompt', { title: best.title, hint })
      }
    }
    else if (this._activeInteractableId !== null && this._activeInteractable) {
      this._activeInteractableId = null
      this._activeInteractable = null
      emitter.emit('interactable:prompt_clear')
    }

    for (const item of this._dungeonInteractables) {
      if (item.outline)
        item.outline.visible = item.id === this._activeInteractableId
      if (item.mesh) {
        const speed = Number.isFinite(item.spinSpeed) ? item.spinSpeed : 0.01
        if (speed)
          item.mesh.rotation.y += speed
      }
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
        id: 'warehouse',
        title: '仓库',
        description: '存放与取出物品。',
        x: centerX - 4,
        z: centerZ + 4,
        hint: '按 E 打开仓库',
        openInventoryPanel: 'warehouse',
      },
      {
        id: 'story-3',
        title: '黯淡水晶',
        description: '它在你靠近时微微发热，像在等待被唤醒。',
        x: centerX,
        z: centerZ - 6,
      },
    ]

    this.interactables = [...items].map((item) => {
      let mesh
      if (item.id === 'warehouse' && this.resources.items.chest_open) {
        mesh = this.resources.items.chest_open.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else if (this.resources.items.chest_closed) {
        mesh = this.resources.items.chest_closed.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({
            color: 0x9B_6B_FF,
            emissive: new THREE.Color(0x9B_6B_FF),
            emissiveIntensity: 0.6,
            roughness: 0.35,
            metalness: 0.1,
          }),
        )
      }

      const y = this._getSurfaceY(item.x, item.z)
      mesh.position.set(item.x, y + 0.5, item.z)
      try {
        const box = new THREE.Box3().setFromObject(mesh)
        const dy = y - box.min.y
        if (Number.isFinite(dy))
          mesh.position.y += dy
      }
      catch {
      }
      const hitRadius = this._getHitRadiusFromObject(mesh, 0.9)

      const outlineSize = Math.max(1.08, hitRadius * 2 * 1.08)
      const outline = new THREE.Mesh(
        new THREE.BoxGeometry(outlineSize, outlineSize, outlineSize),
        new THREE.MeshBasicMaterial({
          color: 0xFF_FF_FF,
          transparent: true,
          opacity: 0.9,
          wireframe: true,
          depthWrite: false,
        }),
      )
      outline.visible = false
      outline.position.copy(mesh.position)

      this._interactablesGroup.add(mesh, outline)

      return {
        ...item,
        mesh,
        outline,
        hitRadius,
        range: item.looted ? 0 : (item.id === 'warehouse' ? 3.4 : (item.lockedChestId ? 3.0 : 2.6)),
        read: !!item.looted,
        spinSpeed: (item.id === 'warehouse' || item.lockedChestId) ? 0 : 0.01,
      }
    })
  }

  _initHubAutomation() {
    if (this._hubAutomationGroup) {
      this._hubAutomationGroup.clear()
      this._hubAutomationGroup.removeFromParent?.()
    }
    this._hubAutomationGroup = new THREE.Group()
    this.scene.add(this._hubAutomationGroup)

    if (this._hubDropsGroup) {
      this._hubDropsGroup.clear()
      this._hubDropsGroup.removeFromParent?.()
    }
    this._hubDropsGroup = new THREE.Group()
    this.scene.add(this._hubDropsGroup)

    this._hubDrops = []
    this._hubDropSeq = 1

    const cx = this._hubCenter?.x ?? 0
    const cz = this._hubCenter?.z ?? 0

    const quarryX = cx + 12
    const quarryZ = cz + 3
    const boxX = cx - 12
    const boxZ = cz + 3
    const quarryY = this._getSurfaceY(quarryX, quarryZ)
    const boxY = this._getSurfaceY(boxX, boxZ)

    this._hubAutomation = {
      quarry: { x: quarryX, y: quarryY, z: quarryZ, radius: 4.6 },
      box: { x: boxX, y: boxY, z: boxZ, radius: 3.2 },
    }

    this._hubColliders = []

    const quarryMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.35, 0),
      new THREE.MeshStandardMaterial({ color: 0x6B6B6B, roughness: 0.95, metalness: 0.0 }),
    )
    quarryMesh.position.set(quarryX, quarryY + 1.2, quarryZ)
    quarryMesh.castShadow = true
    quarryMesh.receiveShadow = true
    this._hubAutomationGroup.add(quarryMesh)
    this._hubColliders.push({ mesh: quarryMesh, hitRadius: this._getHitRadiusFromObject(quarryMesh, 1.3) })

    let boxMesh
    const resource = this.resources.items.chest_closed
    if (resource) {
      boxMesh = resource.scene.clone()
      boxMesh.scale.set(0.7, 0.7, 0.7)
    }
    else {
      boxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.9, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xC29A5B, roughness: 0.75, metalness: 0.05 }),
      )
    }
    boxMesh.position.set(boxX, boxY + 0.5, boxZ)
    this._hubAutomationGroup.add(boxMesh)
    this._hubColliders.push({ mesh: boxMesh, hitRadius: this._getHitRadiusFromObject(boxMesh, 1.0) })

    this._hubDropGeo = new THREE.IcosahedronGeometry(0.22, 0)
    this._hubDropMaterials = {
      stone: new THREE.MeshStandardMaterial({ color: 0x8B8B8B, roughness: 0.95, metalness: 0.0 }),
      default: new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.9, metalness: 0.0 }),
    }
  }

  _spawnHubDrop(itemId, count, x, z) {
    if (!this._hubDropsGroup)
      return null
    const id = `drop_${this._hubDropSeq++}`
    const mat = this._hubDropMaterials?.[itemId] || this._hubDropMaterials?.default
    const mesh = new THREE.Mesh(this._hubDropGeo, mat)
    const y = this._getSurfaceY(x, z) + 0.25
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this._attachNameLabel(mesh, this._getModelFilenameByResourceKey(itemId), 0.45, 12)
    this._hubDropsGroup.add(mesh)
    this._hubDrops.push({
      id,
      itemId,
      count: Math.max(1, Math.floor(Number(count) || 1)),
      mesh,
      baseY: y,
      age: 0,
    })
    return id
  }

  _removeHubDropById(id) {
    if (!id || !this._hubDrops || this._hubDrops.length === 0)
      return null
    const index = this._hubDrops.findIndex(d => d.id === id)
    if (index < 0)
      return null
    const drop = this._hubDrops[index]
    if (drop?.mesh) {
      drop.mesh.visible = false
      drop.mesh.removeFromParent?.()
    }
    this._hubDrops.splice(index, 1)
    return drop
  }

  _findNearestHubDrop(x, z, maxDist) {
    if (!this._hubDrops || this._hubDrops.length === 0)
      return null
    const max = Number(maxDist) || 0
    const maxD2 = max * max
    let best = null
    let bestD2 = Infinity
    for (const drop of this._hubDrops) {
      const pos = drop?.mesh?.position
      if (!pos)
        continue
      const dx = pos.x - x
      const dz = pos.z - z
      const d2 = dx * dx + dz * dz
      if (d2 > maxD2)
        continue
      if (d2 < bestD2) {
        bestD2 = d2
        best = drop
      }
    }
    return best
  }

  _updateHubDrops() {
    if (!this._hubDrops || this._hubDrops.length === 0)
      return
    const dt = this.experience.time.delta * 0.001
    const t = (this.experience.time.elapsed ?? 0) * 0.001
    for (let i = this._hubDrops.length - 1; i >= 0; i--) {
      const drop = this._hubDrops[i]
      if (!drop?.mesh) {
        this._hubDrops.splice(i, 1)
        continue
      }
      drop.age += dt
      if (drop.age > 160) {
        drop.mesh.visible = false
        drop.mesh.removeFromParent?.()
        this._hubDrops.splice(i, 1)
        continue
      }
      drop.mesh.rotation.y += 1.15 * dt
      drop.mesh.position.y = drop.baseY + Math.sin(t * 2.2 + i) * 0.06
    }
  }

  _updateInteractables() {
    if (!this.player || !this.interactables || this.interactables.length === 0)
      return

    const pos = this.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const item of this.interactables) {
      const r = Number(item?.range) || 0
      if (r <= 0)
        continue
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
        const hint = best.hint || (best.read ? '按 E 回顾' : '按 E 查看')
        emitter.emit('interactable:prompt', { title: best.title, hint })
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
        const speed = Number.isFinite(item.spinSpeed) ? item.spinSpeed : 0.01
        if (speed)
          item.mesh.rotation.y += speed
      }
      if (item.outline) {
        item.outline.rotation.y = item.mesh.rotation.y
      }
    }
  }

  _initAnimals() {
    this.animals = []
    if (this.animalsGroup) {
      this.animalsGroup.clear()
      this.animalsGroup.removeFromParent?.()
    }
    this.animalsGroup = new THREE.Group()
    this.scene.add(this.animalsGroup)

    const types = ['animal_pig', 'animal_sheep', 'animal_chicken', 'animal_cat', 'animal_wolf', 'animal_horse', 'animal_dog']
    const count = 15
    const centerX = this._hubCenter?.x ?? 0
    const centerZ = this._hubCenter?.z ?? 0

    const seeds = [
      { type: 'animal_pig', role: 'miner', label: '矿工鼠', dx: 6, dz: -6 },
      { type: 'animal_sheep', role: 'carrier', label: '绵绵球', dx: -6, dz: -6 },
      { type: 'animal_chicken', role: null, label: '小鸡', dx: 6, dz: 6 },
      { type: 'animal_cat', role: null, label: '猫猫', dx: -6, dz: 6 },
      { type: 'animal_wolf', role: null, label: '狼', dx: 10, dz: 0 },
      { type: 'animal_horse', role: null, label: '马', dx: 0, dz: 10 },
      { type: 'animal_dog', role: null, label: '狗狗', dx: 0, dz: -10 },
    ]

    const spawnAnimal = (cfg) => {
      const x = centerX + (cfg.dx ?? 0)
      const z = centerZ + (cfg.dz ?? 0)
      const y = this._getSurfaceY(x, z)
      const stats = this._npcStats?.[cfg.type] || this._npcStats?.enemy_default || {}
      const hp = Math.max(1, Math.floor(Number(stats.hp) || 3))

      const animal = new HumanoidEnemy({
        position: new THREE.Vector3(x, y, z),
        scale: 0.8,
        type: cfg.type,
        hp,
      })
      animal._attackDamage = Math.max(1, Math.floor(Number(stats.damage) || 1))
      animal._attackRange = Number.isFinite(stats.attackRange) ? stats.attackRange : 2.1
      animal._attackWindupMs = Math.max(120, Math.floor(Number(stats.windupMs) || 260))

      animal._resourceKey = cfg.type
      animal._typeLabel = cfg.label || cfg.type
      this._attachNameLabel(animal.group, this._getModelFilenameByResourceKey(cfg.type), 2.15, 18, 'hub')
      animal.group.rotation.y = Math.random() * Math.PI * 2
      animal.addTo(this.animalsGroup)

      animal.behavior = {
        state: 'idle',
        timer: Math.random() * 2,
        role: cfg.role || null,
        carrierEnabled: cfg.role !== 'carrier',
        carrying: null,
        spawnCooldown: 0,
        targetDropId: null,
        wasThrown: false,
      }

      this.animals.push(animal)
    }

    for (const cfg of seeds)
      spawnAnimal(cfg)

    for (let i = seeds.length; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)]
      // Random position within safe range
      const range = 26
      const x = centerX + (Math.random() - 0.5) * 2 * range
      const z = centerZ + (Math.random() - 0.5) * 2 * range

      spawnAnimal({ type, dx: x - centerX, dz: z - centerZ, role: null, label: type })
    }
  }

  _updateAnimals() {
    if (!this.animals)
      return

    const dt = this.experience.time.delta * 0.001
    const now = this.experience.time?.elapsed ?? 0
    const playerPos = this.player?.getPosition?.()
    const playerDead = !!this.player?.isDead

    this.animals.forEach((animal) => {
      animal.update()

      if (!animal.behavior)
        return

      const data = animal.behavior

      if (data.state === 'carried' && animal === this._carriedAnimal) {
        const camera = this.experience.camera?.instance
        if (camera) {
          const camPos = new THREE.Vector3()
          const camDir = new THREE.Vector3()
          camera.getWorldPosition(camPos)
          camera.getWorldDirection(camDir)
          camDir.normalize()

          const hold = camPos.clone().add(camDir.multiplyScalar(2.1))
          hold.y -= 0.85
          const groundY = this._getSurfaceY(hold.x, hold.z) + 0.2
          if (hold.y < groundY)
            hold.y = groundY

          animal.group.position.lerp(hold, 0.35)
          animal.group.rotation.y = Math.atan2(camDir.x, camDir.z)
        }
        return
      }

      if (data.physics) {
        const physics = data.physics
        physics.vy -= 18 * dt
        animal.group.position.x += physics.vx * dt
        animal.group.position.y += physics.vy * dt
        animal.group.position.z += physics.vz * dt
        animal.group.rotation.y += (physics.spin || 0) * dt
        animal.group.rotation.x += (physics.rollX || 0) * dt
        animal.group.rotation.z += (physics.rollZ || 0) * dt

        const pos = animal.group.position
        const groundY = this._getSurfaceY(pos.x, pos.z)
        if (pos.y <= groundY) {
          pos.y = groundY
          if (physics.vy < 0) {
            physics.vy = -physics.vy * 0.45
            physics.vx *= 0.72
            physics.vz *= 0.72
            physics.spin *= 0.7
            physics.rollX = (physics.rollX || 0) * 0.75
            physics.rollZ = (physics.rollZ || 0) * 0.75
            physics.bounces = (physics.bounces || 0) + 1
          }
        }

        const speed = Math.hypot(physics.vx, physics.vy, physics.vz)
        if ((physics.bounces || 0) >= 4 || speed < 1.2) {
          data.physics = null
          const quarry = this._hubAutomation?.quarry
          const box = this._hubAutomation?.box
          const role = data.role || null
          const wasThrown = !!data.wasThrown
          data.wasThrown = false

          const dxq = quarry ? (pos.x - quarry.x) : 0
          const dzq = quarry ? (pos.z - quarry.z) : 0
          const d2q = quarry ? (dxq * dxq + dzq * dzq) : Infinity

          const dxb = box ? (pos.x - box.x) : 0
          const dzb = box ? (pos.z - box.z) : 0
          const d2b = box ? (dxb * dxb + dzb * dzb) : Infinity

          if (wasThrown && role === 'miner' && quarry && d2q <= quarry.radius * quarry.radius) {
            data.state = 'mining'
            data.spawnCooldown = 0.35 + Math.random() * 0.25
            data.timer = 9999
            animal.playAnimation?.('Walk')
            animal.group.rotation.x = 0
            animal.group.rotation.z = 0
            this._spawnAnimalThought(animal, '💡', 1.1)
            emitter.emit('dungeon:toast', { text: '矿工鼠开始挖矿' })
          }
          else if (wasThrown && role === 'carrier' && quarry && d2q <= (quarry.radius + 4.0) * (quarry.radius + 4.0)) {
            data.state = 'idle'
            data.timer = 1.1 + Math.random() * 1.2
            data.carrierEnabled = true
            animal.playAnimation?.('Idle')
            animal.group.rotation.x = 0
            animal.group.rotation.z = 0
            this._spawnAnimalThought(animal, '💡', 0.9)
            emitter.emit('dungeon:toast', { text: '绵绵球准备搬运' })
          }
          else if (role === 'carrier' && box && d2b <= (box.radius + 2.0) * (box.radius + 2.0)) {
            data.state = 'idle'
            data.timer = 1.1 + Math.random() * 1.2
            animal.playAnimation?.('Idle')
            animal.group.rotation.x = 0
            animal.group.rotation.z = 0
          }
          else {
            data.state = 'idle'
            data.timer = 2 + Math.random() * 2
            animal.playAnimation('Idle')
            animal.group.rotation.x = 0
            animal.group.rotation.z = 0
          }
        }
        return
      }

      if (playerPos && !playerDead && !animal.isDead && animal.group) {
        const stats = this._npcStats?.[animal._resourceKey] || this._npcStats?.enemy_default || {}
        const aggroR = Number.isFinite(stats.aggroRadius) ? stats.aggroRadius : 8
        const attackR = Number.isFinite(stats.attackRange) ? stats.attackRange : 2.1
        const forceAggro = (data.forceAggroUntil ?? 0) > now
        const isEnemy = animal._resourceKey?.startsWith('enemy_') ?? false

        const ex = animal.group.position.x
        const ez = animal.group.position.z
        const dxp = playerPos.x - ex
        const dzp = playerPos.z - ez
        const d2p = dxp * dxp + dzp * dzp
        const aggro2 = aggroR * aggroR
        const attack2 = attackR * attackR

        const shouldAggro = forceAggro || (isEnemy && d2p <= aggro2)

        if (!shouldAggro && (data.state === 'chase' || data.state === 'attack')) {
          data.state = 'idle'
          data.timer = 1.2 + Math.random() * 1.8
          animal.playAnimation?.('Idle')
        }

        if (shouldAggro) {
          const len = Math.hypot(dxp, dzp)
          const nx = len > 0.0001 ? (dxp / len) : 0
          const nz = len > 0.0001 ? (dzp / len) : 1

          const facing = Math.atan2(dxp, dzp)
          animal.group.rotation.y = facing

          if (d2p > attack2) {
            data.state = 'chase'
            animal.playWalk?.() || animal.playAnimation?.('Walk')
            const sp = Number.isFinite(stats.speed) ? stats.speed : 1.9
            const step = sp * dt
            animal.group.position.x += nx * step
            animal.group.position.z += nz * step
          }
          else {
            data.state = 'attack'
            animal.tryAttack?.({
              now,
              damage: Math.max(1, Math.floor(Number(stats.damage) || 1)),
              range: attackR,
              windupMs: Math.max(120, Math.floor(Number(stats.windupMs) || 260)),
            })
          }

          const hit = animal.consumeAttackHit?.({ now })
          if (hit && this.player?.takeDamage) {
            const source = new THREE.Vector3(animal.group.position.x, animal.group.position.y, animal.group.position.z)
            this.player.takeDamage({ amount: hit.damage, canBeBlocked: true, sourcePosition: source })
          }

          const pos = animal.group.position
          const groundY = this._getSurfaceY(pos.x, pos.z)
          animal.group.position.y += (groundY - animal.group.position.y) * 0.18
          return
        }
      }

      if (data.state === 'mining') {
        const quarry = this._hubAutomation?.quarry
        if (!quarry) {
          data.state = 'idle'
          data.timer = 1 + Math.random() * 2
          animal.playAnimation?.('Idle')
          return
        }
        const pos = animal.group.position
        const dx = pos.x - quarry.x
        const dz = pos.z - quarry.z
        const d2 = dx * dx + dz * dz
        if (d2 > (quarry.radius + 1.25) * (quarry.radius + 1.25)) {
          data.state = 'idle'
          data.timer = 1 + Math.random() * 2
          animal.playAnimation?.('Idle')
          return
        }
        animal.group.rotation.y += 6.0 * dt
        data.spawnCooldown -= dt
        if (data.spawnCooldown <= 0) {
          data.spawnCooldown = 0.75 + Math.random() * 0.35
          if ((this._hubDrops?.length ?? 0) < 40) {
            const ox = (Math.random() - 0.5) * 1.8
            const oz = (Math.random() - 0.5) * 1.8
            this._spawnHubDrop('stone', 1, quarry.x + ox, quarry.z + oz)
          }
        }
        const groundY = this._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.18
        return
      }

      if (data.state === 'carry_pickup') {
        const targetDrop = this._hubDrops?.find(d => d.id === data.targetDropId) || null
        if (!targetDrop?.mesh) {
          data.state = 'idle'
          data.timer = 1 + Math.random() * 2
          data.targetDropId = null
          animal.playAnimation?.('Idle')
          return
        }
        const pos = animal.group.position
        const tx = targetDrop.mesh.position.x
        const tz = targetDrop.mesh.position.z
        const dx = tx - pos.x
        const dz = tz - pos.z
        const dist = Math.hypot(dx, dz)
        if (dist <= 0.75) {
          const removed = this._removeHubDropById(targetDrop.id)
          if (removed) {
            data.carrying = { itemId: removed.itemId, count: removed.count }
            data.state = 'carry_to_box'
            data.targetDropId = null
            animal.playAnimation?.('Walk')
          }
          else {
            data.state = 'idle'
            data.timer = 1 + Math.random() * 2
            data.targetDropId = null
            animal.playAnimation?.('Idle')
          }
          return
        }
        const nx = dx / Math.max(0.0001, dist)
        const nz = dz / Math.max(0.0001, dist)
        const speed = 2.05 * dt
        pos.x += nx * speed
        pos.z += nz * speed
        animal.group.rotation.y = Math.atan2(nx, nz)
        const groundY = this._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.15
        return
      }

      if (data.state === 'carry_to_box') {
        const box = this._hubAutomation?.box
        if (!box || !data.carrying) {
          data.state = 'idle'
          data.timer = 1 + Math.random() * 2
          data.carrying = null
          animal.playAnimation?.('Idle')
          return
        }
        const pos = animal.group.position
        const dx = box.x - pos.x
        const dz = box.z - pos.z
        const dist = Math.hypot(dx, dz)
        if (dist <= 1.2) {
          this._addInventoryItem('warehouse', data.carrying.itemId, data.carrying.count)
          emitter.emit('dungeon:toast', { text: `入库：${data.carrying.itemId} x${data.carrying.count}` })
          data.carrying = null
          data.state = 'idle'
          data.timer = 1.2 + Math.random() * 1.8
          animal.playAnimation?.('Idle')
          return
        }
        const nx = dx / Math.max(0.0001, dist)
        const nz = dz / Math.max(0.0001, dist)
        const speed = 2.15 * dt
        pos.x += nx * speed
        pos.z += nz * speed
        animal.group.rotation.y = Math.atan2(nx, nz)
        const groundY = this._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.18
        return
      }

      if (data.role === 'carrier' && data.carrierEnabled && (data.state === 'idle' || data.state === 'walk') && !data.carrying) {
        const pos = animal.group.position
        const nearest = this._findNearestHubDrop(pos.x, pos.z, 10)
        if (nearest) {
          data.state = 'carry_pickup'
          data.targetDropId = nearest.id
          animal.playAnimation?.('Walk')
          return
        }
      }

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
      if (enemy && !enemy.isBoss && enemy.isDead && !enemy._coinDropped) {
        enemy._coinDropped = true
        this._spawnDungeonCoinDrop(enemy)
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
        const forceAggro = (data.forceAggroUntil ?? 0) > now

        if (forceAggro || d2p <= aggro2) {
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
          if (this.currentWorld === 'dungeon' && Number.isFinite(Number(this._dungeonSurfaceY)))
            enemy.group.position.y = Number(this._dungeonSurfaceY)
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
        if (this.currentWorld === 'dungeon' && Number.isFinite(Number(this._dungeonSurfaceY)))
          enemy.group.position.y = Number(this._dungeonSurfaceY)
      }
    }
  }

  _spawnDungeonCoinDrop(enemy) {
    if (this.currentWorld !== 'dungeon')
      return
    if (!enemy?.group)
      return
    if (!this._dungeonInteractables)
      this._dungeonInteractables = []
    if (!this._dungeonInteractablesGroup) {
      this._dungeonInteractablesGroup = new THREE.Group()
      this._dungeonGroup?.add?.(this._dungeonInteractablesGroup)
    }

    const portalId = this._activeDungeonPortalId || 'dungeon'
    const index = this._dungeonInteractables.length
    const id = `coin-${portalId}-${index}`

    const pos = new THREE.Vector3()
    enemy.group.getWorldPosition(pos)
    const x = pos.x
    const z = pos.z
    const y = this._getSurfaceY(x, z)

    let mesh = null
    const resource = this.resources.items.coin
    if (resource?.scene) {
      mesh = resource.scene.clone(true)
      mesh.scale.setScalar(0.65)
    }
    else {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16),
        new THREE.MeshStandardMaterial({ color: 0xFFCC33, roughness: 0.35, metalness: 0.25, emissive: 0x332200, emissiveIntensity: 0.2 }),
      )
    }
    mesh.position.set(x, y + 0.6, z)
    mesh.traverse?.((child) => {
      if (child?.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    this._dungeonInteractablesGroup.add(mesh)

    const hitRadius = this._getHitRadiusFromObject(mesh, 0.55)
    this._dungeonInteractables.push({
      id,
      title: '金币',
      description: '战利品。可作为后续消耗性资源。',
      hint: '按 E 拾取',
      pickupItemId: 'coin',
      pickupAmount: 1,
      x,
      y,
      z,
      mesh,
      hitRadius,
      range: 2.8,
      read: false,
      spinSpeed: 0.04,
    })
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
        emitter.emit('portal:prompt', { title: best.name, hint: '按 E 选择地牢' })
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

    const dt = this.experience.time.delta * 0.001
    const t = (this.experience.time.elapsed ?? 0) * 0.001

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
      this._updateHubDrops()
      if (this.interactables && this.interactables.length) {
        for (const item of this.interactables) {
          if (!item?.lockedChestId)
            continue
          this._updateLockedChestLootVisual(item, dt, t)
        }
      }

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

      this._resolvePlayerHubCollisions()
    }
    else if (this.currentWorld === 'dungeon') {
      this._updateDungeonInteractables()
      this._updateDungeonExit()
      this._updateLockOn()
      this._updateDungeonEnemies()
      if (this._dungeonInteractables && this._dungeonInteractables.length) {
        for (const item of this._dungeonInteractables) {
          if (!item?.lockedChestId)
            continue
          this._updateLockedChestLootVisual(item, dt, t)
        }
      }
      this._resolvePlayerEnemyCollisions()
      this._resolvePlayerDungeonObjectCollisions()
    }

    if (this.currentWorld === 'hub')
      this._updateLockOn()
    this._updateMaterialGun()
    this._updateCapture()
    this._updateNameLabelVisibility()
  }

  _getHitRadiusFromObject(object3d, fallback = 0.9) {
    try {
      if (!object3d)
        return fallback
      const box = new THREE.Box3().setFromObject(object3d)
      const size = new THREE.Vector3()
      box.getSize(size)
      const radius = Math.max(size.x, size.z) * 0.5
      if (Number.isFinite(radius) && radius > 0.05)
        return radius
      return fallback
    }
    catch {
      return fallback
    }
  }

  _resolvePlayerCircleCollisions(colliders) {
    const movement = this.player?.movement
    if (!movement || !colliders || colliders.length === 0)
      return

    const base = movement.position
    const pr = movement.capsule?.radius ?? 0.3
    const v = movement.worldVelocity

    for (const collider of colliders) {
      const group = collider?.group
      const mesh = collider?.mesh
      const pos = group?.position || mesh?.position || collider?.position
      if (!pos)
        continue
      if (group && group.visible === false)
        continue
      if (mesh && mesh.visible === false)
        continue

      const er = collider?.hitRadius ?? collider?.radius ?? 0.9
      if (!(Number.isFinite(er) && er > 0))
        continue
      const r = pr + er

      const dx = base.x - pos.x
      const dz = base.z - pos.z
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

  _resolvePlayerHubCollisions() {
    if (this.currentWorld !== 'hub')
      return

    const colliders = []

    if (this.animals && this.animals.length) {
      for (const animal of this.animals) {
        if (!animal?.group)
          continue
        if (animal === this._carriedAnimal)
          continue
        colliders.push({ group: animal.group, hitRadius: animal.hitRadius ?? 0.9 })
      }
    }

    if (this.interactables && this.interactables.length) {
      for (const item of this.interactables) {
        if (!item?.mesh)
          continue
        colliders.push({ mesh: item.mesh, hitRadius: item.hitRadius ?? 0.9 })
      }
    }

    if (this._hubColliders && this._hubColliders.length) {
      for (const c of this._hubColliders)
        colliders.push(c)
    }

    this._resolvePlayerCircleCollisions(colliders)
  }

  _resolvePlayerDungeonObjectCollisions() {
    if (this.currentWorld !== 'dungeon')
      return

    const colliders = []
    if (this._dungeonInteractables && this._dungeonInteractables.length) {
      for (const item of this._dungeonInteractables) {
        if (!item?.mesh || item.mesh.visible === false)
          continue
        colliders.push({ mesh: item.mesh, hitRadius: item.hitRadius ?? 0.9 })
      }
    }
    if (this._mineOres && this._mineOres.length) {
      for (const ore of this._mineOres) {
        if (!ore?.mesh || ore.mesh.visible === false)
          continue
        colliders.push({ mesh: ore.mesh, hitRadius: ore.hitRadius ?? 0.9 })
      }
    }

    this._resolvePlayerCircleCollisions(colliders)
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
    this.animalsGroup?.clear?.()
    this.animalsGroup?.removeFromParent?.()
    this._hubAutomationGroup?.clear?.()
    this._hubAutomationGroup?.removeFromParent?.()
    this._hubDropsGroup?.clear?.()
    this._hubDropsGroup?.removeFromParent?.()
    this._dungeonGroup?.clear?.()
    this._dungeonGroup?.removeFromParent?.()
    this._hubDropGeo?.dispose?.()
    this._hubDropGeo = null
    if (this._hubDropMaterials) {
      for (const m of Object.values(this._hubDropMaterials)) {
        m?.dispose?.()
      }
    }
    this._hubDropMaterials = null
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
    if (this._onInteractableAction)
      emitter.off('interactable:action', this._onInteractableAction)
    if (this._onToggleBackpack)
      emitter.off('input:toggle_backpack', this._onToggleBackpack)
    if (this._onToggleWarehouse)
      emitter.off('input:toggle_warehouse', this._onToggleWarehouse)
    if (this._onInventoryClose)
      emitter.off('inventory:close', this._onInventoryClose)
    if (this._onInventoryTransfer)
      emitter.off('inventory:transfer', this._onInventoryTransfer)
    if (this._onGrabPet)
      emitter.off('input:grab_pet', this._onGrabPet)
    if (this._onChestClose)
      emitter.off('chest:close', this._onChestClose)
    if (this._onChestUseKey)
      emitter.off('chest:use_key', this._onChestUseKey)
    if (this._onChestTakeItem)
      emitter.off('chest:take', this._onChestTakeItem)
    if (this._onPortalSelect)
      emitter.off('portal:select', this._onPortalSelect)
    if (this._onPortalSelectClose)
      emitter.off('portal:select_close', this._onPortalSelectClose)
    if (this._onPunchStraight)
      emitter.off('input:punch_straight', this._onPunchStraight)
    if (this._onPunchHook)
      emitter.off('input:punch_hook', this._onPunchHook)
    if (this._onToggleBlockEditMode)
      emitter.off('input:toggle_block_edit_mode', this._onToggleBlockEditMode)
    if (this._onMouseDown)
      emitter.off('input:mouse_down', this._onMouseDown)
    if (this._onMouseUp)
      emitter.off('input:mouse_up', this._onMouseUp)
    if (this._onLockOn)
      emitter.off('input:lock_on', this._onLockOn)
    if (this._onCaptureInput)
      emitter.off('input:capture', this._onCaptureInput)
    if (this._onPlayerDamaged)
      emitter.off('combat:player_damaged', this._onPlayerDamaged)
    if (this._inventorySaveTimer)
      clearTimeout(this._inventorySaveTimer)
    if (this._lockedChestsSaveTimer)
      clearTimeout(this._lockedChestsSaveTimer)

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
    emitter.emit('combat:toggle_lock', null)
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
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)

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
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)

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
    const keyItemId = portalId === 'plains' || portalId === 'snow' || portalId === 'desert' || portalId === 'forest'
      ? `key_${portalId}`
      : null

    if (keyItemId) {
      const resource = this.resources.items.key
      if (resource?.scene) {
        mesh = resource.scene.clone()
        mesh.scale.set(0.9, 0.9, 0.9)
      }
      else {
        const geometry = new THREE.BoxGeometry(0.5, 0.9, 0.18)
        const material = new THREE.MeshStandardMaterial({ color: 0xFFDD88, roughness: 0.55, metalness: 0.25, emissive: 0x442200, emissiveIntensity: 0.35 })
        mesh = new THREE.Mesh(geometry, material)
      }
    }
    else {
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
    }

    mesh.position.set(this._dungeonRewardPending.x, this._dungeonRewardPending.y + 0.5, this._dungeonRewardPending.z)
    this._dungeonInteractablesGroup.add(mesh)

    const hitRadius = this._getHitRadiusFromObject(mesh, keyItemId ? 0.6 : 0.9)

    if (keyItemId) {
      this._dungeonInteractables.push({
        id,
        title: this._getModelFilenameByResourceKey(keyItemId),
        description: '一把奇怪的钥匙，似乎能打开某处的宝箱。',
        hint: '按 E 拾取',
        pickupItemId: keyItemId,
        pickupAmount: 1,
        x: this._dungeonRewardPending.x,
        z: this._dungeonRewardPending.z,
        mesh,
        hitRadius,
        range: 2.8,
        read: false,
        spinSpeed: 0.03,
      })
    }
    else {
      this._dungeonInteractables.push({
        id,
        title: '任务宝箱',
        description: '你听见机关松动的声音，宝箱出现了。',
        x: this._dungeonRewardPending.x,
        z: this._dungeonRewardPending.z,
        mesh,
        hitRadius,
        range: 2.6,
        read: false,
        spinSpeed: 0.01,
      })
    }

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
