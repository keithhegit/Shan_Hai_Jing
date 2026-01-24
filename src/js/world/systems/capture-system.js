import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'

export default class CaptureSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.captureSystem = this

    this._onCaptureInput = (payload) => {
      const world = this.world
      if (!world)
        return
      const pressed = !!payload?.pressed
      world._captureHolding = pressed
      if (pressed)
        this.tryStartCapture()
      else
        this.breakCapture({ reason: 'release', healTarget: false })
    }
    this._onPlayerDamaged = () => {
      this.breakCapture({ reason: 'damaged', healTarget: true })
    }
    emitter.on('input:capture', this._onCaptureInput)
    emitter.on('combat:player_damaged', this._onPlayerDamaged)
  }

  destroy() {
    if (this._onCaptureInput)
      emitter.off('input:capture', this._onCaptureInput)
    if (this._onPlayerDamaged)
      emitter.off('combat:player_damaged', this._onPlayerDamaged)
    this._onCaptureInput = null
    this._onPlayerDamaged = null
    if (this.world?.captureSystem === this)
      this.world.captureSystem = null
    this.world = null
    this.context = null
  }

  update() {
    this.updateCapture()
    this.updateCaptureHint()
  }

  getCaptureCandidate() {
    const world = this.world
    if (!world?._lockedEnemy || world._lockedEnemy.isDead)
      return null
    const target = world._lockedEnemy
    const maxHp = Math.max(1, Math.floor(Number(target.maxHp) || 1))
    const threshold = Math.max(1, Math.ceil(maxHp * 0.15))
    if (target.hp > threshold)
      return null
    if (!target.isStunned?.())
      return null
    return target
  }

  tryStartCapture() {
    const world = this.world
    const now = world?.experience?.time?.elapsed ?? 0
    if (!world || world.isPaused)
      return
    if (!world.player)
      return
    if (world._captureTarget || world._captureState)
      return
    if (now < (world._captureCooldownUntil ?? 0))
      return

    const target = this.getCaptureCandidate()
    if (!target)
      return

    world._captureTarget = target
    world._captureStartAt = now
    world._captureState = 'channeling'

    if (Number.isFinite(Number(target?._stunnedUntil))) {
      target._stunnedUntil = Math.max(target._stunnedUntil, now + (world._captureDurationMs ?? 4000) + 250)
    }

    world.player.setControlLocked?.(true)
    world.player.setSpeedMultiplier?.(0)
    world.player.setSprintDisabled?.(true)

    if (world._captureBeam)
      world._captureBeam.visible = true
  }

  breakCapture({ reason, healTarget } = {}) {
    const world = this.world
    if (!world?._captureTarget || !world._captureState)
      return
    const now = world.experience?.time?.elapsed ?? 0
    const target = world._captureTarget
    world._captureTarget = null
    world._captureState = null
    world._captureStartAt = 0
    world._captureCooldownUntil = now + 700

    if (world._captureBeam)
      world._captureBeam.visible = false

    world.player?.setControlLocked?.(false)
    world._applyBurdenEffects?.()

    if (healTarget && target?.heal && !target.isDead) {
      const heal = Math.max(1, Math.ceil((target.maxHp || 1) * 0.1))
      target.heal(heal)
      emitter.emit('dungeon:toast', { text: '捕捉中断：目标恢复' })
      emitter.emit('ui:log', { text: '捕捉失败：受击中断（目标恢复）' })
      return
    }
    if (reason === 'release')
      emitter.emit('dungeon:toast', { text: '捕捉取消' })
    if (reason === 'release')
      emitter.emit('ui:log', { text: '捕捉取消' })
    if (reason === 'invalid')
      emitter.emit('ui:log', { text: '捕捉失败：条件不满足' })
  }

  completeCapture() {
    const world = this.world
    const target = world?._captureTarget
    if (!world || !target)
      return
    const now = world.experience?.time?.elapsed ?? 0
    world._captureTarget = null
    world._captureState = null
    world._captureStartAt = 0
    world._captureCooldownUntil = now + 1200

    if (world._captureBeam)
      world._captureBeam.visible = false

    world.player?.setControlLocked?.(false)

    if (world._lockedEnemy === target)
      world.combatSystem?.clearLockOn?.()
    target.setLocked?.(false)

    const canisterId = this.pickCanisterIdForTarget(target)
    if (canisterId) {
      const pos = new THREE.Vector3()
      target.group?.getWorldPosition?.(pos)
      const capturedResourceKey = target?._resourceKey
        ? String(target._resourceKey)
        : (() => {
            const t = String(target?.type || '').trim()
            if (!t)
              return null
            if (t.startsWith('enemy_') || t.startsWith('animal_'))
              return t
            return `enemy_${t}`
          })()
      const capturedKind = target.isBoss ? 'boss' : (world.currentWorld === 'dungeon' ? 'minion' : 'npc')
      const capturedDisplayName = target?._typeLabel
        ? String(target._typeLabel)
        : (capturedResourceKey ? (world._getModelFilenameByResourceKey?.(capturedResourceKey) || capturedResourceKey) : null)
      const canisterMeta = capturedResourceKey
        ? { capturedResourceKey, capturedKind, capturedDisplayName }
        : null
      if (world.currentWorld === 'dungeon') {
        world._spawnDungeonItemDrop?.({ itemId: canisterId, amount: 1, x: pos.x, z: pos.z, canisterMeta })
        emitter.emit('dungeon:toast', { text: `捕捉成功：${canisterId}（已掉落）` })
        emitter.emit('ui:log', { text: `捕捉成功：${canisterId}（已掉落）` })

        target.isDead = true
        target._coinDropped = true
        if (target.isBoss)
          world._spawnDungeonReward?.()
        if (target.group) {
          target.group.visible = false
          target.group.removeFromParent?.()
        }
      }
      else {
        const dropId = world.dropSystem?.spawnHubDrop?.(canisterId, 1, pos.x, pos.z, {
          persist: true,
          canisterMeta,
          onPickedUp: () => {
            const w = this.world
            if (!w)
              return
            if (w._lockedEnemy === target)
              w.combatSystem?.clearLockOn?.()
            if (w._carriedAnimal === target)
              w._dropCarriedAnimal?.()
            target.group.visible = false
            target.group.removeFromParent?.()
            const index = w.animals?.indexOf?.(target) ?? -1
            if (index >= 0)
              w.animals.splice(index, 1)
            emitter.emit('ui:log', { text: '收容罐已拾取：目标已收容' })
          },
        })
        if (dropId) {
          target.die?.()
          emitter.emit('dungeon:toast', { text: `捕捉成功：${canisterId}（已掉落）` })
          emitter.emit('ui:log', { text: `捕捉成功：${canisterId}（已掉落）` })
        }
        else {
          emitter.emit('dungeon:toast', { text: `捕捉成功：${canisterId}（掉落失败）` })
          emitter.emit('ui:log', { text: `捕捉成功：${canisterId}（掉落失败）` })
        }
      }
    }

    world._applyBurdenEffects?.()
    world._updateCanisterVisuals?.()
  }

  pickCanisterIdForTarget(target) {
    const world = this.world
    if (!target)
      return 'canister_small'
    if (target.isBoss)
      return 'canister_large'
    if (world?.currentWorld === 'dungeon')
      return 'canister_medium'
    return 'canister_small'
  }

  updateCaptureBeam() {
    const world = this.world
    if (!world?._captureBeam || !world._captureTarget || !world.player)
      return
    const muzzle = world.player.getMatterGunMuzzleWorldPosition?.()
    const start = muzzle || new THREE.Vector3(world.player.getPosition().x, world.player.getPosition().y + 1.35, world.player.getPosition().z)
    const end = world._getEnemyLockTargetPos?.(world._captureTarget)
      || new THREE.Vector3(world._captureTarget.group.position.x, world._captureTarget.group.position.y + 1.35, world._captureTarget.group.position.z)

    world._beamsSystem?.updateBeam?.(world, 'capture', start, end)
    world._captureBeam.visible = true
  }

  updateCapture() {
    const world = this.world
    if (!world)
      return
    if (!world._captureState || !world._captureTarget) {
      if (world._captureBeam)
        world._captureBeam.visible = false
      return
    }
    if (!world._captureHolding) {
      this.breakCapture({ reason: 'release', healTarget: false })
      return
    }

    const target = world._captureTarget
    if (target.isDead || !target.group) {
      this.breakCapture({ reason: 'invalid', healTarget: false })
      return
    }

    const candidate = this.getCaptureCandidate()
    if (!candidate) {
      this.breakCapture({ reason: 'invalid', healTarget: false })
      return
    }

    const now = world.experience?.time?.elapsed ?? 0
    this.updateCaptureBeam()
    const duration = world._captureDurationMs ?? 4000
    if (now - (world._captureStartAt ?? 0) >= duration) {
      this.completeCapture()
      return
    }

    if (world.player?.setFacing && target?.group?.position) {
      const p = world.player.getPosition()
      const dx = target.group.position.x - p.x
      const dz = target.group.position.z - p.z
      const facing = world._getFacingTo ? world._getFacingTo(dx, dz) : Math.atan2(dx, dz)
      world.player.setFacing(facing)
    }
  }

  updateCaptureHint() {
    const world = this.world
    if (!world)
      return
    const hasPrompt = !!world._captureHintActive
    const candidate = this.getCaptureCandidate()
    if (candidate) {
      if (!hasPrompt) {
        world._captureHintActive = true
        emitter.emit('ui:capture_hint', { text: '按住 Q 捕捉（目标硬直且残血）' })
      }
      return
    }
    if (hasPrompt) {
      world._captureHintActive = false
      emitter.emit('ui:capture_hint', null)
    }
  }
}
