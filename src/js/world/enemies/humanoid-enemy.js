import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import Experience from '../../experience.js'

export default class HumanoidEnemy {
  constructor(options = {}) {
    const {
      position = new THREE.Vector3(),
      rotationY = 0,
      scale = 1,
      colors = {},
      type = 'skeleton', // Default type
      hp = 4,
    } = options

    this.experience = new Experience()
    this.time = this.experience.time
    this.resources = this.experience.resources

    this.basePosition = position.clone()
    this.maxHp = hp
    this.hp = hp
    this.isDead = false
    this.isLocked = false
    this._baseScale = scale
    this._destroyTimer = null
    this.hitRadius = 0.9
    this._hpBarY = 2.4
    this._hpBarYOffset = 0.45
    this._pendingOneShotAction = null
    this._onMixerFinished = null
    this._forceLyingDown = false
    this._deathPoseT = 0
    this._attackCooldownUntil = 0
    this._attackHitAt = 0
    this._attackDamage = 1
    this._attackRange = 2.1
    this._attackWindupMs = 260
    this._lockHighlightRestore = null

    this.group = new THREE.Group()
    this.group.position.copy(position)
    this.group.rotation.y = rotationY
    this.group.scale.setScalar(scale)

    let resourceKey = type
    let modelResource = this.resources.items[resourceKey]

    if (!modelResource) {
      resourceKey = `enemy_${type}`
      modelResource = this.resources.items[resourceKey]
    }

    if (modelResource) {
      this._setupModel(modelResource, colors)
    }
    else {
      console.warn(`Model not found for type: ${type}, falling back to legacy mesh.`)
      this._setupLegacyMesh(colors)
    }
  }

  _setupModel(gltf, colors) {
    this._usesGltfModel = true
    try {
      this.model = cloneSkinned(gltf.scene)
    }
    catch {
      this.model = gltf.scene.clone(true)
    }
    this.group.add(this.model)

    this.mixer = new THREE.AnimationMixer(this.model)
    this.actions = {}

    gltf.animations.forEach((clip) => {
      const action = this.mixer.clipAction(clip)
      this.actions[clip.name] = action
    })

    this._onMixerFinished = (e) => {
      this._handleMixerFinished(e)
    }
    this.mixer.addEventListener('finished', this._onMixerFinished)

    this.playAnimation('Idle')

    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    this._applyHitBoundsFromObject(this.model)

    const lockRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 16, 48),
      new THREE.MeshBasicMaterial({
        color: 0xFF_3B_3B,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    )
    lockRing.rotation.x = Math.PI / 2
    lockRing.position.set(0, 0.06, 0)
    lockRing.visible = false
    this.group.add(lockRing)

    this._initHpBar(colors)
    this.parts = { lockRing, hpBarBg: this._hpBarBg, hpBarFill: this._hpBarFill }
  }

