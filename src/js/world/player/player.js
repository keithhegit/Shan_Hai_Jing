import * as THREE from 'three'
import { PLAYER_CONFIG } from '../../config/player-config.js'
import { SHADOW_QUALITY } from '../../config/shadow-config.js'
import Experience from '../../experience.js'
import emitter from '../../utils/event-bus.js'
import {
  AnimationCategories,
  AnimationClips,
  AnimationStates,
  timeScaleConfig,
} from './animation-config.js'
import { resolveDirectionInput } from './input-resolver.js'
import { PlayerAnimationController } from './player-animation-controller.js'
import { PlayerMovementController } from './player-movement-controller.js'

export default class Player {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug
    this.renderer = this.experience.renderer // 用于控制速度线效果

    // Config
    // 深拷贝配置，避免调试修改污染默认值
    this.config = JSON.parse(JSON.stringify(PLAYER_CONFIG))
    this.targetFacingAngle = this.config.facingAngle // 目标朝向，用于平滑插值

    // Stats
    this.hp = 5
    this.maxHp = 5
    this.stamina = 100
    this.maxStamina = 100
    this.isDead = false
    this.isBlocking = false
    this._invulnerableUntil = 0
    this._lastBlockToastAt = 0

    // 速度线当前透明度
    this._speedLineOpacity = 0

