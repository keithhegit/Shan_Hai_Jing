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
import BeamsSystem from './systems/beams-system.js'
import CaptureSystem from './systems/capture-system.js'
import CombatSystem from './systems/combat-system.js'
import DropSystem from './systems/drop-system.js'
import DungeonEnemySystem from './systems/dungeon-enemy-system.js'
import DungeonSystem from './systems/dungeon-system.js'
import HubNpcSystem from './systems/hub-npc-system.js'
import InteractableSystem from './systems/interactable-system.js'
import InventorySystem from './systems/inventory-system.js'
import LockedChestSystem from './systems/locked-chest-system.js'
import PortalSystem from './systems/portal-system.js'
import SystemManager from './systems/system-manager.js'
import createWorldContext from './systems/world-context.js'
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
    this._dungeonSpawn = null
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

    this._inventory = null
    this._inventoryConfig = null
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
    this._lockedChests = {}
    this._lockedChestsSaveTimer = null
    this._activeChestId = null

    this._carriedAnimal = null
    this._summonedAllies = []
    this._summonedAlliesGroup = null
    this._armedCanisterThrow = null
    this._selectedInventoryItemId = null
    this._selectedCanisterItemId = null
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

    this._systemManager = new SystemManager(createWorldContext(this))
    this._beamsSystem = new BeamsSystem()
    this._systemManager.register(this._beamsSystem)
    this.inventorySystem = new InventorySystem()
    this._systemManager.register(this.inventorySystem)
    this.dungeonSystem = new DungeonSystem()
    this._systemManager.register(this.dungeonSystem)
    this.interactableSystem = new InteractableSystem()
    this._systemManager.register(this.interactableSystem)
    this.lockedChestSystem = new LockedChestSystem()
    this._systemManager.register(this.lockedChestSystem)
    this.portalSystem = new PortalSystem()
    this._systemManager.register(this.portalSystem)
    this.combatSystem = new CombatSystem()
    this._systemManager.register(this.combatSystem)
    this.dungeonEnemySystem = new DungeonEnemySystem()
    this._systemManager.register(this.dungeonEnemySystem)
    this.hubNpcSystem = new HubNpcSystem()
    this._systemManager.register(this.hubNpcSystem)
    this.dropSystem = new DropSystem()
    this._systemManager.register(this.dropSystem)
    this.captureSystem = new CaptureSystem()
    this._systemManager.register(this.captureSystem)

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
          if (!this.isPaused && this._armedCanisterThrow) {
            const ok = this._throwArmedCanister()
            if (ok)
              return
          }
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
      this._onPetRecharge = (payload) => {
        this._rechargeCanister(payload)
      }
      this._onInventoryGridPlace = (payload) => {
        this._placeBackpackGridItem(payload)
      }
      this._onInventoryDrop = (payload) => {
        this.inventorySystem?.dropBackpackGridItem?.(payload)
      }
      this._onWarehousePage = (payload) => {
        this.inventorySystem?.setWarehousePage?.(payload?.page)
      }
      this._onGrabPet = () => {
        const canisterId = this._selectedCanisterItemId
        const count = canisterId ? (this._inventory?.backpack?.items?.[canisterId] || 0) : 0
        if (!this.isPaused && canisterId && count > 0) {
          const ok = this._armCanisterThrow(canisterId)
          if (ok) {
            const label = this._getModelFilenameByResourceKey?.(canisterId) || canisterId
            emitter.emit('ui:log', { text: `已举起：${label}（右键投掷）` })
            emitter.emit('dungeon:toast', { text: `已举起：${label}（右键投掷）` })
          }
          return
        }
        this._toggleCarryAnimal()
      }
      this._onInventorySelect = (payload) => {
        const itemId = payload?.itemId ? String(payload.itemId) : null
        this._selectedInventoryItemId = itemId
        this._selectedCanisterItemId = itemId && itemId.startsWith('canister_') ? itemId : null
      }

      emitter.on('input:toggle_backpack', this._onToggleBackpack)
      emitter.on('input:toggle_warehouse', this._onToggleWarehouse)
      emitter.on('inventory:close', this._onInventoryClose)
      emitter.on('inventory:transfer', this._onInventoryTransfer)
      emitter.on('inventory:equip', this._onInventoryEquip)
      emitter.on('inventory:grid_place', this._onInventoryGridPlace)
      emitter.on('inventory:drop', this._onInventoryDrop)
      emitter.on('inventory:warehouse_page', this._onWarehousePage)
      emitter.on('inventory:select', this._onInventorySelect)
      emitter.on('input:grab_pet', this._onGrabPet)
      emitter.on('pet:recharge', this._onPetRecharge)

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
    return this.captureSystem?.getCaptureCandidate?.() ?? null
  }

  _tryStartCapture() {
    return this.captureSystem?.tryStartCapture?.()
  }

  _breakCapture({ reason, healTarget } = {}) {
    return this.captureSystem?.breakCapture?.({ reason, healTarget })
  }

  _completeCapture() {
    return this.captureSystem?.completeCapture?.()
  }

  _pickCanisterIdForTarget(target) {
    return this.captureSystem?.pickCanisterIdForTarget?.(target) ?? 'canister_small'
  }

  _updateCaptureBeam() {
    return this.captureSystem?.updateCaptureBeam?.()
  }

  _updateCapture() {
    return this.captureSystem?.updateCapture?.()
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
    const id = itemId ? String(itemId) : ''
    if (id !== 'material_gun' && !id.startsWith('canister_'))
      return
    const items = this._getBagItems('backpack')
    const count = Math.max(0, Math.floor(Number(items?.[id]) || 0))
    if (count <= 0) {
      emitter.emit('dungeon:toast', { text: id === 'material_gun' ? '背包里没有物质枪' : '背包里没有收容罐' })
      return
    }

    if (id === 'material_gun') {
      const next = !this._isMaterialGunEquipped
      this._isMaterialGunEquipped = next
      this.player?.setMatterGunEquipped?.(next)
      if (!next)
        this._stopMaterialGunFire()
      emitter.emit('dungeon:toast', { text: next ? '已装备物质枪' : '已收起物质枪' })
      return
    }

    const metaIndex = payload?.metaIndex ?? null
    const meta = Number.isFinite(Number(metaIndex))
      ? (this.inventorySystem?.inventory?.canisterMeta?.[id]?.[Math.max(0, Math.floor(Number(metaIndex)))] || null)
      : (this.inventorySystem?.peekCanisterMeta?.(id) || null)
    if (meta?.exhausted) {
      emitter.emit('dungeon:toast', { text: '该灵宠精疲力竭：需要 1 金币充能' })
      return
    }

    const ok = this._armCanisterThrow(id, metaIndex)
    if (!ok) {
      emitter.emit('dungeon:toast', { text: '收容罐不可用' })
      return
    }
    if (this._activeInventoryPanel)
      this._closeInventoryPanel()
    const label = this._getModelFilenameByResourceKey?.(id) || id
    emitter.emit('ui:log', { text: `已抱起：${label}（右键投掷）` })
    emitter.emit('dungeon:toast', { text: `已抱起：${label}（右键投掷）` })
  }

  _rechargeCanister(payload) {
    const itemId = payload?.itemId ? String(payload.itemId) : ''
    const metaIndex = payload?.metaIndex ?? null
    if (!itemId.startsWith('canister_'))
      return
    const coins = Math.max(0, Math.floor(Number(this._inventory?.backpack?.items?.coin) || 0))
    if (coins <= 0) {
      emitter.emit('dungeon:toast', { text: '金币不足：需要 1 金币充能' })
      return
    }
    const ok = this.inventorySystem?.rechargeCanisterMeta?.(itemId, metaIndex)
    if (!ok) {
      emitter.emit('dungeon:toast', { text: '无法充能：收容罐状态异常' })
      return
    }
    this._removeInventoryItem('backpack', 'coin', 1)
    emitter.emit('dungeon:toast', { text: '已充能：收容罐恢复可投掷' })
    this._emitInventorySummary?.()
    this._emitInventoryState?.()
    this._scheduleInventorySave?.()
  }

  _startMaterialGunFire() {
    return this.combatSystem?.startMaterialGunFire?.()
  }

  _stopMaterialGunFire() {
    return this.combatSystem?.stopMaterialGunFire?.()
  }

  _updateMaterialGun() {
    return this.combatSystem?.updateMaterialGun?.()
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
    return this.combatSystem?.toggleLockOn?.()
  }

  _updateLockOn() {
    return this.combatSystem?.updateLockOn?.()
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
    return this.lockedChestSystem?.loadLockedChests?.() || {}
  }

  _saveLockedChestsNow() {
    return this.lockedChestSystem?.saveLockedChestsNow?.()
  }

  _scheduleLockedChestsSave() {
    return this.lockedChestSystem?.scheduleLockedChestsSave?.()
  }

  _loadInventory() {
    return this.inventorySystem?._loadInventory?.()
  }

  _sanitizeGridLayouts(raw) {
    return this.inventorySystem?._sanitizeGridLayouts?.(raw)
  }

  _sanitizeItemMap(map) {
    return this.inventorySystem?._sanitizeItemMap?.(map)
  }

  _saveInventoryNow() {
    this.inventorySystem?._saveNow?.()
  }

  _scheduleInventorySave() {
    this.inventorySystem?.scheduleSave?.()
  }

  _getBagItems(bagName) {
    return this.inventorySystem?.getBagItems?.(bagName)
  }

  _getItemTotalCount(items) {
    return this.inventorySystem?._getItemTotalCount?.(items)
  }

  _getItemWeight(itemId) {
    return this.inventorySystem?._getItemWeight?.(itemId)
  }

  _getBackpackMaxSlots() {
    return this.inventorySystem?._getBackpackMaxSlots?.()
  }

  _getBackpackMaxWeight() {
    return this.inventorySystem?._getBackpackMaxWeight?.()
  }

  _getBagWeight(items) {
    return this.inventorySystem?._getBagWeight?.(items)
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
    if (portalId === 'plains' || portalId === 'snow' || portalId === 'desert' || portalId === 'forest')
      return portalId
    return null
  }

  _getRequiredKeyForPortalChest(portalId) {
    const chestType = this._getPortalChestType(portalId)
    if (!chestType)
      return null
    return `key_${chestType}`
  }

  _getLockedChestPool() {
    return this.lockedChestSystem?.getLockedChestPool?.() || []
  }

  _findLockedChest(chestId) {
    return this.lockedChestSystem?.findLockedChest?.(chestId) || null
  }

  _getLockedChestPayload(chestId) {
    return this.lockedChestSystem?.getLockedChestPayload?.(chestId) || null
  }

  _createToolMesh(itemId) {
    return this.lockedChestSystem?.createToolMesh?.(itemId) || null
  }

  _removeLockedChestLootVisual(chestId) {
    return this.lockedChestSystem?.removeLockedChestLootVisual?.(chestId)
  }

  _ensureLockedChestLootVisual(chestId, withPop = false) {
    return this.lockedChestSystem?.ensureLockedChestLootVisual?.(chestId, withPop)
  }

  _updateLockedChestLootVisual(chest, dt, t) {
    return this.lockedChestSystem?.updateLockedChestLootVisual?.(chest, dt, t)
  }

  _openLockedChest(chestId) {
    return this.lockedChestSystem?.openLockedChest?.(chestId)
  }

  _useKeyForLockedChest(payload) {
    return this.lockedChestSystem?.useKeyForLockedChest?.(payload)
  }

  _takeLockedChestLoot(payload) {
    return this.lockedChestSystem?.takeLockedChestLoot?.(payload)
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
    return this.inventorySystem?._canAddToBackpack?.(itemId, amount)
  }

  _emitInventorySummary() {
    this.inventorySystem?.emitInventorySummary?.()
  }

  _emitInventoryState() {
    this.inventorySystem?.emitInventoryState?.()
  }

  _buildBackpackGridSnapshot(items, layout) {
    return this.inventorySystem?.buildBackpackGridSnapshot?.(items, layout)
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
    this.inventorySystem?.addItem?.(bagName, itemId, amount)
  }

  _removeInventoryItem(bagName, itemId, amount = 1) {
    return this.inventorySystem?.removeItem?.(bagName, itemId, amount)
  }

  _transferInventory(payload) {
    this.inventorySystem?.transfer?.(payload)
  }

  _placeBackpackGridItem(payload) {
    this.inventorySystem?.placeBackpackGridItem?.(payload)
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
    return this.hubNpcSystem?.findGrabCandidateAnimal?.(options) || null
  }

  _findFrontHubDrop(options = {}) {
    return this.dropSystem?.findFrontHubDrop?.(options) || null
  }

  _suckHubDrop(drop) {
    return !!this.dropSystem?.pickupHubDrop?.(drop)
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
    return this.hubNpcSystem?.toggleCarryAnimal?.()
  }

  _dropCarriedAnimal() {
    return this.hubNpcSystem?.dropCarriedAnimal?.()
  }

  _throwCarriedAnimal() {
    return this.hubNpcSystem?.throwCarriedAnimal?.()
  }

  _armCanisterThrow(itemId, metaIndex = null) {
    const id = String(itemId || '')
    const count = this._inventory?.backpack?.items?.[id] || 0
    if (!id.startsWith('canister_') || count <= 0)
      return false
    if (this._armedCanisterThrow?.itemId === id) {
      this._clearArmedCanisterThrow()
      return true
    }
    this._armedCanisterThrow = { itemId: id, metaIndex: Number.isFinite(Number(metaIndex)) ? Math.max(0, Math.floor(Number(metaIndex))) : null }
    this._ensureCanisterCarryVisual(id)
    this._ensureCanisterAimPreview()
    return true
  }

  _clearArmedCanisterThrow() {
    this._armedCanisterThrow = null
    this._canisterCarry?.removeFromParent?.()
    this._canisterCarry = null
    this._canisterAimPreview?.removeFromParent?.()
    this._canisterAimPreview = null
  }

  _ensureCanisterCarryVisual(itemId) {
    const gltf = this.resources?.items?.canister
    const scene = gltf?.scene
    if (!scene)
      return null
    if (this._canisterCarry)
      this._canisterCarry.removeFromParent?.()
    const group = new THREE.Group()
    group.name = `CanisterCarry:${itemId}`
    const obj = scene.clone(true)
    obj.traverse?.((c) => {
      if (c?.isMesh) {
        c.castShadow = true
        c.receiveShadow = true
      }
    })
    obj.scale.set(0.65, 0.65, 0.65)
    group.add(obj)
    this.scene.add(group)
    this._canisterCarry = group
    return group
  }

  _ensureCanisterAimPreview() {
    if (this._canisterAimPreview)
      return this._canisterAimPreview
    const group = new THREE.Group()
    group.name = 'CanisterAimPreview'
    const geom = new THREE.BufferGeometry()
    const mat = new THREE.LineBasicMaterial({ color: 0x8BE9FD, transparent: true, opacity: 0.85 })
    const line = new THREE.Line(geom, mat)
    line.frustumCulled = false
    group.add(line)
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xFFD166, roughness: 0.8, metalness: 0.0 }),
    )
    marker.frustumCulled = false
    group.add(marker)
    group.userData._line = line
    group.userData._marker = marker
    this.scene.add(group)
    this._canisterAimPreview = group
    return group
  }

  _updateCanisterCarryAndAim() {
    const camera = this.experience.camera?.instance
    const carry = this._canisterCarry
    const aim = this._canisterAimPreview
    if (!camera || !this._armedCanisterThrow?.itemId) {
      carry && (carry.visible = false)
      aim && (aim.visible = false)
      return
    }
    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)
    camDir.normalize()

    const hold = camPos.clone().add(camDir.clone().multiplyScalar(2.0))
    hold.y -= 0.85
    const groundY = this._getSurfaceY(hold.x, hold.z) + 0.2
    if (hold.y < groundY)
      hold.y = groundY

    if (carry) {
      carry.visible = true
      carry.position.lerp(hold, 0.35)
      carry.rotation.y = Math.atan2(camDir.x, camDir.z)
    }

    if (!aim)
      return
    aim.visible = true
    const line = aim.userData?._line
    const marker = aim.userData?._marker
    if (!line?.geometry || !marker)
      return

    const start = hold.clone()
    const v0 = camDir.clone().multiplyScalar(12.0)
    v0.y = Math.max(3.5, camDir.y * 10.0 + 5.5)
    const g = 18.0
    const dt = 1 / 24
    const points = []
    const pos = start.clone()
    const vel = v0.clone()
    for (let i = 0; i < 36; i++) {
      points.push(pos.clone())
      vel.y -= g * dt
      pos.addScaledVector(vel, dt)
      const gy = this._getSurfaceY(pos.x, pos.z)
      if (pos.y <= gy) {
        pos.y = gy
        points.push(pos.clone())
        break
      }
    }
    const positions = new Float32Array(points.length * 3)
    for (let i = 0; i < points.length; i++) {
      positions[i * 3 + 0] = points[i].x
      positions[i * 3 + 1] = points[i].y
      positions[i * 3 + 2] = points[i].z
    }
    line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    line.geometry.computeBoundingSphere()
    marker.position.copy(points[points.length - 1] || start)
  }

  _applyStun(entity, untilMs) {
    if (!entity)
      return
    const t = Math.max(0, Math.floor(Number(untilMs) || 0))
    entity._stunnedUntil = Math.max(Number(entity._stunnedUntil) || 0, t)
    entity.playStun?.()
  }

  _showStunIndicator(target, durationMs = 3000) {
    if (!target)
      return
    if (!target.userData)
      target.userData = {}
    if (target.userData._stunIndicator)
      return
    const div = document.createElement('div')
    div.innerHTML = '<svg width="40" height="40" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M10 28c6-12 38-12 44 0-6 12-38 12-44 0Z" fill="rgba(255,255,255,0.92)"/><path d="M26 18l4-10 6 12 10-4-8 10 12 6-14 2 4 10-10-6-8 10 2-14-12-2 12-6Z" fill="rgba(20,20,20,0.85)"/></svg>'
    div.style.pointerEvents = 'none'
    const label = new CSS2DObject(div)
    label.position.set(0, 2.65, 0)
    target.add(label)
    target.userData._stunIndicator = label
    const ttl = Math.max(200, Math.floor(Number(durationMs) || 3000))
    setTimeout(() => {
      const cur = target?.userData?._stunIndicator
      if (cur) {
        cur.removeFromParent?.()
        cur.element?.remove?.()
        delete target.userData._stunIndicator
      }
    }, ttl)
  }

  _updateCanisterProjectile(dt) {
    const proj = this._canisterProjectile
    if (!proj?.group || !proj.velocity)
      return
    const now = this.experience.time?.elapsed ?? 0
    const g = 18.0
    proj.velocity.y -= g * dt
    proj.group.position.addScaledVector(proj.velocity, dt)
    proj.group.rotation.y += 4.2 * dt
    proj.group.rotation.x += 3.2 * dt

    const pos = proj.group.position
    const groundY = this._getSurfaceY(pos.x, pos.z)
    if (pos.y <= groundY) {
      pos.y = groundY
      this._finalizeCanisterProjectileImpact({ position: pos.clone(), now })
      return
    }

    if (this.chunkManager?.getBlockWorld) {
      const ix = Math.floor(pos.x)
      const iz = Math.floor(pos.z)
      const iy = Math.floor(pos.y)
      const b = this.chunkManager.getBlockWorld(ix, iy, iz)
      if (b?.id && b.id !== blocks.empty.id) {
        this._finalizeCanisterProjectileImpact({ position: pos.clone(), now })
        return
      }
    }

    const enemies = this.currentWorld === 'dungeon' ? (Array.isArray(this._dungeonEnemies) ? this._dungeonEnemies : []) : []
    for (const enemy of enemies) {
      if (!enemy?.group || enemy.isDead)
        continue
      const ex = enemy.group.position.x
      const ez = enemy.group.position.z
      const dx = ex - pos.x
      const dz = ez - pos.z
      const hitR = Math.max(0.65, Number(enemy.hitRadius) || 0.9)
      if (dx * dx + dz * dz <= hitR * hitR) {
        this._finalizeCanisterProjectileImpact({ position: pos.clone(), now, enemy })
        return
      }
    }
  }

  _finalizeCanisterProjectileImpact({ position, now, enemy } = {}) {
    const proj = this._canisterProjectile
    if (!proj)
      return
    const resourceKey = proj.resourceKey
    const itemId = proj.itemId
    const meta = proj.meta
    proj.group?.removeFromParent?.()
    this._canisterProjectile = null

    const ally = this._spawnSummonedAlly({
      resourceKey,
      position,
      displayName: proj.displayName,
      capturedKind: proj.capturedKind,
      canisterItemId: itemId,
      canisterMeta: meta,
    })
    if (ally) {
      this._applyStun(ally, (now ?? 0) + 3000)
      this._showStunIndicator(ally.group, 3000)
    }
    if (enemy) {
      this._applyStun(enemy, (now ?? 0) + 3000)
      this._showStunIndicator(enemy.group, 3000)
    }
  }

  _throwArmedCanister() {
    if (this.isPaused)
      return false
    const itemId = this._armedCanisterThrow?.itemId
    if (!itemId)
      return false
    const count = this._inventory?.backpack?.items?.[itemId] || 0
    if (count <= 0)
      return false

    const metaIndex = this._armedCanisterThrow?.metaIndex ?? null
    const meta = this.inventorySystem?.consumeCanisterMeta?.(itemId, metaIndex) || null
    const resourceKey = meta?.capturedResourceKey || this._getFallbackSummonResourceKey(itemId)
    if (!resourceKey)
      return false

    const carryPos = this._canisterCarry?.position?.clone?.()
    const startPos = carryPos || new THREE.Vector3(this.player?.getPosition?.()?.x ?? 0, this.player?.getPosition?.()?.y ?? 0, this.player?.getPosition?.()?.z ?? 0)
    const dir = new THREE.Vector3()
    this.experience.camera?.instance?.getWorldDirection?.(dir)
    dir.normalize()
    const v0 = dir.clone().multiplyScalar(12.0)
    v0.y = Math.max(3.5, dir.y * 10.0 + 5.5)

    this._removeInventoryItem('backpack', itemId, 1)
    this._emitInventorySummary?.()
    this._emitInventoryState?.()
    this._scheduleInventorySave?.()

    this._canisterProjectile?.group?.removeFromParent?.()
    const gltf = this.resources?.items?.canister
    const scene = gltf?.scene
    if (!scene)
      return false
    const projGroup = new THREE.Group()
    projGroup.name = `CanisterProjectile:${itemId}`
    const obj = scene.clone(true)
    obj.scale.set(0.65, 0.65, 0.65)
    projGroup.add(obj)
    projGroup.position.copy(startPos)
    this.scene.add(projGroup)
    this._canisterProjectile = {
      group: projGroup,
      itemId,
      meta,
      resourceKey,
      displayName: meta?.capturedDisplayName || null,
      capturedKind: meta?.capturedKind || null,
      velocity: v0,
      hitEnemy: null,
    }
    this._clearArmedCanisterThrow()
    return true
  }

  _getFallbackSummonResourceKey(canisterItemId) {
    const id = String(canisterItemId || '')
    if (id === 'canister_small')
      return 'animal_wolf'
    if (id === 'canister_medium')
      return 'enemy_orc'
    if (id === 'canister_large')
      return 'enemy_giant'
    return null
  }

  _ensureSummonedAlliesGroup() {
    if (this._summonedAlliesGroup)
      return this._summonedAlliesGroup
    const group = new THREE.Group()
    group.name = 'SummonedAllies'
    this._summonedAlliesGroup = group
    if (this.currentWorld === 'dungeon' && this._dungeonGroup)
      this._dungeonGroup.add(group)
    else
      this.scene.add(group)
    return group
  }

  _spawnSummonedAlly({ resourceKey, position, displayName, capturedKind, canisterItemId, canisterMeta } = {}) {
    const key = String(resourceKey || '')
    if (!key)
      return null

    const group = this._ensureSummonedAlliesGroup()
    const y = this._getSurfaceY?.(position?.x ?? 0, position?.z ?? 0) ?? (position?.y ?? 0)
    const spawn = new THREE.Vector3(position?.x ?? 0, y, position?.z ?? 0)
    const kind = String(capturedKind || '').toLowerCase()
    const isBoss = kind === 'boss' || String(canisterItemId || '') === 'canister_large'
    const isAnimal = key.startsWith('animal_')
    const scale = isBoss ? 0.7 : (key === 'animal_horse' ? 0.25 : (isAnimal ? 0.5 : 0.5))
    const ally = new HumanoidEnemy({ type: key, position: spawn, scale })
    ally._resourceKey = key
    ally._typeLabel = displayName || (this._getModelFilenameByResourceKey?.(key) || key)
    ally._isSummonedAlly = true
    this._summonedSeq = (this._summonedSeq ?? 1)
    ally._summonedId = ally._summonedId || `ally_${this._summonedSeq++}`
    ally._summonedKind = capturedKind || null
    ally._summonedFromCanisterId = canisterItemId || null
    ally._summonedFromCanisterMeta = canisterMeta || null

    group.add(ally.group)
    this._summonedAllies.push(ally)
    emitter.emit('ui:log', { text: `灵兽出战：${ally._typeLabel}` })
    return ally
  }

  _recallSummonedAlly(ally) {
    if (!ally || !ally._isSummonedAlly || !ally.group)
      return false
    const itemId = String(ally._summonedFromCanisterId || '')
    if (!itemId.startsWith('canister_'))
      return false
    const meta = ally._summonedFromCanisterMeta && typeof ally._summonedFromCanisterMeta === 'object'
      ? ally._summonedFromCanisterMeta
      : { capturedResourceKey: ally._resourceKey || null, capturedKind: ally._summonedKind || null, capturedDisplayName: ally._typeLabel || null }

    const canAdd = this._canAddToBackpack?.(itemId, 1)
    if (canAdd) {
      this._addInventoryItem('backpack', itemId, 1)
      this.inventorySystem?.recordCanisterMeta?.(itemId, meta)
      this._scheduleInventorySave?.()
      this._emitInventorySummary?.()
      this._emitInventoryState?.()
    }
    else if (this.currentWorld === 'dungeon') {
      this.dropSystem?.spawnDungeonItemDrop?.({ itemId, amount: 1, x: ally.group.position.x, z: ally.group.position.z, canisterMeta: meta })
    }
    else if (this.currentWorld === 'hub') {
      this.dropSystem?.spawnHubDrop?.(itemId, 1, ally.group.position.x, ally.group.position.z, { persist: true, canisterMeta: meta })
    }
    else {
      return false
    }

    emitter.emit('ui:log', { text: `已收容：${ally._typeLabel}` })
    emitter.emit('dungeon:toast', { text: `已收容：${ally._typeLabel}` })
    this._despawnSummonedAlly(ally)
    return true
  }

  _despawnSummonedAlly(ally) {
    if (!ally)
      return false
    const idx = this._summonedAllies.indexOf(ally)
    if (idx >= 0)
      this._summonedAllies.splice(idx, 1)
    ally.group?.removeFromParent?.()
    ally.group && (ally.group.visible = false)
    return true
  }

  _clearSummonedAllies() {
    const list = Array.isArray(this._summonedAllies) ? [...this._summonedAllies] : []
    list.forEach(a => this._despawnSummonedAlly(a))
    this._summonedAlliesGroup?.removeFromParent?.()
    this._summonedAlliesGroup = null
    this._armedCanisterThrow = null
  }

  _syncSummonedAlliesGroupForCurrentWorld() {
    const group = this._summonedAlliesGroup
    if (!group)
      return
    const nextParent = (this.currentWorld === 'dungeon' && this._dungeonGroup)
      ? this._dungeonGroup
      : this.scene
    if (group.parent !== nextParent)
      nextParent.add(group)
  }

  _teleportSummonedAlliesNearPlayer() {
    const list = Array.isArray(this._summonedAllies) ? this._summonedAllies : []
    if (list.length === 0 || !this.player)
      return
    const p = this.player.getPosition?.() || this.player.group?.position
    if (!p)
      return

    for (let i = 0; i < list.length; i++) {
      const ally = list[i]
      if (!ally?.group)
        continue
      const angle = (i / Math.max(1, list.length)) * Math.PI * 2
      const radius = 1.65 + i * 0.35
      const x = p.x + Math.cos(angle) * radius
      const z = p.z + Math.sin(angle) * radius
      const y = this._getSurfaceY?.(x, z) ?? p.y ?? 0
      ally.group.position.set(x, y, z)
      if (ally.basePosition)
        ally.basePosition.set(x, y, z)
    }
  }

  _repositionSummonedAlliesForTeleport() {
    this._syncSummonedAlliesGroupForCurrentWorld()
    this._teleportSummonedAlliesNearPlayer()
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
    return this.portalSystem?.openDungeonSelect?.()
  }

  _activatePortal(portal) {
    return this.dungeonSystem?.activatePortal?.(portal)
  }

  _isDungeonMeshReadyAroundSpawn(radiusChunks = 1) {
    return this.dungeonSystem?.isDungeonMeshReadyAroundSpawn?.(radiusChunks) ?? true
  }

  _enterDungeon(portal) {
    return this.dungeonSystem?.enterDungeon?.(portal)
  }

  _exitDungeon() {
    return this.dungeonSystem?.exitDungeon?.()
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
    return this.dungeonSystem?.updateExitPrompt?.()
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
        this.chunkManager?.removePlantsInWorldBoxes?.([{
          minX: cx - 3,
          maxX: cx + 3,
          minZ: cz - 3,
          maxZ: cz + 3,
          minY: baseY,
          maxY: baseY + 20,
        }])
        for (let dy = 1; dy <= 12; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              this.chunkManager?.removeBlockWorld?.(cx + dx, baseY + dy, cz + dz)
            }
          }
        }
      }

      let mesh
      const resource = item.lockedChestId
        ? (item.looted ? (this.resources.items.chest_open || this.resources.items.chest_closed) : this.resources.items.chest_closed)
        : (this.resources.items.star || this.resources.items.chest_closed)
      if (resource?.scene) {
        mesh = resource.scene.clone()
        mesh.scale.set(0.5, 0.5, 0.5)
      }
      else {
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
        const material = new THREE.MeshStandardMaterial({ color: 0xFFD700 })
        mesh = new THREE.Mesh(geometry, material)
      }

      if (item.lockedChestId) {
        const baseY = Math.floor(Number(item.y) || 0)
        mesh.position.set(item.x, baseY + 1.0, item.z)
        const targetBottom = baseY + 1.0
        const minY = this._getMinYFromObject(mesh, null)
        if (Number.isFinite(minY)) {
          const dy = targetBottom - minY + 0.02
          mesh.position.y += dy
        }
        mesh.renderOrder = 4
      }
      else {
        mesh.position.set(item.x, (item.y ?? 0) + 0.5, item.z)
      }
      this._dungeonInteractablesGroup.add(mesh)

      const hitRadius = this._getHitRadiusFromObject(mesh, 0.9)
      const outline = item.lockedChestId
        ? (() => {
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
            return outline
          })()
        : null

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

  _initInteractables() {
    this._interactablesGroup = new THREE.Group()
    this.scene.add(this._interactablesGroup)

    const centerX = this._hubCenter?.x ?? Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)
    const centerZ = this._hubCenter?.z ?? Math.floor((this.chunkManager.chunkWidth ?? 64) / 2)

    const items = [
      {
        id: 'warehouse',
        title: '仓库',
        description: '存放与取出物品。',
        x: centerX + 12,
        z: centerZ + 3,
        hint: '按 E 打开仓库',
        openInventoryPanel: 'warehouse',
      },
    ]

    this.interactables = [...items].map((item) => {
      let mesh
      if (item.id === 'warehouse' && this.resources.items.chest_open) {
        mesh = this.resources.items.chest_open.scene.clone()
        mesh.scale.set(1, 1, 1)
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
    return this.dropSystem?.spawnHubDrop?.(itemId, count, x, z) || null
  }

  _removeHubDropById(id) {
    return this.dropSystem?.removeHubDropById?.(id) || null
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
    return this.dropSystem?.updateHubDrops?.()
  }

  _initAnimals() {
    return this.hubNpcSystem?.initAnimals?.()
  }

  _updateAnimals() {
    return this.hubNpcSystem?.updateAnimals?.()
  }

  _updateDungeonEnemies() {
    return this.dungeonEnemySystem?.updateDungeonEnemies?.()
  }

  _spawnDungeonCoinDrop(enemy) {
    return this.dungeonEnemySystem?.spawnDungeonCoinDrop?.(enemy)
  }

  _spawnDungeonItemDrop({ itemId, amount = 1, x = null, z = null } = {}) {
    return this.dropSystem?.spawnDungeonItemDrop?.({ itemId, amount, x, z })
  }

  _updatePortals() {
    return this.portalSystem?.updatePortals?.()
  }

  update() {
    if (this.isPaused)
      return

    const dt = this.experience.time.delta * 0.001
    const t = (this.experience.time.elapsed ?? 0) * 0.001
    this._systemManager?.update?.(dt, t)

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

    this._updateCanisterCarryAndAim()
    this._updateCanisterProjectile(dt)

    // 每帧射线检测：用于 hover 提示与后续交互
    if (this.blockRaycaster)
      this.blockRaycaster.update()

    // 更新辅助框位置
    if (this.blockSelectionHelper)
      this.blockSelectionHelper.update()

    if (this.currentWorld === 'hub') {
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
      this._resolvePlayerEnemyCollisions()
      this._resolvePlayerDungeonObjectCollisions()
    }
    this._updateNameLabelVisibility()
  }

  _updateCaptureHint() {
    return this.captureSystem?.updateCaptureHint?.()
  }

  _onInteract() {
    return this.interactableSystem?.handleInteract?.()
  }

  _onInteractableClose(payload) {
    return this.interactableSystem?.handleInteractableClose?.(payload)
  }

  _onInteractableAction(payload) {
    return this.interactableSystem?.handleInteractableAction?.(payload)
  }

  _updateInteractables() {
    return this.interactableSystem?._updateActiveFromList?.(this.interactables)
  }

  _updateDungeonInteractables() {
    return this.interactableSystem?._updateActiveFromList?.(this._dungeonInteractables)
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

  _getMinYFromObject(object3d, fallback = null) {
    try {
      if (!object3d)
        return fallback
      const box = new THREE.Box3().setFromObject(object3d)
      const y = box.min?.y
      return Number.isFinite(y) ? y : fallback
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
    this._systemManager?.destroy?.()
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
    if (this._onQuickReturn)
      emitter.off('input:quick_return', this._onQuickReturn)
    if (this._onPause)
      emitter.off('game:pause', this._onPause)
    if (this._onResume)
      emitter.off('game:resume', this._onResume)
    if (this._onToggleBackpack)
      emitter.off('input:toggle_backpack', this._onToggleBackpack)
    if (this._onToggleWarehouse)
      emitter.off('input:toggle_warehouse', this._onToggleWarehouse)
    if (this._onInventoryClose)
      emitter.off('inventory:close', this._onInventoryClose)
    if (this._onInventoryTransfer)
      emitter.off('inventory:transfer', this._onInventoryTransfer)
    if (this._onInventoryEquip)
      emitter.off('inventory:equip', this._onInventoryEquip)
    if (this._onInventoryGridPlace)
      emitter.off('inventory:grid_place', this._onInventoryGridPlace)
    if (this._onInventorySelect)
      emitter.off('inventory:select', this._onInventorySelect)
    if (this._onWarehousePage)
      emitter.off('inventory:warehouse_page', this._onWarehousePage)
    if (this._onInventoryDrop)
      emitter.off('inventory:drop', this._onInventoryDrop)
    if (this._onPetRecharge)
      emitter.off('pet:recharge', this._onPetRecharge)
    if (this._onGrabPet)
      emitter.off('input:grab_pet', this._onGrabPet)
    if (this._onToggleBlockEditMode)
      emitter.off('input:toggle_block_edit_mode', this._onToggleBlockEditMode)
    if (this._onMouseDown)
      emitter.off('input:mouse_down', this._onMouseDown)
    if (this._onMouseUp)
      emitter.off('input:mouse_up', this._onMouseUp)
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
    return this.combatSystem?.clearLockOn?.()
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
    const keyItemId = this._getBossKeyDropForPortalId?.(portalId)

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

  _getBossKeyDropForPortalId(portalId) {
    if (portalId === 'plains')
      return 'key_snow'
    if (portalId === 'snow')
      return 'key_desert'
    if (portalId === 'desert')
      return 'key_forest'
    if (portalId === 'forest')
      return 'key_plains'
    return null
  }

  _tryPlayerAttack({ damage, range, minDot, cooldownMs }) {
    return this.combatSystem?.tryPlayerAttack?.({ damage, range, minDot, cooldownMs })
  }
}