  _setupLegacyMesh(colors) {
    this._usesGltfModel = false
    const palette = {
      skin: colors.skin ?? 0xE0_B7_9A,
      cloth: colors.cloth ?? 0x2F_3A_6E,
      armor: colors.armor ?? 0x38_3B_46,
      accent: colors.accent ?? 0xB9_FF_C7,
    }

    const skinMaterial = new THREE.MeshStandardMaterial({
      color: palette.skin,
      roughness: 0.85,
      metalness: 0.05,
    })
    const clothMaterial = new THREE.MeshStandardMaterial({
      color: palette.cloth,
      roughness: 0.9,
      metalness: 0.05,
    })
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: palette.armor,
      roughness: 0.55,
      metalness: 0.25,
    })
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: new THREE.Color(palette.accent),
      emissiveIntensity: 0.25,
      roughness: 0.45,
      metalness: 0.2,
    })

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), skinMaterial)
    head.position.set(0, 2.05, 0)

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.52), clothMaterial)
    torso.position.set(0, 1.33, 0)

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.54), armorMaterial)
    belt.position.set(0, 0.76, 0)

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.05, 0.32), armorMaterial)
    leftArm.position.set(-0.68, 1.45, 0)

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.05, 0.32), armorMaterial)
    rightArm.position.set(0.68, 1.45, 0)

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.1, 0.36), clothMaterial)
    leftLeg.position.set(-0.26, 0.2, 0)

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.1, 0.36), clothMaterial)
    rightLeg.position.set(0.26, 0.2, 0)

    const sigil = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.05), accentMaterial)
    sigil.position.set(0, 1.55, 0.29)

    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), armorMaterial)
    weapon.position.set(0.95, 0.95, 0.15)
    weapon.rotation.z = -Math.PI / 6

    const lockRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 16, 48),
      new THREE.MeshBasicMaterial({
        color: 0xFF_3B_3B,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    )
    lockRing.rotation.x = Math.PI / 2
    lockRing.position.set(0, 0.06, 0)
    lockRing.visible = false

    this.group.add(head, torso, belt, leftArm, rightArm, leftLeg, rightLeg, sigil, weapon, lockRing)

    this.parts = {
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      weapon,
      lockRing,
    }

    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    this._applyHitBoundsFromObject(this.group)
    this._initHpBar(colors)
    this.parts.hpBarBg = this._hpBarBg
    this.parts.hpBarFill = this._hpBarFill
  }

  _applyHitBoundsFromObject(object3d) {
    try {
      const box = new THREE.Box3().setFromObject(object3d)
      const size = new THREE.Vector3()
      box.getSize(size)
      const radius = Math.max(size.x, size.z) * 0.5
      if (Number.isFinite(radius) && radius > 0.1)
        this.hitRadius = radius
      const y = Math.max(1.6, size.y * 1.02)
      if (Number.isFinite(y))
        this._hpBarY = y
    }
    catch {
    }
  }

  _initHpBar(colors) {
    const bgGeo = new THREE.PlaneGeometry(1.2, 0.12)
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
    const bg = new THREE.Mesh(bgGeo, bgMat)
    bg.position.set(0, this._hpBarY + this._hpBarYOffset, 0)

    const fillGeo = new THREE.PlaneGeometry(1.2, 0.12)
    fillGeo.translate(0.6, 0, 0)
    const fillMat = new THREE.MeshBasicMaterial({
      color: colors?.accent ?? 0xFF5555,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    const fill = new THREE.Mesh(fillGeo, fillMat)
    fill.position.set(-0.6, 0, 0.001)
    bg.add(fill)

    this.group.add(bg)
    this._hpBarBg = bg
    this._hpBarFill = fill
    this._updateHpBar()
  }

  _updateHpBar() {
    if (!this._hpBarFill)
      return
    const denom = this.maxHp || 1
    const ratio = Math.max(0, Math.min(1, this.hp / denom))
    this._hpBarFill.scale.x = ratio
    if (this._hpBarBg)
      this._hpBarBg.visible = !this.isDead && !!this.isLocked
  }

  addTo(parent) {
    parent.add(this.group)
  }

  playAnimation(name) {
    if (!this.actions)
      return false

    // Fuzzy match
    const clipName = Object.keys(this.actions).find(key => key.toLowerCase().includes(name.toLowerCase()))

    if (clipName) {
      const newAction = this.actions[clipName]
      if (this.currentAction !== newAction) {
        if (this.currentAction)
          this.currentAction.fadeOut(0.2)
        newAction.reset().fadeIn(0.2).play()
        this.currentAction = newAction
      }
      return true
    }
    else {
      // Fallback: if 'Idle' requested but not found, try to play *something*
      if (name === 'Idle' && Object.keys(this.actions).length > 0) {
        const first = Object.values(this.actions)[0]
        if (this.currentAction !== first) {
          if (this.currentAction)
            this.currentAction.fadeOut(0.2)
          first.reset().fadeIn(0.2).play()
          this.currentAction = first
        }
        return true
      }
      return false
    }
  }

  playLocomotion() {
    return this.playAnimation('Walk') || this.playAnimation('Run') || this.playAnimation('Move')
  }

  playWalk() {
    return this.playAnimation('Walk') || false
  }

  update() {
    const t = (this.time?.elapsed ?? 0) * 0.001

    if (this.mixer) {
      this.mixer.update(this.time.delta * 0.001)
    }
    else {
      // Legacy bobbing
      const bob = Math.sin(t * 2.2) * 0.03
      this.group.position.y = this.basePosition.y + bob

      const sway = Math.sin(t * 1.8) * 0.22
      const legSway = Math.sin(t * 1.8 + Math.PI) * 0.18
      if (this.parts.leftArm)
        this.parts.leftArm.rotation.x = sway
      if (this.parts.rightArm)
        this.parts.rightArm.rotation.x = -sway
      if (this.parts.leftLeg)
        this.parts.leftLeg.rotation.x = legSway
      if (this.parts.rightLeg)
        this.parts.rightLeg.rotation.x = -legSway

      if (this.parts.head)
        this.parts.head.rotation.y = Math.sin(t * 0.9) * 0.22
      if (this.parts.weapon)
        this.parts.weapon.rotation.x = -sway * 0.15
    }

    if (this.isDead && this._forceLyingDown && this.group) {
      this._deathPoseT = Math.min(1, this._deathPoseT + (this.time.delta * 0.001) * 2.6)
      const a = this._deathPoseT
      const ease = 1 - (1 - a) * (1 - a)
      this.group.rotation.x += (-Math.PI / 2 - this.group.rotation.x) * (0.22 + 0.38 * ease)
      this.group.position.y -= (this.time.delta * 0.001) * 0.25
    }

    if (this.parts && this.parts.lockRing && this.parts.lockRing.visible) {
      const pulse = 1 + Math.sin(t * 4.2) * 0.08
      this.parts.lockRing.scale.setScalar(pulse)
      this.parts.lockRing.rotation.z = t * 0.8
    }

    if (this._hpBarBg && this.experience?.camera?.instance) {
      this._hpBarBg.lookAt(this.experience.camera.instance.position)
    }
  }

  setLocked(isLocked) {
    this.isLocked = !!isLocked
    if (this.parts && this.parts.lockRing)
      this.parts.lockRing.visible = this.isLocked
    this._updateHpBar()
    this._applyLockHighlight(this.isLocked)
  }

  _applyLockHighlight(enabled) {
    const next = !!enabled
    if (!next) {
      if (Array.isArray(this._lockHighlightRestore)) {
        for (const entry of this._lockHighlightRestore) {
          const mat = entry?.mat
          if (!mat)
            continue
          if (mat.emissive && entry.emissive) {
            mat.emissive.copy(entry.emissive)
          }
          if (entry.emissiveIntensity !== undefined && mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = entry.emissiveIntensity
          }
        }
      }
      this._lockHighlightRestore = null
      return
    }

    if (this._lockHighlightRestore)
      return

    const restore = []
    const root = this.model || this.group
    root?.traverse?.((obj) => {
      if (!obj?.isMesh)
        return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (!mat)
          continue
        if (!mat.emissive)
          continue
        restore.push({
          mat,
          emissive: mat.emissive.clone(),
          emissiveIntensity: mat.emissiveIntensity,
        })
        mat.emissive.setHex(0x66_0000)
        if (mat.emissiveIntensity !== undefined)
          mat.emissiveIntensity = Math.max(0.35, Number(mat.emissiveIntensity) || 0)
      }
    })

    this._lockHighlightRestore = restore.length > 0 ? restore : []
  }

  _findActionByIncludes(parts) {
    if (!this.actions)
      return null
    const keys = Object.keys(this.actions)
    const lower = keys.map(k => k.toLowerCase())
    for (const part of parts) {
      const idx = lower.findIndex(k => k.includes(part))
      if (idx >= 0)
        return keys[idx]
    }
    return null
  }

  _findActionByExact(names) {
    if (!this.actions)
      return null
    const keys = Object.keys(this.actions)
    const lowerToKey = new Map(keys.map(k => [k.toLowerCase(), k]))
    for (const n of names) {
      const key = lowerToKey.get(String(n).toLowerCase())
      if (key)
        return key
    }
    return null
  }

  _playOneShot(clipName, { fadeIn = 0.06, fadeOut = 0.08, returnToLocomotion = true } = {}) {
    if (!this.actions || !this.mixer)
      return false
    const action = this.actions[clipName]
    if (!action)
      return false

    if (this.currentAction && this.currentAction !== action)
      this.currentAction.fadeOut(fadeOut)

    action.reset()
    action.enabled = true
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    action.fadeIn(fadeIn).play()
    this.currentAction = action

    this._pendingOneShotAction = returnToLocomotion ? action : null
    return true
  }

  _handleMixerFinished(e) {
    const finished = e?.action
    if (!finished || !this._pendingOneShotAction || finished !== this._pendingOneShotAction)
      return
    this._pendingOneShotAction = null
    if (this.isDead)
      return
    if (this.behavior?.state === 'walk')
      this.playLocomotion?.()
    else
      this.playAnimation?.('Idle')
  }

  tryAttack({ now, damage, range, windupMs } = {}) {
    const t = now ?? (this.time?.elapsed ?? 0)
    if (this.isDead)
      return false
    if (t < this._attackCooldownUntil)
      return false

    const attackClip = this._findActionByExact(['Attack'])
      || this._findActionByIncludes(['attack', 'slash', 'bite', 'punch', 'hit', 'swing'])

    const ok = attackClip ? this._playOneShot(attackClip, { returnToLocomotion: true, fadeIn: 0.06, fadeOut: 0.12 }) : false
    if (!ok) {
      this.group.scale.setScalar(this._baseScale * 1.03)
      setTimeout(() => {
        if (!this.isDead)
          this.group?.scale?.setScalar?.(this._baseScale)
      }, 120)
    }

    this._attackDamage = damage ?? this._attackDamage
    this._attackRange = range ?? this._attackRange
    this._attackWindupMs = windupMs ?? this._attackWindupMs
    this._attackHitAt = t + this._attackWindupMs
    this._attackCooldownUntil = t + 1100
    return true
  }

  consumeAttackHit({ now } = {}) {
    const t = now ?? (this.time?.elapsed ?? 0)
    if (this._attackHitAt <= 0)
      return null
    if (t < this._attackHitAt)
      return null
    this._attackHitAt = 0
    return { damage: this._attackDamage ?? 1, range: this._attackRange ?? 2.1 }
  }

  takeDamage(amount = 1) {
    if (this.isDead)
      return false

    this.hp = Math.max(0, this.hp - amount)
    this._updateHpBar()
    if (this.hp <= 0) {
      this.die()
      return true
    }

    const hitClip = this._findActionByExact(['HitRecieve', 'HitReceive'])
      || this._findActionByIncludes(['hitrecieve', 'hitreceive'])
      || this._findActionByIncludes(['hit', 'hurt', 'damage', 'gethit', 'impact'])
    if (hitClip)
      this._playOneShot(hitClip, { returnToLocomotion: true })

    if (this.group) {
      this.group.scale.setScalar(this._baseScale * 1.05)
      setTimeout(() => {
        if (!this.isDead)
          this.group?.scale?.setScalar?.(this._baseScale)
      }, 80)
    }

    return true
  }

  die() {
    if (this.isDead)
      return
    this.isDead = true
    this.setLocked?.(false)
    const deathClip = this._findActionByExact(['Death'])
      || this._findActionByIncludes(['death', 'die', 'dead'])
    if (deathClip)
      this._playOneShot(deathClip, { returnToLocomotion: false, fadeIn: 0.08, fadeOut: 0.12 })
    else
      this.playAnimation?.('Death')
    this._forceLyingDown = !deathClip
    this._updateHpBar()
  }

  destroy() {
    if (this._destroyTimer) {
      clearTimeout(this._destroyTimer)
      this._destroyTimer = null
    }

    if (this.mixer && this._onMixerFinished) {
      this.mixer.removeEventListener('finished', this._onMixerFinished)
      this._onMixerFinished = null
    }

    this.group.removeFromParent()

    const ring = this.parts?.lockRing
    if (ring) {
      ring.geometry?.dispose?.()
      if (Array.isArray(ring.material)) {
        for (const mat of ring.material)
          mat?.dispose?.()
      }
      else {
        ring.material?.dispose?.()
      }
    }

    const hpBg = this._hpBarBg
    const hpFill = this._hpBarFill
    if (hpFill) {
      hpFill.geometry?.dispose?.()
      hpFill.material?.dispose?.()
    }
    if (hpBg) {
      hpBg.geometry?.dispose?.()
      hpBg.material?.dispose?.()
    }

    if (!this._usesGltfModel) {
      this.group.traverse((child) => {
        if (!(child instanceof THREE.Mesh))
          return
        child.geometry?.dispose?.()
        if (Array.isArray(child.material)) {
          for (const mat of child.material)
            mat?.dispose?.()
        }
        else {
          child.material?.dispose?.()
        }
      })
    }
  }
}