    // Input state
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false,
      v: false,
      space: false,
    }

    // 攻击左右手交替状态（toggle）
    this._useLeftStraight = true // 直拳：true=左手, false=右手
    this._useLeftHook = true // 勾拳：true=左手, false=右手

    // Resource
    this.resource = this.resources.items.playerModel

    // Controllers
    this.movement = new PlayerMovementController(this.config)

    this.setModel()

    // Animation Controller needs model
    const { animations, waveClipName, holdingBothClipName } = this._normalizePlayerAnimations(this.resource.animations)
    this._waveClipName = waveClipName
    this._holdingBothClipName = holdingBothClipName
    this.animation = new PlayerAnimationController(this.model, animations)

    this._matterGun = null
    this._matterGunMuzzle = null
    this._isMatterGunAiming = false
    this._wantsMatterGunEquipped = false
    this._carryPoseEnabled = false
    this._controlLocked = false
    this._sprintDisabled = false

    this.setupInputListeners()
    emitter.emit('ui:update_stats', { hp: this.hp, maxHp: this.maxHp, stamina: this.stamina })

    this._onRespawn = () => {
      this.respawn()
    }
    emitter.on('game:respawn', this._onRespawn)

    // Shadow quality event listener
    this._handleShadowQuality = this._handleShadowQuality.bind(this)
    emitter.on('shadow:quality-changed', this._handleShadowQuality)

    // Debug
    if (this.debug.active) {
      this.debugFolder = this.debug.ui.addFolder({
        title: 'Player',
        expanded: false,
      })
      this.debugInit()
    }
  }

  /**
   * Handle shadow quality change event
   * @param {{ quality: string }} payload - Shadow quality payload
   */
  _handleShadowQuality(payload) {
    const shouldCastShadow = payload.quality !== SHADOW_QUALITY.LOW
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = shouldCastShadow
      }
    })
  }

  setModel() {
    this.model = this.resource.scene
    // 模型始終保持 rotation.y = Math.PI，確保動畫正常播放
    // 整體朝向通過父容器 movement.group 控制
    this.model.rotation.y = Math.PI
    this.model.scale.setScalar(0.5)
    this.model.updateMatrixWorld()
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.material.side = THREE.FrontSide
        child.material.transparent = true
      }
    })

    const layer0 = this.model?.children?.[0]?.children?.[0] || null
    if (layer0) {
      layer0.traverse((child) => {
        if (child instanceof THREE.Mesh)
          child.renderOrder = 1
      })
    }
    const layer1 = this.model?.children?.[0]?.children?.[1] || null
    if (layer1) {
      layer1.traverse((child) => {
        if (child instanceof THREE.Mesh)
          child.renderOrder = 2
      })
    }
    // Add model to movement controller's group
    this.movement.group.add(this.model)
  }

  _normalizePlayerAnimations(rawClips) {
    const clips = Array.isArray(rawClips) ? rawClips.filter(Boolean) : []
    const lowered = clips.map((clip) => {
      const name = String(clip?.name || '')
      return { clip, name, lower: name.toLowerCase() }
    })

    const hasClip = name => lowered.some(row => row.name === name)

    const findClip = (pred) => {
      for (const row of lowered) {
        if (pred(row.lower, row.name))
          return row.clip
      }
      return null
    }

    const findClipByWords = (words = [], antiWords = []) => {
      const w = (words || []).map(s => String(s).toLowerCase()).filter(Boolean)
      const a = (antiWords || []).map(s => String(s).toLowerCase()).filter(Boolean)
      return findClip((lower) => {
        for (const x of w) {
          if (!lower.includes(x))
            return false
        }
        for (const x of a) {
          if (lower.includes(x))
            return false
        }
        return true
      })
    }

    const cloneAs = (source, targetName) => {
      if (!source || !targetName)
        return null
      const cloned = source.clone()
      cloned.name = targetName
      return cloned
    }

    const pickLocomotion = (modeWords, dir) => {
      const dirWords = dir === 'forward'
        ? ['forward', 'fwd', 'front']
        : dir === 'backward'
          ? ['back', 'backward']
          : dir === 'left'
            ? ['left']
            : ['right']

      const clip = findClipByWords([...modeWords, ...dirWords])
        || findClipByWords(modeWords)
      return clip
    }

    const mapping = []

    mapping.push([AnimationClips.IDLE, () => findClipByWords(['idle']) || findClipByWords(['stand'], ['up'])])

    mapping.push([AnimationClips.WALK_FORWARD, () => pickLocomotion(['walk'], 'forward')])
    mapping.push([AnimationClips.WALK_BACK, () => pickLocomotion(['walk'], 'backward')])
    mapping.push([AnimationClips.WALK_LEFT, () => pickLocomotion(['walk'], 'left')])
    mapping.push([AnimationClips.WALK_RIGHT, () => pickLocomotion(['walk'], 'right')])

    mapping.push([AnimationClips.RUN_FORWARD, () => pickLocomotion(['run'], 'forward')])
    mapping.push([AnimationClips.RUN_BACK, () => pickLocomotion(['run'], 'backward')])
    mapping.push([AnimationClips.RUN_LEFT, () => pickLocomotion(['run'], 'left')])
    mapping.push([AnimationClips.RUN_RIGHT, () => pickLocomotion(['run'], 'right')])

    mapping.push([AnimationClips.SNEAK_FORWARD, () => pickLocomotion(['crouch'], 'forward') || pickLocomotion(['sneak'], 'forward')])
    mapping.push([AnimationClips.SNEAK_BACK, () => pickLocomotion(['crouch'], 'backward') || pickLocomotion(['sneak'], 'backward')])
    mapping.push([AnimationClips.SNEAK_LEFT, () => pickLocomotion(['crouch'], 'left') || pickLocomotion(['sneak'], 'left')])
    mapping.push([AnimationClips.SNEAK_RIGHT, () => pickLocomotion(['crouch'], 'right') || pickLocomotion(['sneak'], 'right')])

    mapping.push([AnimationClips.JUMP, () => findClipByWords(['jump'])])
    mapping.push([AnimationClips.FALL, () => findClipByWords(['fall']) || findClipByWords(['air'])])

    mapping.push([AnimationClips.STANDUP, () => findClipByWords(['stand', 'up']) || findClipByWords(['get', 'up']) || findClipByWords(['standup'])])

    mapping.push([AnimationClips.BLOCK, () => findClipByWords(['block']) || findClipByWords(['guard'])])
    mapping.push([AnimationClips.RIGHT_BLOCK, () => findClipByWords(['block', 'right']) || findClipByWords(['guard', 'right'])])

    const pickAttack = () => {
      return findClipByWords(['punch'])
        || findClipByWords(['attack'])
        || findClipByWords(['hit'])
    }

    mapping.push([AnimationClips.STRAIGHT_PUNCH, () => findClipByWords(['punch', 'straight']) || pickAttack()])
    mapping.push([AnimationClips.HOOK_PUNCH, () => findClipByWords(['punch', 'hook']) || pickAttack()])
    mapping.push([AnimationClips.RIGHT_STRAIGHT_PUNCH, () => findClipByWords(['punch', 'straight', 'right']) || findClipByWords(['attack', 'right']) || pickAttack()])
    mapping.push([AnimationClips.RIGHT_HOOK_PUNCH, () => findClipByWords(['punch', 'hook', 'right']) || findClipByWords(['attack', 'right']) || pickAttack()])
    mapping.push([AnimationClips.QUICK_COMBO, () => findClipByWords(['combo']) || findClipByWords(['punch', 'combo']) || pickAttack()])

    mapping.push([AnimationClips.TPOSE, () => findClipByWords(['tpose']) || findClipByWords(['t-pose'])])

    const wave = findClipByWords(['wave'])
    const waveClipName = wave?.name || null
    const holdingBoth = findClipByWords(['holding', 'both'])
    const holdingBothClipName = holdingBoth?.name || null

    const out = [...clips]

    for (const [targetName, resolver] of mapping) {
      if (hasClip(targetName))
        continue
      const src = resolver?.()
      if (!src)
        continue
      const renamed = cloneAs(src, targetName)
      if (renamed)
        out.push(renamed)
    }

    if (!hasClip(AnimationClips.RIGHT_BLOCK) && hasClip(AnimationClips.BLOCK)) {
      const src = out.find(c => c?.name === AnimationClips.BLOCK) || null
      const renamed = cloneAs(src, AnimationClips.RIGHT_BLOCK)
      if (renamed)
        out.push(renamed)
    }

    return { animations: out, waveClipName, holdingBothClipName }
  }

  setMatterGunEquipped(isEquipped) {
    const next = !!isEquipped
    this._wantsMatterGunEquipped = next
    if (next)
      this._equipMatterGun()
    else
      this._unequipMatterGun()
  }

  setMatterGunAiming(isAiming) {
    const next = !!isAiming
    if (next === this._isMatterGunAiming)
      return
    this._isMatterGunAiming = next
  }

  getMatterGunMuzzleWorldPosition() {
    if (!this._matterGunMuzzle)
      return null
    const pos = new THREE.Vector3()
    this._matterGunMuzzle.getWorldPosition(pos)
    return pos
  }

  _findHandBone() {
    let best = null
    const candidates = []
    this.model?.traverse?.((obj) => {
      if (!obj?.isBone || !obj?.name)
        return
      const n = String(obj.name).toLowerCase()
      const isLeft = n.includes('left') || n.includes('hand_l') || n.includes('l_hand') || n.includes('_l') || n.includes('.l') || n.endsWith('l')
      if (isLeft)
        return

      const isHand = n.includes('hand')
      const isWrist = n.includes('wrist')
      const isRight = n.includes('right')
        || n.includes('righthand')
        || n.includes('hand_r')
        || n.includes('r_hand')
        || n.includes('mixamorig:righthand')
        || n.includes('mixamorig_right_hand')

      const exactRightHand = n.includes('righthand') || n.includes('hand_r') || n.includes('mixamorig:righthand')
      let score = 0
      if (exactRightHand)
        score = 60
      else if (isRight && isHand)
        score = 40
      else if (isRight && isWrist)
        score = 28
      else if (isHand)
        score = 12
      else if (isWrist)
        score = 6
      if (score > 0)
        candidates.push({ obj, score })
    })
    candidates.sort((a, b) => b.score - a.score)
    best = candidates[0]?.obj || null
    return best
  }

  _equipMatterGun() {
    if (this._matterGun)
      return

    const gltf = this.resources.items.material_gun
    const scene = gltf?.scene
    if (!scene)
      return

    const gun = scene.clone(true)
    gun.rotation.set(0, 0, 0)
    gun.position.set(0, 0, 0)
    gun.traverse((child) => {
      if (!child?.isMesh)
        return
      child.castShadow = true
      child.receiveShadow = true
      child.frustumCulled = false
      if (child.material) {
        child.material.side = THREE.FrontSide
        child.material.transparent = true
      }
    })

    const gunSize = new THREE.Vector3(1, 1, 1)
    let gunBox = null
    try {
      const box = new THREE.Box3().setFromObject(gun)
      box.getSize(gunSize)
      const maxDim = Math.max(gunSize.x, gunSize.y, gunSize.z)
      const targetMax = 0.38
      const scalar = Number.isFinite(maxDim) && maxDim > 0.0001
        ? THREE.MathUtils.clamp(targetMax / maxDim, 0.05, 2.5)
        : 0.5
      gun.scale.setScalar(scalar)
      gun.updateMatrixWorld(true)
      const box2 = new THREE.Box3().setFromObject(gun)
      const center = new THREE.Vector3()
      box2.getCenter(center)
      gun.position.sub(center)
      gun.updateMatrixWorld(true)
      const box3 = new THREE.Box3().setFromObject(gun)
      box3.getSize(gunSize)
      gunBox = box3
    }
    catch {
      gun.scale.setScalar(0.5)
    }

    const hold = new THREE.Group()
    hold.add(gun)
    hold.rotation.set(0, 0, 0)

    hold.position.set(0.55, 1.05, 0.15)
    hold.rotation.set(0, Math.PI * 0.5, 0)
    this.movement.group.add(hold)

    const muzzle = new THREE.Object3D()
    if (gunBox) {
      const center = new THREE.Vector3()
      gunBox.getCenter(center)
      const muzzlePos = center.clone()
      muzzlePos.z = gunBox.min.z
      muzzle.position.copy(muzzlePos)
    }
    else {
      muzzle.position.set(0, 0, -(gunSize.z || 0.25) * 0.55)
    }
    hold.add(muzzle)

    this._matterGun = hold
    this._matterGunMuzzle = muzzle
  }

  _unequipMatterGun() {
    if (!this._matterGun)
      return

    this.setMatterGunAiming(false)
    this._matterGun.visible = false
    this._matterGun.removeFromParent?.()
    this._matterGun = null
    this._matterGunMuzzle = null
  }

  setOpacity(value) {
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material.opacity = value
      }
    })
  }

  /**
   * 获取角色位置(脚底点)
   * @returns {THREE.Vector3} 角色脚底位置（世界坐标）
   */
  getPosition() {
    return this.movement.position.clone()
  }

  teleportTo(x, y, z) {
    this.movement.position.set(x, y, z)
    this.movement.worldVelocity.set(0, 0, 0)
    this.movement.isGrounded = false
    this.movement.group.position.copy(this.movement.position)
  }

  /**
   * 获取角色朝向角度
   * @returns {number} 朝向角度（弧度）
   */
  getFacingAngle() {
    return this.config.facingAngle
  }

  /**
   * 获取角色速度
   * @returns {THREE.Vector3} 角色速度（世界坐标）
   */
  getVelocity() {
    return this.movement.worldVelocity.clone()
  }

  /**
   * 是否正在移动 (基于物理速度)
   * @returns {boolean} 是否正在移动
   */
  isMoving() {
    const v = this.movement.worldVelocity
    // 速度大于 0.1 视为移动 (参考原 Camera 逻辑)
    return (v.x * v.x + v.z * v.z) > 0.01
  }

  /**
   * 設置角色朝向角度
   * @param {number} angle - 朝向角度（弧度），0 = +Z，Math.PI = -Z
   */
  setFacing(angle) {
    this.config.facingAngle = angle
    this.movement.setFacing(angle)
  }

  setupInputListeners() {
    emitter.on('input:update', (keys) => {
      this.inputState = keys
    })

    emitter.on('input:jump', () => {
      if (this.movement.isGrounded && this.animation.stateMachine.currentState.name !== AnimationStates.COMBAT) {
        this.movement.jump()
        this.animation.triggerJump()
      }
    })

    // ==================== 攻击输入 ====================

    // 直拳（Z键）- 左右交替
    emitter.on('input:punch_straight', () => {
      if (this.isDead || this.isBlocking || !!this.inputState?.c)
        return
      const anim = this._useLeftStraight
        ? AnimationClips.STRAIGHT_PUNCH // 左直拳
        : AnimationClips.RIGHT_STRAIGHT_PUNCH // 右直拳
      this._useLeftStraight = !this._useLeftStraight // 切换下次使用的手
      this.animation.triggerAttack(anim)
    })

    // 勾拳（X键）- 左右交替
    emitter.on('input:punch_hook', () => {
      if (this.isDead || this.isBlocking || !!this.inputState?.c)
        return
      const anim = this._useLeftHook
        ? AnimationClips.HOOK_PUNCH // 左勾拳
        : AnimationClips.RIGHT_HOOK_PUNCH // 右勾拳
      this._useLeftHook = !this._useLeftHook // 切换下次使用的手
      this.animation.triggerAttack(anim)
    })

    // 格挡（C键）- 保持原逻辑
    emitter.on('input:block', (isBlocking) => {
      this.isBlocking = isBlocking
      if (this.isDead)
        return

      if (isBlocking) {
        const blockClip = this.animation.hasAction(AnimationClips.BLOCK)
          ? AnimationClips.BLOCK
          : (this.animation.hasAction(AnimationClips.RIGHT_BLOCK) ? AnimationClips.RIGHT_BLOCK : null)
        if (blockClip)
          this.animation.triggerAttack(blockClip)
      }
      else {
        const currentActionName = this.animation.currentAction?.getClip?.().name ?? null
        if (currentActionName === AnimationClips.BLOCK || currentActionName === AnimationClips.RIGHT_BLOCK) {
          this.animation.stateMachine.setState(AnimationStates.LOCOMOTION)
        }
      }
    })

    // ==================== 鼠标旋转（Pointer Lock 模式） ====================
    emitter.on('input:mouse_move', ({ movementX }) => {
      // 更新目标朝向，而非直接设置
      this.targetFacingAngle -= movementX * this.config.mouseSensitivity
    })
  }

  update() {
    if (this.isDead)
      return

    const currentActionName = this.animation.currentAction?.getClip?.().name ?? null
    const isBlockingAction = currentActionName === AnimationClips.BLOCK || currentActionName === AnimationClips.RIGHT_BLOCK
    const isCombat = this.animation.stateMachine.currentState?.name === AnimationStates.COMBAT && !isBlockingAction

    // Resolve Input (Conflict & Normalize)
    const { resolvedInput: rawResolvedInput, weights } = resolveDirectionInput(this.inputState)
    const resolvedInput = { ...rawResolvedInput }
    if (this._sprintDisabled)
      resolvedInput.shift = false
    if (this._controlLocked) {
      resolvedInput.forward = false
      resolvedInput.backward = false
      resolvedInput.left = false
      resolvedInput.right = false
      resolvedInput.shift = false
      resolvedInput.v = false
      resolvedInput.space = false
    }

    // 恢复体力
    if (!this.inputState.shift && !this.inputState.space && this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.stamina + 0.5, this.maxStamina)
      emitter.emit('ui:update_stats', { stamina: this.stamina })
    }

    // Update Movement
    this.movement.update(resolvedInput, isCombat)

    if (this._wantsMatterGunEquipped && !this._matterGun)
      this._equipMatterGun()

    const isMoving = this.movement.isMoving(resolvedInput)
    const poseClipName = this._holdingBothClipName || this._waveClipName
    const shouldStaticPose = !!poseClipName
      && (this._isMatterGunAiming || this._wantsMatterGunEquipped)
      && this.movement.isGrounded
      && !isCombat
      && !isBlockingAction

    if (this._carryPoseEnabled && this._waveClipName && this.movement.isGrounded && !isBlockingAction) {
      this.animation.setStaticPoseAt(this._waveClipName, 0.55, 0.95)
    }
    else if (shouldStaticPose) {
      this.animation.setStaticPose(poseClipName, this._isMatterGunAiming ? 1 : (isMoving ? 0.25 : 0.85))
    }
    else {
      this.animation.clearStaticPose()
    }

    // ===== 平滑转向 =====
    if (Math.abs(this.config.facingAngle - this.targetFacingAngle) > 0.0001) {
      // 角度 lerp 平滑
      let angle = this.config.facingAngle
      // 简单的 lerp
      angle += (this.targetFacingAngle - angle) * this.config.turnSmoothing

      this.setFacing(angle)
    }

    // Prepare state for animation
    const playerState = {
      inputState: resolvedInput,
      directionWeights: weights, // Pass normalized weights
      isMoving,
      isGrounded: this.movement.isGrounded,
      speedProfile: this.movement.getSpeedProfile(resolvedInput),
      isBlocking: this.isBlocking || !!this.inputState.c,
    }

    // Update Animation
    this.animation.update(this.time.delta, playerState)

    // ==================== 速度线控制 ====================
    this.updateSpeedLines(resolvedInput)
  }

  setCarryPoseEnabled(enabled) {
    this._carryPoseEnabled = !!enabled
  }

  /**
   * 更新速度线效果
   * 当玩家按住 Shift + 方向键冲刺时，显示速度线
   * @param {object} inputState - 输入状态
   */
  updateSpeedLines(inputState) {
    // 检查是否处于冲刺状态：shift + 任意方向键
    const isMoving = inputState.forward || inputState.backward || inputState.left || inputState.right
    const isSprinting = inputState.shift && isMoving

    // 计算时间增量（秒）
    const deltaTime = this.time.delta * 0.001

    // 平滑过渡透明度
    if (isSprinting) {
      // 淡入：向目标透明度靠近
      this._speedLineOpacity += (this.config.speedLines.targetOpacity - this._speedLineOpacity)
        * this.config.speedLines.fadeInSpeed * deltaTime
    }
    else {
      // 淡出：向 0 靠近
      this._speedLineOpacity -= this._speedLineOpacity
        * this.config.speedLines.fadeOutSpeed * deltaTime
    }

    // 限制范围 [0, 1]
    this._speedLineOpacity = Math.max(0, Math.min(1, this._speedLineOpacity))

    // 更新渲染器中的速度线透明度
    this.renderer.setSpeedLineOpacity(this._speedLineOpacity)
  }

  debugInit() {
    // ===== 朝向控制 =====
    this.debugFolder.addBinding(this.config, 'facingAngle', {
      label: '朝向角度',
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
    }).on('change', () => {
      this.setFacing(this.config.facingAngle)
    })

    // ===== 鼠标灵敏度控制 =====
    this.debugFolder.addBinding(this.config, 'mouseSensitivity', {
      label: '鼠标灵敏度',
      min: 0.0001,
      max: 0.01,
      step: 0.0001,
    })

    this.debugFolder.addBinding(this.config, 'turnSmoothing', {
      label: '转向平滑度',
      min: 0.01,
      max: 1.0,
      step: 0.01,
    })

    // ===== 速度控制 =====

    // ===== 速度控制 =====
    this.debugFolder.addBinding(this.config.speed, 'crouch', { label: 'Crouch Speed', min: 0.1, max: 5 })
    this.debugFolder.addBinding(this.config.speed, 'walk', { label: 'Walk Speed', min: 1, max: 10 })
    this.debugFolder.addBinding(this.config.speed, 'run', { label: 'Run Speed', min: 1, max: 20 })
    this.debugFolder.addBinding(this.config, 'jumpForce', { label: 'Jump Force', min: 1, max: 20 })

    // Add Animation State Debug
    const debugState = { state: '' }
    this.debugFolder.addBinding(debugState, 'state', {
      readonly: true,
      label: 'Current State',
      multiline: true,
    })

    emitter.on('core:tick', () => {
      if (this.animation.stateMachine.currentState) {
        debugState.state = this.animation.stateMachine.currentState.name
      }
    })

    // ===== Animation Speed Control =====
    const animSpeedFolder = this.debugFolder.addFolder({
      title: 'Animation Speed',
      expanded: false,
    })

    // Helper to update time scales
    const updateTimeScales = () => {
      this.animation.updateTimeScales()
    }

    // 1. Global Speed
    animSpeedFolder.addBinding(timeScaleConfig, 'global', {
      label: 'Global Rate',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 2. Categories
    const categoriesFolder = animSpeedFolder.addFolder({ title: 'Categories', expanded: true })

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.LOCOMOTION, {
      label: 'Locomotion',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.COMBAT, {
      label: 'Combat',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    categoriesFolder.addBinding(timeScaleConfig.categories, AnimationCategories.ACTION, {
      label: 'Action',
      min: 0.1,
      max: 3.0,
      step: 0.1,
    }).on('change', updateTimeScales)

    // 3. SubGroups
    const subGroupsFolder = animSpeedFolder.addFolder({ title: 'Sub Groups', expanded: false })

    // Locomotion Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'walk', { label: 'Walk', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'run', { label: 'Run', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'sneak', { label: 'Sneak', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'idle', { label: 'Idle', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Combat Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'punch', { label: 'Punch', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'block', { label: 'Block', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // Action Subgroups
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'jump', { label: 'Jump', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'fall', { label: 'Fall', min: 0.1, max: 3.0 }).on('change', updateTimeScales)
    subGroupsFolder.addBinding(timeScaleConfig.subGroups, 'standup', { label: 'Standup', min: 0.1, max: 3.0 }).on('change', updateTimeScales)

    // ===== 碰撞调试 =====
    if (this.movement?.collision) {
      const collisionFolder = this.debugFolder.addFolder({
        title: '碰撞调试',
        expanded: false,
      })

      collisionFolder.addBinding(this.movement.collision.params, 'showCandidates', {
        label: '候选高亮',
      })
      collisionFolder.addBinding(this.movement.collision.params, 'showContacts', {
        label: '接触点',
      })
      collisionFolder.addBinding(this.movement.collision.stats, 'candidateCount', {
        label: '候选数量',
        readonly: true,
      })
      collisionFolder.addBinding(this.movement.collision.stats, 'collisionCount', {
        label: '碰撞数量',
        readonly: true,
      })
    }

    // ===== 重生设置 =====
    const respawnFolder = this.debugFolder.addFolder({
      title: '重生设置',
      expanded: false,
    })
    respawnFolder.addBinding(this.config.respawn, 'thresholdY', {
      label: '阈值Y',
      min: -100,
      max: 100,
      step: 1,
    })
    respawnFolder.addBinding(this.config.respawn.position, 'x', { label: '重生X', min: -200, max: 200, step: 1 })
    respawnFolder.addBinding(this.config.respawn.position, 'y', { label: '重生Y', min: -200, max: 200, step: 1 })
    respawnFolder.addBinding(this.config.respawn.position, 'z', { label: '重生Z', min: -200, max: 200, step: 1 })
  }

  takeDamage(amount) {
    const now = this.time?.elapsed ?? 0
    if (this.isDead)
      return { applied: false, blocked: false, died: false }
    if (now < this._invulnerableUntil)
      return { applied: false, blocked: false, died: false }

    const options = typeof amount === 'object' && amount !== null ? amount : null
    const dmg = options ? (options.amount ?? 1) : amount
    const sourcePosition = options ? (options.sourcePosition ?? null) : null
    const canBeBlocked = options ? (options.canBeBlocked ?? false) : false

    const isBlocking = this.isBlocking || !!this.inputState.c
    if (canBeBlocked && isBlocking && sourcePosition && this._isAttackFromFront(sourcePosition)) {
      if (now - this._lastBlockToastAt > 600)
        emitter.emit('dungeon:toast', { text: '格挡成功' })
      this._lastBlockToastAt = now
      this._invulnerableUntil = now + 220
      return { applied: false, blocked: true, died: false }
    }

    this._invulnerableUntil = now + 480
    this.hp = Math.max(0, this.hp - (dmg ?? 1))
    emitter.emit('ui:update_stats', { hp: this.hp })
    emitter.emit('combat:player_damaged', { amount: dmg ?? 1, hp: this.hp, maxHp: this.maxHp })

    if (this.hp <= 0) {
      this.die()
      return { applied: true, blocked: false, died: true }
    }
    return { applied: true, blocked: false, died: false }
  }

  _isAttackFromFront(sourcePosition) {
    const p = this.getPosition()
    const dx = sourcePosition.x - p.x
    const dz = sourcePosition.z - p.z
    const len = Math.hypot(dx, dz)
    if (len < 0.0001)
      return true

    const facing = this.getFacingAngle()
    const fx = -Math.sin(facing)
    const fz = -Math.cos(facing)
    const nx = dx / len
    const nz = dz / len
    const dot = fx * nx + fz * nz
    return dot >= 0.25
  }

  respawn() {
    this.isDead = false
    this.isBlocking = false
    this.setControlLocked(false)
    this.setSprintDisabled(false)
    this.hp = this.maxHp
    this.stamina = this.maxStamina
    emitter.emit('ui:update_stats', { hp: this.hp, maxHp: this.maxHp, stamina: this.stamina })
    emitter.emit('ui:hide_cta')
    emitter.emit('game:resume')
    this.animation?.playAction?.(AnimationClips.IDLE, 0.1)

    const target = this.movement?.config?.respawn?.position
    if (target) {
      this.teleportTo(target.x, target.y, target.z)
    }
    else {
      this.teleportTo(0, 2, 0)
    }
    this._invulnerableUntil = (this.time?.elapsed ?? 0) + 650
  }

  die(options = null) {
    if (this.isDead)
      return
    this.isDead = true
    this.isBlocking = false
    this.setControlLocked(true)
    this.setSprintDisabled(true)

    const world = this.experience?.world || null
    const reason = typeof options === 'object' && options !== null && options.reason ? String(options.reason) : 'death'

    if (world?.currentWorld === 'dungeon') {
      const actions = this.animation?.actions ? Object.keys(this.animation.actions) : []
      const lowered = actions.map(name => ({ name, lower: String(name).toLowerCase() }))
      const death = lowered.find(row => row.lower.includes('death')) || lowered.find(row => row.lower.includes('die')) || null
      const now = this.time?.elapsed ?? 0
      let delayMs = 1400
      if (death?.name) {
        this.animation?.playAction?.(death.name, 0.08)
        const action = this.animation?.actions?.[death.name] || null
        if (action?.setEffectiveTimeScale)
          action.setEffectiveTimeScale(0.2)
        const clipDur = action?.getClip?.()?.duration
        if (Number.isFinite(Number(clipDur)))
          delayMs = Math.max(900, Math.min(2600, (Number(clipDur) * 1000) / 0.2))
      }
      this._deathCinematicUntil = now + delayMs
      emitter.emit('game:pause')
      setTimeout(() => {
        world?._openDungeonDeathUi?.(reason)
      }, delayMs)
      return
    }

    emitter.emit('ui:show_cta', {
      title: 'YOU DIED',
      message: '胜败乃兵家常事，大侠请重新来过。',
      actions: [
        { type: 'respawn', label: '重生' },
        { type: 'restart', label: '重新开始' },
      ],
    })
    emitter.emit('game:pause')
  }

  destroy() {
    if (this._handleShadowQuality)
      emitter.off('shadow:quality-changed', this._handleShadowQuality)
    if (this._onRespawn)
      emitter.off('game:respawn', this._onRespawn)
    this._unequipMatterGun()
    this.movement?.group?.removeFromParent?.()
  }

  setControlLocked(locked) {
    this._controlLocked = !!locked
    if (this._controlLocked) {
      this.movement?.worldVelocity?.set?.(0, this.movement.worldVelocity.y, 0)
    }
  }

  setSprintDisabled(disabled) {
    this._sprintDisabled = !!disabled
  }

  setSpeedMultiplier(multiplier) {
    this.movement?.setSpeedMultiplier?.(multiplier)
  }
}
