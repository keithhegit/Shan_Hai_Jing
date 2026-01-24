import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'
import HumanoidEnemy from '../enemies/humanoid-enemy.js'

export default class DungeonSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.dungeonSystem = this
  }

  destroy() {
  }

  update() {
    this.updateExitPrompt()
  }

  updateExitPrompt() {
    const world = this.world
    if (!world || world.currentWorld !== 'dungeon' || !world._dungeonExit || !world.player)
      return

    if (world._activeInteractableId !== null) {
      if (world._activeDungeonExit) {
        world._activeDungeonExit = null
        emitter.emit('portal:prompt_clear')
      }
      return
    }

    const pos = world.player.getPosition()
    const dx = pos.x - world._dungeonExit.x
    const dz = pos.z - world._dungeonExit.z
    const d2 = dx * dx + dz * dz
    const shouldActivate = d2 <= world._dungeonExit.range * world._dungeonExit.range

    if (shouldActivate) {
      const progress = world._dungeonProgress
      const total = progress?.total ?? 0
      const read = progress?.read ?? 0
      const hint = total > 0 && read < total
        ? `按 E 返回（未读 ${total - read}/${total}）`
        : total > 0
          ? '按 E 返回（探索完成）'
          : '按 E 返回'
      const payload = { title: '返回超平坦', hint }

      if (!world._activeDungeonExit)
        world._activeDungeonExit = world._dungeonExit
      if (!world._activeDungeonExitPrompt || world._activeDungeonExitPrompt.hint !== payload.hint) {
        world._activeDungeonExitPrompt = payload
        emitter.emit('portal:prompt', payload)
      }
    }
    else if (world._activeDungeonExit) {
      world._activeDungeonExit = null
      world._activeDungeonExitPrompt = null
      emitter.emit('portal:prompt_clear')
    }

    if (world._dungeonExit.mesh)
      world._dungeonExit.mesh.rotation.y += 0.02
  }

  emitDungeonProgress() {
    return this.world?._emitDungeonProgress?.()
  }

  activatePortal(portal) {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return

    if (world._activeInventoryPanel)
      world._closeInventoryPanel()
    if (world._carriedAnimal)
      world._dropCarriedAnimal()

    world.isPaused = true
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')
    emitter.emit('loading:show', { title: `正在进入：${portal.name}`, portalId: portal.id, kind: 'dungeon-enter' })

    setTimeout(() => {
      this.enterDungeon(portal)
      const portalId = String(portal.id || '')
      const startAt = performance.now()
      const step = () => {
        if (world.currentWorld !== 'dungeon' || world._activeDungeonPortalId !== portalId) {
          return
        }
        world.chunkManager?.pumpIdleQueue?.()
        const elapsed = performance.now() - startAt
        if (this.isDungeonMeshReadyAroundSpawn(1) || elapsed >= 12_000) {
          emitter.emit('loading:dungeon_mesh_ready', { portalId })
          setTimeout(() => {
            if (world._activeDungeonPortalId !== portalId)
              return
            world.isPaused = false
            world._emitDungeonState?.()
            emitter.emit('loading:hide')
            world.experience.pointerLock?.requestLock?.()
          }, 6250)
          return
        }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, 700)
  }

  isDungeonMeshReadyAroundSpawn(radiusChunks = 1) {
    const world = this.world
    if (!world || world.currentWorld !== 'dungeon')
      return false
    const spawn = world._dungeonSpawn
    const cm = world.chunkManager
    if (!spawn || !cm)
      return true
    const w = Math.max(1, Math.floor(Number(cm.chunkWidth) || 16))
    const baseX = Math.floor(Number(spawn.x) / w)
    const baseZ = Math.floor(Number(spawn.z) / w)
    const r = Math.max(0, Math.min(2, Math.floor(Number(radiusChunks) || 0)))
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const chunk = cm.getChunk?.(baseX + dx, baseZ + dz)
        if (!chunk || chunk.state !== 'meshReady')
          return false
      }
    }
    return true
  }

  enterDungeon(portal) {
    const world = this.world
    if (!world)
      return

    const { x, z } = portal.target
    world.chunkManager.updateStreaming({ x, z }, true)
    world.chunkManager.pumpIdleQueue()

    if (!world._dungeonGroup) {
      world._dungeonGroup = new THREE.Group()
      world.scene.add(world._dungeonGroup)
    }
    else {
      world._dungeonGroup.clear()
    }

    const dungeonInfo = world._blockDungeonGenerator.generate(x, z, portal.id)

    const { surfaceY, spawn, exit, enemies, interactables, reward } = dungeonInfo
    if (spawn)
      world.chunkManager?.forceSyncGenerateArea?.(spawn.x, spawn.z, 1)

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
    world._dungeonGroup.add(exitGroup)

    world._dungeonExit = {
      mesh: exitGroup,
      x: exit.x,
      z: exit.z,
      range: 3,
    }

    world.currentWorld = 'dungeon'
    world._activeInteractableId = null
    world._activeInteractable = null
    world._dungeonName = portal.name
    world._activeDungeonPortalId = portal.id
    world._dungeonRewardPending = reward || null
    world._dungeonRewardSpawned = false
    world._dungeonSurfaceY = Number.isFinite(Number(surfaceY)) ? (Number(surfaceY) + 0.05) : null
    world._dungeonSpawn = spawn ? { ...spawn } : null

    world._initDungeonInteractablesV2(interactables, portal.id)
    if (portal.id === 'mine')
      world._initMineOres(spawn)

    const saved = world._portalDungeonProgress?.[portal.id]
    if (saved && world._dungeonInteractables) {
      const readCount = Math.min(saved.read ?? 0, world._dungeonInteractables.length)
      for (let i = 0; i < readCount; i++) {
        const item = world._dungeonInteractables[i]
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
        world._dungeonCompleted = true
    }
    world._emitDungeonProgress()
    world._emitDungeonState()

    if (world._dungeonEnemiesGroup) {
      world._dungeonEnemiesGroup.clear()
    }
    else {
      world._dungeonEnemiesGroup = new THREE.Group()
      world._dungeonGroup.add(world._dungeonEnemiesGroup)
    }

    world._dungeonEnemies = []

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
      enemy.addTo(world._dungeonEnemiesGroup)
      world._dungeonEnemies.push(enemy)
    })

    world._activePortalId = null
    world._activePortal = null
    world._activeDungeonExit = null

    if (world.player?.movement?.config?.respawn?.position) {
      if (!world._savedRespawnPosition)
        world._savedRespawnPosition = { ...world.player.movement.config.respawn.position }
      world.player.movement.config.respawn.position = { x: spawn.x, y: spawn.y + 1.5, z: spawn.z }
    }

    world.player.teleportTo(spawn.x, spawn.y + 1.1, spawn.z)

    if (world.environment) {
      world.environment.params.fogDensity = 0.03
      world.environment.updateFog()
    }

    if (world.animalsGroup)
      world.animalsGroup.visible = false
    if (world._hubAutomationGroup)
      world._hubAutomationGroup.visible = false
    if (world._hubDropsGroup)
      world._hubDropsGroup.visible = false

    world.experience.terrainDataManager = world.chunkManager
  }

  exitDungeon() {
    const world = this.world
    if (!world)
      return

    world.isPaused = true
    world._emitDungeonState()
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')
    emitter.emit('loading:show', { title: '正在返回：超平坦世界' })

    setTimeout(() => {
      world.currentWorld = 'hub'
      const { x, z } = world._hubCenter
      world.chunkManager.updateStreaming({ x, z }, true)
      world.chunkManager.pumpIdleQueue()
      const y = world._getSurfaceY(x, z)
      world.player.teleportTo(x, y + 1.1, z)

      if (world.player?.movement?.config?.respawn?.position && world._savedRespawnPosition) {
        world.player.movement.config.respawn.position = { ...world._savedRespawnPosition }
        world._savedRespawnPosition = null
      }
      world._dungeonCollisionInfo = null
      world.experience.terrainDataManager = world.chunkManager
      world._activeInteractableId = null
      world._activeInteractable = null
      world._activeDungeonExit = null
      world._dungeonExit = null
      world._dungeonInteractables = null
      world._dungeonInteractablesGroup = null
      world._dungeonName = null
      world._dungeonProgress = null
      world._dungeonCompleted = false
      world._activeDungeonPortalId = null
      world._dungeonSurfaceY = null
      world._dungeonSpawn = null
      world._activeDungeonExitPrompt = null
      world._lockedEnemy = null
      world._dungeonRewardPending = null
      world._dungeonRewardSpawned = false
      if (world._dungeonEnemies) {
        for (const enemy of world._dungeonEnemies)
          enemy?.destroy?.()
      }
      world._dungeonEnemies = null
      world._dungeonEnemiesGroup = null
      world._clearNameLabelsByScope('dungeon')
      world._dungeonGroup?.clear?.()
      emitter.emit('dungeon:progress_clear')
      emitter.emit('dungeon:toast_clear')

      if (world.environment) {
        world.environment.params.fogDensity = 0.01
        world.environment.updateFog()
      }

      if (world.animalsGroup)
        world.animalsGroup.visible = true
      if (world._hubAutomationGroup)
        world._hubAutomationGroup.visible = true
      if (world._hubDropsGroup)
        world._hubDropsGroup.visible = true

      world.isPaused = false
      world._emitDungeonState()
      emitter.emit('loading:hide')
    }, 700)
  }
}
