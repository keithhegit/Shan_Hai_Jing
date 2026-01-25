import * as THREE from 'three'
import { blocks } from '../terrain/blocks-config.js'

export default class DungeonEnemySystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.dungeonEnemySystem = this
  }

  destroy() {
    if (this.world?.dungeonEnemySystem === this)
      this.world.dungeonEnemySystem = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world)
      return
    const allies = Array.isArray(world._summonedAllies) ? world._summonedAllies : []
    if (allies.length > 0) {
      const dt = world.experience.time.delta * 0.001
      const now = world.experience.time?.elapsed ?? 0
      const playerPos = world.player?.getPosition?.()
      const enemies = world.currentWorld === 'dungeon'
        ? (Array.isArray(world._dungeonEnemies) ? world._dungeonEnemies : [])
        : []
      this.updateSummonedAllies({ dt, now, playerPos, enemies })
    }
    this.updateDungeonEnemies()
  }

  updateDungeonEnemies() {
    const world = this.world
    if (!world?._dungeonEnemies || world.currentWorld !== 'dungeon')
      return

    const dt = world.experience.time.delta * 0.001
    const now = world.experience.time?.elapsed ?? 0
    const playerPos = world.player?.getPosition?.()
    const playerDead = !!world.player?.isDead
    const allies = Array.isArray(world._summonedAllies) ? world._summonedAllies : []

    for (const enemy of world._dungeonEnemies) {
      enemy?.update?.()

      if (enemy?.isBoss && enemy?.isDead) {
        if (!world._dungeonRewardSpawned)
          world._spawnDungeonReward()
      }
      if (enemy && !enemy.isBoss && enemy.isDead && !enemy._coinDropped) {
        enemy._coinDropped = true
        this.spawnDungeonCoinDrop(enemy)
      }
      if (enemy?.isDead)
        continue

      this.resolveIfInsideSolid(enemy)

      const data = enemy?.behavior
      if (!data || !enemy?.group)
        continue

      if (enemy.isStunned?.(now)) {
        data.state = 'stun'
        enemy.playStun?.()
        const pos = enemy.group.position
        const groundY = world._getSurfaceY(pos.x, pos.z)
        enemy.group.position.y += (groundY - enemy.group.position.y) * 0.18
        if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
          enemy.group.position.y = Number(world._dungeonSurfaceY)
        this.resolveIfInsideSolid(enemy)
        continue
      }

      if (playerPos && !enemy.isDead) {
        const target = this.pickTargetForEnemy({ enemy, playerPos, playerDead, allies, now })
        const targetPos = target?.pos
        if (!targetPos)
          continue

        const ex = enemy.group.position.x
        const ez = enemy.group.position.z
        const dxp = targetPos.x - ex
        const dzp = targetPos.z - ez
        const d2p = dxp * dxp + dzp * dzp
        const aggro2 = (target.aggroRange ?? 9.0) ** 2
        const attack2 = (target.attackRange ?? 2.2) ** 2
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
            this.moveWithCollision(enemy, { dx: nx * speed, dz: nz * speed })
          }
          else {
            data.state = 'attack'
            enemy.tryAttack?.({ now, damage: enemy.isBoss ? 2 : 1, range: enemy.isBoss ? 2.35 : 2.1, windupMs: enemy.isBoss ? 220 : 260 })
          }

          const hit = enemy.consumeAttackHit?.({ now })
          if (hit) {
            const source = new THREE.Vector3(enemy.group.position.x, enemy.group.position.y, enemy.group.position.z)
            if (target.type === 'ally' && target.entity?.takeDamage) {
              target.entity.takeDamage(hit.damage)
              if (target.entity.isDead) {
                const exhaustedMeta = target.entity._summonedFromCanisterMeta
                  ? { ...target.entity._summonedFromCanisterMeta, exhausted: true }
                  : { exhausted: true }
                world._spawnDungeonItemDrop?.({ itemId: target.entity._summonedFromCanisterId || 'canister_small', amount: 1, x: target.entity.group.position.x, z: target.entity.group.position.z, canisterMeta: exhaustedMeta })
                world._despawnSummonedAlly?.(target.entity)
              }
            }
            else if (target.type === 'player' && world.player?.takeDamage) {
              world.player.takeDamage({ amount: hit.damage, canBeBlocked: true, sourcePosition: source })
            }
          }

          const pos = enemy.group.position
          const groundY = world._getSurfaceY(pos.x, pos.z)
          enemy.group.position.y += (groundY - enemy.group.position.y) * 0.18
          if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
            enemy.group.position.y = Number(world._dungeonSurfaceY)
          this.resolveIfInsideSolid(enemy)
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
        const dir = new THREE.Vector3()
        enemy.group.getWorldDirection(dir)
        dir.y = 0
        if (dir.lengthSq() > 1e-6) {
          dir.normalize()
          this.moveWithCollision(enemy, { dx: dir.x * speed, dz: dir.z * speed })
        }

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

        const groundY = world._getSurfaceY(pos.x, pos.z)
        enemy.group.position.y += (groundY - enemy.group.position.y) * 0.15
        if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
          enemy.group.position.y = Number(world._dungeonSurfaceY)
        this.resolveIfInsideSolid(enemy)
      }
    }
  }

  pickTargetForEnemy({ enemy, playerPos, playerDead, allies, now }) {
    const data = enemy?.behavior
    const forceAggro = (data?.forceAggroUntil ?? 0) > now
    const aggroRange = 9.0
    const attackRange = enemy?.isBoss ? 2.35 : 2.1

    if (!playerDead) {
      let best = null
      let bestD2 = Number.POSITIVE_INFINITY
      const ex = enemy.group.position.x
      const ez = enemy.group.position.z
      for (const ally of allies) {
        if (!ally?.group || ally.isDead)
          continue
        const dx = ally.group.position.x - ex
        const dz = ally.group.position.z - ez
        const d2 = dx * dx + dz * dz
        if (d2 < bestD2) {
          bestD2 = d2
          best = ally
        }
      }
      if (best && (forceAggro || bestD2 <= aggroRange * aggroRange))
        return { type: 'ally', entity: best, pos: best.group.position, aggroRange, attackRange }
      return { type: 'player', entity: null, pos: playerPos, aggroRange, attackRange }
    }

    let best = null
    let bestD2 = Number.POSITIVE_INFINITY
    const ex = enemy.group.position.x
    const ez = enemy.group.position.z
    for (const ally of allies) {
      if (!ally?.group || ally.isDead)
        continue
      const dx = ally.group.position.x - ex
      const dz = ally.group.position.z - ez
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = ally
      }
    }
    if (best)
      return { type: 'ally', entity: best, pos: best.group.position, aggroRange, attackRange }
    return null
  }

  updateSummonedAllies({ dt, now, playerPos, enemies }) {
    const world = this.world
    const allies = Array.isArray(world._summonedAllies) ? world._summonedAllies : []
    const enemyList = Array.isArray(enemies) ? enemies : []
    const followMin = 1.25
    const followMax = 4.25
    const followCatchUp = 7.0
    const threatAggro = 9.0
    const threatAggro2 = threatAggro * threatAggro
    const threatStates = new Set(['chase', 'attack'])
    const px = playerPos?.x ?? null
    const pz = playerPos?.z ?? null
    const hasPlayer = Number.isFinite(Number(px)) && Number.isFinite(Number(pz))

    let primaryThreat = null
    if (hasPlayer && enemyList.length > 0) {
      let best = null
      let bestD2 = Number.POSITIVE_INFINITY
      for (const e of enemyList) {
        if (!e?.group || e.isDead)
          continue
        const data = e.behavior
        const forceAggro = (data?.forceAggroUntil ?? 0) > now
        const stateThreat = threatStates.has(String(data?.state || ''))
        const dx = e.group.position.x - px
        const dz = e.group.position.z - pz
        const d2 = dx * dx + dz * dz
        const inAggro = d2 <= threatAggro2
        if (!forceAggro && !stateThreat && !inAggro)
          continue
        if (d2 < bestD2) {
          bestD2 = d2
          best = e
        }
      }
      primaryThreat = best
    }

    for (const ally of allies) {
      ally?.update?.()
      if (!ally?.group || ally.isDead)
        continue
      const ax = ally.group.position.x
      const az = ally.group.position.z

      if (ally.isStunned?.(now)) {
        ally.behavior = ally.behavior || {}
        ally.behavior.state = 'stun'
        ally.playStun?.()
        const pos = ally.group.position
        const groundY = world._getSurfaceY(pos.x, pos.z)
        ally.group.position.y += (groundY - ally.group.position.y) * 0.18
        if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
          ally.group.position.y = Number(world._dungeonSurfaceY)
        this.resolveIfInsideSolid(ally)
        continue
      }

      const targetEnemy = primaryThreat
      if (targetEnemy?.group) {
        const targetPos = targetEnemy.group.position
        const dxp = targetPos.x - ax
        const dzp = targetPos.z - az
        const d2p = dxp * dxp + dzp * dzp
        const attack2 = 2.2 * 2.2
        const len = Math.hypot(dxp, dzp)
        const nx = len > 0.0001 ? (dxp / len) : 0
        const nz = len > 0.0001 ? (dzp / len) : 1
        const facing = Math.atan2(dxp, dzp)
        ally.group.rotation.y = facing

        if (d2p <= attack2) {
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'attack'
          ally.tryAttack?.({ now, damage: 1, range: 2.1, windupMs: 260 })
          const hit = ally.consumeAttackHit?.({ now })
          if (hit && targetEnemy?.takeDamage) {
            targetEnemy.takeDamage(hit.damage)
          }
        }
        else {
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'walk'
          ally.playLocomotion?.() || ally.playWalk?.() || ally.playAnimation?.('Walk')
          const speed = 1.25 * dt
          this.moveWithCollision(ally, { dx: nx * speed, dz: nz * speed })
        }
      }
      else if (hasPlayer) {
        const dxp = px - ax
        const dzp = pz - az
        const len = Math.hypot(dxp, dzp)
        const dist = len
        if (dist > followCatchUp) {
          const nx = len > 0.0001 ? (dxp / len) : 0
          const nz = len > 0.0001 ? (dzp / len) : 1
          const facing = Math.atan2(dxp, dzp)
          ally.group.rotation.y = facing
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'walk'
          ally.playLocomotion?.() || ally.playWalk?.() || ally.playAnimation?.('Walk')
          const speed = 1.65 * dt
          this.moveWithCollision(ally, { dx: nx * speed, dz: nz * speed })
        }
        else if (dist > followMax) {
          const nx = len > 0.0001 ? (dxp / len) : 0
          const nz = len > 0.0001 ? (dzp / len) : 1
          const facing = Math.atan2(dxp, dzp)
          ally.group.rotation.y = facing
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'walk'
          ally.playLocomotion?.() || ally.playWalk?.() || ally.playAnimation?.('Walk')
          const speed = 1.25 * dt
          this.moveWithCollision(ally, { dx: nx * speed, dz: nz * speed })
        }
        else if (dist < followMin) {
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'idle'
          ally.playAnimation?.('Idle')
        }
        else {
          ally.behavior = ally.behavior || {}
          ally.behavior.state = 'idle'
          ally.playAnimation?.('Idle')
        }
      }

      const pos = ally.group.position
      const groundY = world._getSurfaceY(pos.x, pos.z)
      ally.group.position.y += (groundY - ally.group.position.y) * 0.18
      if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
        ally.group.position.y = Number(world._dungeonSurfaceY)
      this.resolveIfInsideSolid(ally)
    }
  }

  moveWithCollision(entity, { dx = 0, dz = 0 } = {}) {
    const world = this.world
    if (!world?.chunkManager || !entity?.group)
      return
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6)
      return

    const pos = entity.group.position
    const r = Math.min(0.9, Math.max(0.35, (Number(entity.hitRadius) || 0.9) * 0.55))
    const nextX = pos.x + dx
    const nextZ = pos.z + dz
    if (this.canOccupyAt(nextX, nextZ, pos.y, r)) {
      pos.x = nextX
      pos.z = nextZ
      return
    }

    if (this.canOccupyAt(nextX, pos.z, pos.y, r)) {
      pos.x = nextX
      return
    }

    if (this.canOccupyAt(pos.x, nextZ, pos.y, r)) {
      pos.z = nextZ
    }
  }

  canOccupyAt(x, z, y, radius = 0.45) {
    const world = this.world
    const cm = world?.chunkManager
    if (!cm?.getBlockWorld)
      return true
    const emptyId = blocks.empty.id
    const r = Math.max(0, Number(radius) || 0)
    const samples = r > 0.01
      ? [
          { x, z },
          { x: x + r, z },
          { x: x - r, z },
          { x, z: z + r },
          { x, z: z - r },
          { x: x + r, z: z + r },
          { x: x + r, z: z - r },
          { x: x - r, z: z + r },
          { x: x - r, z: z - r },
        ]
      : [{ x, z }]
    const baseY = Math.floor(Number.isFinite(Number(y)) ? y : 0) + 1
    for (const s of samples) {
      const ix = Math.floor(s.x)
      const iz = Math.floor(s.z)
      for (let dy = 0; dy <= 2; dy++) {
        const b = cm.getBlockWorld(ix, baseY + dy, iz)
        if (b?.id && b.id !== emptyId)
          return false
      }
    }
    return true
  }

  resolveIfInsideSolid(entity) {
    const world = this.world
    const cm = world?.chunkManager
    if (!cm?.getBlockWorld || !entity?.group)
      return
    const pos = entity.group.position
    const hitRadius = Math.min(0.9, Math.max(0.35, (Number(entity.hitRadius) || 0.9) * 0.55))
    if (this.canOccupyAt(pos.x, pos.z, pos.y, hitRadius))
      return

    for (let r = 1; r <= 12; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r)
            continue
          const nx = Math.floor(pos.x) + dx
          const nz = Math.floor(pos.z) + dz
          const px = nx + 0.5
          const pz = nz + 0.5
          if (this.canOccupyAt(px, pz, pos.y, hitRadius)) {
            pos.x = px
            pos.z = pz
            return
          }
        }
      }
    }
  }

  spawnDungeonCoinDrop(enemy) {
    const world = this.world
    if (world?.currentWorld !== 'dungeon')
      return
    if (!enemy?.group)
      return
    const pos = new THREE.Vector3()
    enemy.group.getWorldPosition(pos)
    world.dropSystem?.spawnDungeonItemDrop?.({ itemId: 'coin', amount: 1, x: pos.x, z: pos.z })
  }
}
