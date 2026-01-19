import { blocks } from '../terrain/blocks-config.js'

export default class BlockDungeonGenerator {
  constructor(chunkManager) {
    this.chunkManager = chunkManager
  }

  _getEnemyPool(dungeonType, stage) {
    const type = String(dungeonType || '').toLowerCase()
    const s = Math.max(1, Math.min(4, Math.floor(Number(stage) || 1)))

    const tables = {
      plains: {
        1: ['tribal'],
        2: ['orc'],
        3: ['tribal', 'orc'],
        4: { boss: 'giant', adds: ['orc'] },
      },
      snow: {
        1: ['yeti'],
        2: ['yeti'],
        3: ['yeti2'],
        4: { boss: 'yeti2', adds: ['yeti2'] },
      },
      desert: {
        1: ['cactoro'],
        2: ['dino'],
        3: ['cactoro', 'dino'],
        4: { boss: 'dino', adds: ['dino'] },
      },
      forest: {
        1: ['frog'],
        2: ['monkroose'],
        3: ['ninja', 'monkroose'],
        4: { boss: 'mushroomking', adds: ['ninja'] },
      },
      mine: {
        1: ['skeleton'],
        2: ['orc_skull'],
        3: ['skeleton_armor'],
        4: { boss: 'skeleton_armor', adds: ['orc_skull'] },
      },
    }

    const table = tables[type] || tables.plains
    const entry = table[s]
    if (s === 4 && entry && typeof entry === 'object' && !Array.isArray(entry))
      return entry
    return { adds: Array.isArray(entry) ? entry : ['skeleton'] }
  }

  generate(originX, originZ, type) {
    const style = this._getStyle(type)
    const dir = this._getDirection(type)

    // 获取地表高度，作为地牢地板的基础
    const groundY = this.chunkManager.getTopSolidYWorld(originX, originZ) ?? 10

    const waterOffset = this.chunkManager?.waterParams?.waterOffset ?? 3
    const heightScale = this.chunkManager?.renderParams?.heightScale ?? 1
    const minFloorBlockY = Math.ceil(waterOffset * heightScale + 3)

    const floorBlockY = Math.max(groundY, minFloorBlockY)
    const surfaceY = floorBlockY + 0.5

    // 地牢布局参数
    const layout = this._createLayout(type)

    const startX = Math.floor(originX)
    const startZ = Math.floor(originZ)

    const enemyPositions = []
    const interactables = []
    let reward = null

    // 遍历布局生成
    // Layout format: relative coordinates (l, w) where l is forward, w is right
    // Rooms: { l, w, width, length, height }
    // Corridors: { l, w, width, length, height }

    // 清理与生成
    layout.rooms.forEach((room) => {
      const built = this._buildRoom(startX, startZ, floorBlockY, dir, room, style, enemyPositions, interactables, type)
      if (built?.reward && !reward)
        reward = built.reward
    })

    layout.corridors.forEach((corridor) => {
      this._buildCorridor(startX, startZ, floorBlockY, dir, corridor, style)
    })

    // Spawn points
    const spawnX = startX + dir.x * 2
    const spawnZ = startZ + dir.z * 2

    const endRoom = layout.rooms[layout.rooms.length - 1]
    const exitX = startX + dir.x * (endRoom.l + endRoom.length / 2) + (-dir.z * endRoom.w)
    const exitZ = startZ + dir.z * (endRoom.l + endRoom.length / 2) + (dir.x * endRoom.w)

    const chestTypes = new Set(['plains', 'snow', 'desert', 'forest'])
    const perpX = -dir.z
    const perpZ = dir.x
    const toWorld = (forward, right) => {
      return {
        x: startX + Math.floor(dir.x * forward + perpX * right),
        z: startZ + Math.floor(dir.z * forward + perpZ * right),
      }
    }

    const startRoom = layout.rooms[0]
    const mainRoom = layout.rooms.find(r => r.type === 'fight4' || r.type === 'main') || layout.rooms[1]
    const startCenter = toWorld(startRoom.l, startRoom.w)
    const mainCenter = toWorld(mainRoom.l, mainRoom.w)
    const endCenter = toWorld(endRoom.l, endRoom.w)

    if (chestTypes.has(type)) {
      interactables.push({ x: endCenter.x, y: surfaceY, z: endCenter.z })
    }
    interactables.push({ x: mainCenter.x + perpX * 2, y: surfaceY, z: mainCenter.z + perpZ * 2 })
    interactables.push({ x: startCenter.x - perpX * 2, y: surfaceY, z: startCenter.z - perpZ * 2 })

    return {
      surfaceY,
      spawn: { x: spawnX, y: surfaceY + 0.1, z: spawnZ },
      exit: { x: exitX, y: surfaceY, z: exitZ },
      layout,
      enemies: enemyPositions,
      interactables,
      reward,
    }
  }

