import * as THREE from 'three'
import emitter from '../../utils/event-bus.js'
import HumanoidEnemy from '../enemies/humanoid-enemy.js'

export default class HubNpcSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.hubNpcSystem = this
  }

  destroy() {
    if (this.world?.hubNpcSystem === this)
      this.world.hubNpcSystem = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return
    this.updateAnimals()
  }

  initAnimals() {
    const world = this.world
    if (!world)
      return

    world.animals = []
    if (world.animalsGroup) {
      world.animalsGroup.clear()
      world.animalsGroup.removeFromParent?.()
    }
    world.animalsGroup = new THREE.Group()
    world.scene.add(world.animalsGroup)

    const types = ['animal_pig', 'animal_sheep', 'animal_chicken', 'animal_cat', 'animal_wolf', 'animal_horse', 'animal_dog']
    const count = 15
    const centerX = world._hubCenter?.x ?? 0
    const centerZ = world._hubCenter?.z ?? 0

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
      const y = world._getSurfaceY(x, z)
      const stats = world._npcStats?.[cfg.type] || world._npcStats?.enemy_default || {}
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
      world._attachNameLabel(animal.group, world._getModelFilenameByResourceKey(cfg.type), 2.15, 18, 'hub')
      animal.group.rotation.y = Math.random() * Math.PI * 2
      animal.addTo(world.animalsGroup)

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

      world.animals.push(animal)
    }

    for (const cfg of seeds)
      spawnAnimal(cfg)

    for (let i = seeds.length; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)]
      const range = 26
      const x = centerX + (Math.random() - 0.5) * 2 * range
      const z = centerZ + (Math.random() - 0.5) * 2 * range

      spawnAnimal({ type, dx: x - centerX, dz: z - centerZ, role: null, label: type })
    }
  }

  updateAnimals() {
    const world = this.world
    if (!world?.animals)
      return

    const dt = world.experience.time.delta * 0.001
    const now = world.experience.time?.elapsed ?? 0
    const playerPos = world.player?.getPosition?.()
    const playerDead = !!world.player?.isDead

    world.animals.forEach((animal) => {
      animal.update()

      if (!animal.behavior)
        return

      const data = animal.behavior

      if (data.state === 'carried' && animal === world._carriedAnimal) {
        const camera = world.experience.camera?.instance
        if (camera) {
          const camPos = new THREE.Vector3()
          const camDir = new THREE.Vector3()
          camera.getWorldPosition(camPos)
          camera.getWorldDirection(camDir)
          camDir.normalize()

          const hold = camPos.clone().add(camDir.multiplyScalar(2.1))
          hold.y -= 0.85
          const groundY = world._getSurfaceY(hold.x, hold.z) + 0.2
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
        const groundY = world._getSurfaceY(pos.x, pos.z)
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
          const quarry = world._hubAutomation?.quarry
          const box = world._hubAutomation?.box
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
            world._spawnAnimalThought(animal, '💡', 1.1)
            emitter.emit('dungeon:toast', { text: '矿工鼠开始挖矿' })
          }
          else if (wasThrown && role === 'carrier' && quarry && d2q <= (quarry.radius + 4.0) * (quarry.radius + 4.0)) {
            data.state = 'idle'
            data.timer = 1.1 + Math.random() * 1.2
            data.carrierEnabled = true
            animal.playAnimation?.('Idle')
            animal.group.rotation.x = 0
            animal.group.rotation.z = 0
            world._spawnAnimalThought(animal, '💡', 0.9)
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
        const stats = world._npcStats?.[animal._resourceKey] || world._npcStats?.enemy_default || {}
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
          if (hit && world.player?.takeDamage) {
            const source = new THREE.Vector3(animal.group.position.x, animal.group.position.y, animal.group.position.z)
            world.player.takeDamage({ amount: hit.damage, canBeBlocked: true, sourcePosition: source })
          }

          const pos = animal.group.position
          const groundY = world._getSurfaceY(pos.x, pos.z)
          animal.group.position.y += (groundY - animal.group.position.y) * 0.18
          return
        }
      }

      if (data.state === 'mining') {
        const quarry = world._hubAutomation?.quarry
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
          if ((world._hubDrops?.length ?? 0) < 40) {
            const ox = (Math.random() - 0.5) * 1.8
            const oz = (Math.random() - 0.5) * 1.8
            world._spawnHubDrop('stone', 1, quarry.x + ox, quarry.z + oz)
          }
        }
        const groundY = world._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.18
        return
      }

      if (data.state === 'carry_pickup') {
        const targetDrop = world._hubDrops?.find(d => d.id === data.targetDropId) || null
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
          const removed = world._removeHubDropById(targetDrop.id)
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
        const groundY = world._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.15
        return
      }

      if (data.state === 'carry_to_box') {
        const box = world._hubAutomation?.box
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
          world._addInventoryItem('warehouse', data.carrying.itemId, data.carrying.count)
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
        const groundY = world._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.18
        return
      }

      if (data.role === 'carrier' && data.carrierEnabled && (data.state === 'idle' || data.state === 'walk') && !data.carrying) {
        const pos = animal.group.position
        const nearest = world._findNearestHubDrop(pos.x, pos.z, 10)
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
        const groundY = world._getSurfaceY(pos.x, pos.z)
        animal.group.position.y += (groundY - animal.group.position.y) * 0.1
      }
    })
  }

  findGrabCandidateAnimal(options = {}) {
    const world = this.world
    if (!world || world.currentWorld !== 'hub' || !world.player || !world.animals || world.animals.length === 0)
      return null
    const camera = world.experience.camera?.instance
    if (!camera)
      return null
    const maxDist = Number.isFinite(options.maxDist) ? options.maxDist : 1.7
    const minDot = Number.isFinite(options.minDot) ? options.minDot : 0.72

    const playerPos = world.player.getPosition?.()
    if (!playerPos)
      return null

    const camPos = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(camDir)

    let best = null
    let bestScore = Infinity
    for (const animal of world.animals) {
      if (!animal?.group)
        continue
      if (animal === world._carriedAnimal)
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

  toggleCarryAnimal() {
    const world = this.world
    if (!world || world.isPaused)
      return
    if (world.currentWorld !== 'hub')
      return
    if (world._carriedAnimal) {
      this.dropCarriedAnimal()
      return
    }
    const target = this.findGrabCandidateAnimal()
    if (!target)
      return
    world._carriedAnimal = target
    if (!world._carriedAnimal.behavior)
      world._carriedAnimal.behavior = {}
    world._carriedAnimal.behavior.state = 'carried'
    world._carriedAnimal.behavior.timer = 0
    world._carriedAnimal.behavior.physics = null
    world._carriedAnimal.playAnimation?.('Idle')
    world._emitInventorySummary()
  }

  dropCarriedAnimal() {
    const world = this.world
    if (!world?._carriedAnimal || !world.player)
      return
    const animal = world._carriedAnimal
    world._carriedAnimal = null
    if (!animal.behavior)
      animal.behavior = {}
    animal.behavior.state = 'idle'
    animal.behavior.timer = 1 + Math.random() * 2
    animal.playAnimation?.('Idle')
    const p = world.player.getPosition()
    const angle = world.player.getFacingAngle()
    const fx = Math.sin(angle)
    const fz = Math.cos(angle)
    animal.group.position.set(p.x + fx * 1.4, p.y + 0.6, p.z + fz * 1.4)
    const groundY = world._getSurfaceY(animal.group.position.x, animal.group.position.z)
    animal.group.position.y = groundY
    world._emitInventorySummary()
  }

  throwCarriedAnimal() {
    const world = this.world
    if (!world || world.isPaused)
      return
    if (world.currentWorld !== 'hub')
      return
    if (!world._carriedAnimal || !world.player)
      return

    const camera = world.experience.camera?.instance
    if (!camera) {
      this.dropCarriedAnimal()
      return
    }

    const animal = world._carriedAnimal
    world._carriedAnimal = null

    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.normalize()

    const camPos = new THREE.Vector3()
    camera.getWorldPosition(camPos)
    const start = camPos.clone().add(dir.clone().multiplyScalar(2.1))
    start.y -= 0.65
    const groundY = world._getSurfaceY(start.x, start.z) + 0.25
    if (start.y < groundY)
      start.y = groundY
    animal.group.position.copy(start)

    const baseSpeed = 12
    const vel = dir.multiplyScalar(baseSpeed)
    const pv = world.player.getVelocity()
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
    world._emitInventorySummary()
  }
}
