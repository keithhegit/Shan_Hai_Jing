import * as THREE from 'three'

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
          if (hit && world.player?.takeDamage) {
            const source = new THREE.Vector3(enemy.group.position.x, enemy.group.position.y, enemy.group.position.z)
            world.player.takeDamage({ amount: hit.damage, canBeBlocked: true, sourcePosition: source })
          }

          const pos = enemy.group.position
          const groundY = world._getSurfaceY(pos.x, pos.z)
          enemy.group.position.y += (groundY - enemy.group.position.y) * 0.18
          if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
            enemy.group.position.y = Number(world._dungeonSurfaceY)
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

        const groundY = world._getSurfaceY(pos.x, pos.z)
        enemy.group.position.y += (groundY - enemy.group.position.y) * 0.15
        if (world.currentWorld === 'dungeon' && Number.isFinite(Number(world._dungeonSurfaceY)))
          enemy.group.position.y = Number(world._dungeonSurfaceY)
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