  _buildRoom(startX, startZ, floorBlockY, dir, room, style, enemies, _interactables, dungeonType) {
    const { l, w, width, length, height } = room

    // Calculate world bounds
    // Center of room relative to start:
    // Forward: l
    // Right: w

    // We iterate local grid relative to room center
    const halfL = Math.floor(length / 2)
    const halfW = Math.floor(width / 2)

    for (let dl = -halfL; dl <= halfL; dl++) {
      for (let dw = -halfW; dw <= halfW; dw++) {
        for (let h = -1; h <= height; h++) {
          const perpX = -dir.z
          const perpZ = dir.x

          const forward = l + dl
          const right = w + dw

          const x = startX + Math.floor(dir.x * forward + perpX * right)
          const z = startZ + Math.floor(dir.z * forward + perpZ * right)
          const y = floorBlockY + h

          let blockId = blocks.empty.id

          const isWall = (dl === -halfL || dl === halfL || dw === -halfW || dw === halfW)

          if (h === 0) {
            blockId = style.floor
          }
          else if (h === -1) {
            blockId = style.floor
          }
          else {
            // Walls (no roof for better visibility)
            if (isWall) {
              // Check if this wall position is an entrance/exit (connected to corridor)
              // Simplified: Leave gaps if h < 4
              // For now, simple solid walls, corridors will punch holes or we overlay
              blockId = style.wall
            }
            else {
              blockId = blocks.empty.id
            }
          }

          if (blockId === blocks.empty.id) {
            this.chunkManager.removeBlockWorld(x, y, z)
          }
          else {
            this.chunkManager.addBlockWorld(x, y, z, blockId)
          }
        }
      }
    }

    let reward = null

    // Add enemies and loot in fight rooms
    const roomType = String(room.type || '')
    const match = roomType.match(/^fight(\d)$/)
    const stage = match ? Math.max(1, Math.min(4, Number(match[1]) || 1)) : null
    if (stage) {
      const cx = startX + dir.x * l + (-dir.z * w)
      const cz = startZ + dir.z * l + (dir.x * w)
      const isBoss = stage === 4
      const count = isBoss ? Math.max(5, 2 + stage) : stage
      const pool = this._getEnemyPool(dungeonType, stage)
      const adds = pool?.adds?.length ? pool.adds : ['skeleton']
      const bossType = pool?.boss || adds[0] || 'skeleton'
      for (let i = 0; i < count; i++) {
        const dx = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * (1 + Math.floor(i / 2))
        const dz = i === 0 ? 0 : ((i % 3) - 1)
        const spawnIsBoss = isBoss && i === 0
        const spawnType = spawnIsBoss ? bossType : adds[i % adds.length]
        const hp = spawnIsBoss ? (10 + stage * 2) : (3 + stage)
        const scale = spawnIsBoss ? 1.2 : 1
        enemies.push({ x: cx + dx, y: floorBlockY + 0.5, z: cz + dz, isBoss: spawnIsBoss, stage, type: spawnType, hp, scale })
      }
      if (isBoss)
        reward = { x: cx, y: floorBlockY + 0.5, z: cz }
    }

    return { reward }
  }

