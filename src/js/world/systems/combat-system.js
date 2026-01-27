import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'

export default class CombatSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.combatSystem = this

    this._onLockOn = () => {
      this.toggleLockOn()
    }

    this._onPunchStraight = () => {
      const world = this.world
      if (world?.player?.isBlocking || !!world?.player?.inputState?.c)
        return
      this.tryPlayerAttack({ damage: 1, range: 2.6, minDot: 0.35, cooldownMs: 220 })
    }

    this._onPunchHook = () => {
      const world = this.world
      if (world?.player?.isBlocking || !!world?.player?.inputState?.c)
        return
      this.tryPlayerAttack({ damage: 2, range: 2.4, minDot: 0.2, cooldownMs: 320 })
    }

    emitter.on('input:lock_on', this._onLockOn)
    emitter.on('input:punch_straight', this._onPunchStraight)
    emitter.on('input:punch_hook', this._onPunchHook)
  }

  destroy() {
    if (this._onLockOn)
      emitter.off('input:lock_on', this._onLockOn)
    if (this._onPunchStraight)
      emitter.off('input:punch_straight', this._onPunchStraight)
    if (this._onPunchHook)
      emitter.off('input:punch_hook', this._onPunchHook)

    this._onLockOn = null
    this._onPunchStraight = null
    this._onPunchHook = null

    if (this.world?.combatSystem === this)
      this.world.combatSystem = null
    this.world = null
    this.context = null
  }

  update() {
    this.updateLockOn()
    this.updateMaterialGun()
  }

  startMaterialGunFire() {
    const world = this.world
    if (!world?._isMaterialGunEquipped)
      return
    world._isMaterialGunFiring = true
  }

  stopMaterialGunFire() {
    const world = this.world
    if (!world)
      return
    if (!world._isMaterialGunFiring && !world._materialGunBeam?.visible)
      return
    world._isMaterialGunFiring = false
    world.player?.setMatterGunAiming?.(false)
    if (world._materialGunBeam)
      world._materialGunBeam.visible = false
  }

  updateMaterialGun() {
    const world = this.world
    if (!world?.player || !world._isMaterialGunEquipped || !world._materialGunBeam) {
      this.stopMaterialGunFire()
      return
    }

    const now = world.experience.time?.elapsed ?? 0
    const target = world._lockedEnemy
    const validTarget = !!target?.group && !target?.isDead
    if (!world._isMaterialGunFiring || !validTarget) {
      world.player.setMatterGunAiming(false)
      world._materialGunBeam.visible = false
      return
    }

    const cfg = world._npcStats?.material_gun || {}
    const maxRange = Number.isFinite(cfg.maxRange) ? cfg.maxRange : 14
    const tickMs = Math.max(120, Math.floor(Number(cfg.tickMs) || 900))
    const tickDamage = Math.max(1, Math.floor(Number(cfg.tickDamage) || 1))

    const muzzle = world.player.getMatterGunMuzzleWorldPosition?.()
    const start = muzzle || new THREE.Vector3(world.player.getPosition().x, world.player.getPosition().y + 1.35, world.player.getPosition().z)
    const end = world._getEnemyLockTargetPos(target) || new THREE.Vector3(target.group.position.x, target.group.position.y + 1.35, target.group.position.z)

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z
    const d2 = dx * dx + dy * dy + dz * dz
    const dist = Math.sqrt(Math.max(0, d2))
    if (d2 > maxRange * maxRange) {
      world._materialGunBeam.visible = false
      world.player.setMatterGunAiming(false)
      if (now - (this._rangeWarnAt || 0) >= 1000) {
        this._rangeWarnAt = now
        emitter.emit('ui:hud_hint', { text: '射程不足', ttlMs: 1200 })
      }
      return
    }

    if (!this._losRaycaster)
      this._losRaycaster = new THREE.Raycaster()
    this._losRaycaster.far = dist
    const dir = new THREE.Vector3(dx, dy, dz)
    if (dir.lengthSq() > 1e-6) {
      dir.normalize()
      this._losRaycaster.set(start, dir)
      const targets = []
      const chunks = world.chunkManager?.chunks
      if (chunks?.values) {
        for (const chunk of chunks.values()) {
          const g = chunk?.renderer?.group
          if (g)
            targets.push(g)
        }
      }
      const hits = targets.length ? this._losRaycaster.intersectObjects(targets, true) : []
      const first = hits?.[0] || null
      if (first && typeof first.distance === 'number' && first.distance < dist - 0.25) {
        world._materialGunBeam.visible = false
        world.player.setMatterGunAiming(false)
        if (now - (this._rangeWarnAt || 0) >= 1000) {
          this._rangeWarnAt = now
          emitter.emit('ui:hud_hint', { text: '射程不足', ttlMs: 1200 })
        }
        return
      }
    }

    world._materialGunBeamPositions[0] = start.x
    world._materialGunBeamPositions[1] = start.y
    world._materialGunBeamPositions[2] = start.z
    world._materialGunBeamPositions[3] = end.x
    world._materialGunBeamPositions[4] = end.y
    world._materialGunBeamPositions[5] = end.z

    world._beamsSystem?.updateBeam?.(world, 'material', start, end)
    world._materialGunBeam.visible = true
    world.player.setMatterGunAiming(true)

    if (now - world._materialGunLastDamageAt < tickMs)
      return
    world._materialGunLastDamageAt = now

    const hit = target.takeDamage?.(tickDamage)
    if (hit)
      world._forceNpcAggro(target, now + 8000)
    if (hit) {
      const label = target?._typeLabel || target?._resourceKey || target?.type || '目标'
      emitter.emit('ui:log', { text: `光束命中：${label} -${tickDamage}` })
    }

    if (target.isDead && world._lockedEnemy === target) {
      const label = target?._typeLabel || target?._resourceKey || target?.type || '目标'
      emitter.emit('ui:log', { text: `击败：${label}` })
      this.clearLockOn()
      this.stopMaterialGunFire()
    }
  }

  toggleLockOn() {
    const world = this.world
    if (!world || world.isPaused)
      return
    if (world.currentWorld !== 'dungeon' && world.currentWorld !== 'hub')
      return
    if (!world.player)
      return

    if (world._lockedEnemy) {
      world._lockedEnemy.setLocked?.(false)
      world._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      return
    }

    const enemy = world.currentWorld === 'hub' ? world._getNearestHubAnimal() : world._getNearestDungeonEnemy()
    if (!enemy)
      return

    world._lockedEnemy = enemy
    world._lockedEnemy.setLocked?.(true)
    emitter.emit('combat:toggle_lock', enemy.group)
    emitter.emit('combat:lock', { title: '已锁定', hint: '中键解除' })

    const p = world.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const desired = world._getFacingTo(dx, dz)
    world.player.setFacing(desired)
    if (typeof world.player.targetFacingAngle === 'number')
      world.player.targetFacingAngle = desired
  }

  clearLockOn() {
    const world = this.world
    if (!world?._lockedEnemy)
      return
    world._lockedEnemy.setLocked?.(false)
    world._lockedEnemy = null
    emitter.emit('combat:toggle_lock', null)
    emitter.emit('combat:lock_clear')
  }

  updateLockOn() {
    const world = this.world
    if (!world?.player)
      return
    if ((world.currentWorld !== 'dungeon' && world.currentWorld !== 'hub')) {
      if (world._lockedEnemy)
        this.clearLockOn()
      return
    }
    if (!world._lockedEnemy)
      return

    const enemy = world._lockedEnemy
    if (!enemy?.group) {
      world._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      return
    }

    const p = world.player.getPosition()
    const epos = new THREE.Vector3()
    enemy.group.getWorldPosition(epos)
    const dx = epos.x - p.x
    const dz = epos.z - p.z
    const d2 = dx * dx + dz * dz
    if (d2 > 50 * 50) {
      enemy.setLocked?.(false)
      world._lockedEnemy = null
      emitter.emit('combat:toggle_lock', null)
      emitter.emit('combat:lock_clear')
      this.stopMaterialGunFire()
      return
    }

    const desired = world._getFacingTo(dx, dz)
    const current = world.player.getFacingAngle()
    const next = world._lerpAngle(current, desired, world._isMaterialGunFiring ? 0.35 : 0.12)
    world.player.setFacing(next)
    if (typeof world.player.targetFacingAngle === 'number')
      world.player.targetFacingAngle = next
  }

  isEnemyInFront(enemy, range, minDot) {
    const world = this.world
    if (!enemy?.group || !world?.player)
      return false

    const p = world.player.getPosition()
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

    const facing = world.player.getFacingAngle?.() ?? 0
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)

    const nx = dx / len
    const nz = dz / len
    const dot = fx * nx + fz * nz
    if (dot >= minDot)
      return true
    return hitRadius > 0 && len <= hitRadius * 1.05
  }

  getBestDungeonEnemyForAttack(range, minDot) {
    const world = this.world
    if (!world?._dungeonEnemies || !world.player)
      return null

    let best = null
    let bestD2 = Infinity
    const p = world.player.getPosition()
    const facing = world.player.getFacingAngle?.() ?? 0
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)

    for (const enemy of world._dungeonEnemies) {
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

  getNearestDungeonEnemyInRange(range) {
    const world = this.world
    if (!world?._dungeonEnemies || !world.player)
      return null

    let best = null
    let bestD2 = Infinity
    const p = world.player.getPosition()

    for (const enemy of world._dungeonEnemies) {
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

  tryPlayerAttack({ damage, range, minDot, cooldownMs }) {
    const world = this.world
    if (!world || world.isPaused)
      return
    if (world.currentWorld !== 'dungeon')
      return
    if (!world.player || !world._dungeonEnemies || world._dungeonEnemies.length === 0)
      return

    const now = world.experience.time?.elapsed ?? 0
    if (now < world._playerAttackCooldownUntil)
      return
    world._playerAttackCooldownUntil = now + (cooldownMs ?? 250)

    let target = null
    if (world._lockedEnemy && !world._lockedEnemy.isDead && this.isEnemyInFront(world._lockedEnemy, range, minDot))
      target = world._lockedEnemy
    if (!target)
      target = this.getBestDungeonEnemyForAttack(range, minDot)
    if (!target)
      target = this.getNearestDungeonEnemyInRange((range ?? 2.4) * 0.75)
    if (!target)
      return

    const hit = target.takeDamage?.(damage ?? 1)
    if (!hit)
      return
    const label = target?._typeLabel || target?._resourceKey || target?.type || '敌人'
    emitter.emit('ui:log', { text: `近战命中：${label} -${damage ?? 1}` })

    const p = world.player.getPosition()
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
      if (world._lockedEnemy === target)
        this.clearLockOn()
      emitter.emit('ui:log', { text: `击败：${label}` })
    }
  }
}