  _buildCorridor(startX, startZ, floorBlockY, dir, corridor, style) {
    const { l, w, width, length, height, axis = 'forward' } = corridor

    // Corridors are aligned with direction
    const halfL = Math.floor(length / 2)
    const halfW = Math.floor(width / 2)

    for (let dl = -halfL; dl <= halfL; dl++) {
      for (let dw = -halfW; dw <= halfW; dw++) {
        for (let h = 0; h <= height; h++) {
          const perpX = -dir.z
          const perpZ = dir.x

          const u = dl
          const v = dw
          const forward = axis === 'right' ? (l + v) : (l + u)
          const right = axis === 'right' ? (w + u) : (w + v)

          const x = startX + Math.floor(dir.x * forward + perpX * right)
          const z = startZ + Math.floor(dir.z * forward + perpZ * right)
          const y = floorBlockY + h

          let blockId = blocks.empty.id

          const isWall = (dw === -halfW || dw === halfW)

          if (h === 0) {
            blockId = style.floor
          }
          else {
            if (isWall) {
              blockId = style.wall
            }
            else {
              blockId = blocks.empty.id // Punch hole through room walls
            }
          }

          // Force clear room walls at connections
          if (blockId === blocks.empty.id) {
            this.chunkManager.removeBlockWorld(x, y, z)
          }
          else {
            this.chunkManager.addBlockWorld(x, y, z, blockId)
          }
        }
      }
    }
  }

  _createLayout(_type) {
    const r1 = { l: 5, w: 0, width: 9, length: 9, height: 5, type: 'start' }

    const f1 = { l: 22, w: 0, width: 11, length: 11, height: 6, type: 'fight1' }
    const f2 = { l: 38, w: 7, width: 9, length: 9, height: 6, type: 'fight2' }
    const f3 = { l: 38, w: -7, width: 9, length: 9, height: 6, type: 'fight3' }
    const f4 = { l: 54, w: 0, width: 13, length: 13, height: 7, type: 'fight4' }

    const ex = { l: 70, w: 0, width: 9, length: 9, height: 5, type: 'extraction' }

    const corridors = [
      { l: 14, w: 0, width: 3, length: 12, height: 5, axis: 'forward' }, // start -> fight1
      { l: 30, w: 0, width: 3, length: 12, height: 5, axis: 'forward' }, // fight1 -> branch junction

      { l: 38, w: 3.5, width: 3, length: 9, height: 5, axis: 'right' }, // junction -> fight2
      { l: 38, w: -3.5, width: 3, length: 9, height: 5, axis: 'right' }, // junction -> fight3
      { l: 38, w: 0, width: 3, length: 17, height: 5, axis: 'right' }, // fight2 <-> fight3 loop

      { l: 46, w: 7, width: 3, length: 12, height: 5, axis: 'forward' }, // fight2 -> fight4 approach
      { l: 46, w: -7, width: 3, length: 12, height: 5, axis: 'forward' }, // fight3 -> fight4 approach
      { l: 54, w: 3.5, width: 3, length: 9, height: 5, axis: 'right' }, // fight2 lane -> fight4
      { l: 54, w: -3.5, width: 3, length: 9, height: 5, axis: 'right' }, // fight3 lane -> fight4

      { l: 62, w: 0, width: 3, length: 12, height: 5, axis: 'forward' }, // fight4 -> extraction
    ]

    return {
      rooms: [r1, f1, f2, f3, f4, ex],
      corridors,
    }
  }

  _getDirection(type) {
    switch (type) {
      case 'plains': return { x: 0, z: 1 }
      case 'desert': return { x: 0, z: -1 }
      case 'snow': return { x: 1, z: 0 }
      case 'forest': return { x: -1, z: 0 }
      case 'mine': return { x: 0, z: 1 }
      default: return { x: 0, z: 1 }
    }
  }

  _getStyle(type) {
    const stone = blocks.stone.id
    switch (type) {
      case 'plains': return { floor: blocks.stone.id, wall: blocks.stone.id, roof: blocks.stone.id }
      case 'desert': return { floor: blocks.sand.id, wall: blocks.terracotta?.id || stone, roof: blocks.sand.id }
      case 'snow': return { floor: blocks.packedIce?.id || stone, wall: blocks.snow?.id || stone, roof: blocks.snow?.id || stone }
      case 'forest': return { floor: blocks.dirt.id, wall: blocks.treeTrunk.id, roof: blocks.treeLeaves.id }
      case 'mine': return { floor: blocks.stone.id, wall: blocks.stone.id, roof: blocks.stone.id }
      default: return { floor: stone, wall: stone, roof: stone }
    }
  }
}
