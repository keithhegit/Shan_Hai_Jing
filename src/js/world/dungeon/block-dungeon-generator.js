import { blocks } from '../terrain/blocks-config.js'

export default class BlockDungeonGenerator {
  constructor(chunkManager) {
    this.chunkManager = chunkManager
  }

  _toWorld(startX, startZ, dir, forward, right) {
    const perpX = -dir.z
    const perpZ = dir.x
    return {
      x: startX + Math.floor(dir.x * forward + perpX * right),
      z: startZ + Math.floor(dir.z * forward + perpZ * right),
    }
  }

  _clearAirColumn(startX, startZ, floorBlockY, dir, forward, right, radius, height) {
    const r = Math.max(0, Math.floor(Number(radius) || 0))
    const h = Math.max(1, Math.floor(Number(height) || 1))
    for (let df = -r; df <= r; df++) {
      for (let dr = -r; dr <= r; dr++) {
        const wpos = this._toWorld(startX, startZ, dir, forward + df, right + dr)
        for (let dy = 1; dy <= h; dy++) {
          this.chunkManager.removeBlockWorld(wpos.x, floorBlockY + dy, wpos.z)
        }
      }
    }
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

    for (const corridor of layout.corridors) {
      const axis = corridor.axis || 'forward'
      const half = Math.floor((Number(corridor.length) || 0) / 2)
      const doorRadius = Math.max(2, Math.floor((Number(corridor.width) || 0) / 2) + 1)
      const doorHeight = 5

      if (axis === 'right') {
        this._clearAirColumn(startX, startZ, floorBlockY, dir, corridor.l, corridor.w - half - 1, doorRadius, doorHeight)
        this._clearAirColumn(startX, startZ, floorBlockY, dir, corridor.l, corridor.w + half + 1, doorRadius, doorHeight)
      }
      else {
        this._clearAirColumn(startX, startZ, floorBlockY, dir, corridor.l - half - 1, corridor.w, doorRadius, doorHeight)
        this._clearAirColumn(startX, startZ, floorBlockY, dir, corridor.l + half + 1, corridor.w, doorRadius, doorHeight)
      }
    }

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity

    for (const room of layout.rooms) {
      const halfL = Math.floor((Number(room.length) || 0) / 2) + 2
      const halfW = Math.floor((Number(room.width) || 0) / 2) + 2
      const corners = [
        this._toWorld(startX, startZ, dir, room.l - halfL, room.w - halfW),
        this._toWorld(startX, startZ, dir, room.l - halfL, room.w + halfW),
        this._toWorld(startX, startZ, dir, room.l + halfL, room.w - halfW),
        this._toWorld(startX, startZ, dir, room.l + halfL, room.w + halfW),
      ]
      minX = Math.min(minX, ...corners.map(c => c.x))
      maxX = Math.max(maxX, ...corners.map(c => c.x))
      minZ = Math.min(minZ, ...corners.map(c => c.z))
      maxZ = Math.max(maxZ, ...corners.map(c => c.z))
    }

    for (const corridor of layout.corridors) {
      const axis = corridor.axis || 'forward'
      const halfL = Math.floor((Number(corridor.length) || 0) / 2) + 2
      const halfW = Math.floor((Number(corridor.width) || 0) / 2) + 2
      const fMin = axis === 'right' ? (corridor.l - halfW) : (corridor.l - halfL)
      const fMax = axis === 'right' ? (corridor.l + halfW) : (corridor.l + halfL)
      const rMin = axis === 'right' ? (corridor.w - halfL) : (corridor.w - halfW)
      const rMax = axis === 'right' ? (corridor.w + halfL) : (corridor.w + halfW)
      const corners = [
        this._toWorld(startX, startZ, dir, fMin, rMin),
        this._toWorld(startX, startZ, dir, fMin, rMax),
        this._toWorld(startX, startZ, dir, fMax, rMin),
        this._toWorld(startX, startZ, dir, fMax, rMax),
      ]
      minX = Math.min(minX, ...corners.map(c => c.x))
      maxX = Math.max(maxX, ...corners.map(c => c.x))
      minZ = Math.min(minZ, ...corners.map(c => c.z))
      maxZ = Math.max(maxZ, ...corners.map(c => c.z))
    }

    if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
      this.chunkManager?.removePlantsInWorldBoxes?.([
        { minX, maxX, minZ, maxZ, minY: 0, maxY: (this.chunkManager?.chunkHeight ?? 32) - 1 },
      ])
    }

    // Spawn points
    const perpX = -dir.z
    const perpZ = dir.x
    const toWorld = (forward, right) => this._toWorld(startX, startZ, dir, forward, right)

    const entranceRoom = layout.rooms.find(r => r.type === 'entrance') || layout.rooms[0]
    const chestRoom = layout.rooms.find(r => r.type === 'treasure') || null
    const bossRoom = layout.rooms.find(r => r.type === 'boss') || null
    const exitRoom = layout.rooms.find(r => r.type === 'exit') || layout.rooms[layout.rooms.length - 1]

    const entranceCenter = toWorld(entranceRoom.l, entranceRoom.w)
    const exitCenter = toWorld(exitRoom.l, exitRoom.w)
    const chestCenter = chestRoom ? toWorld(chestRoom.l, chestRoom.w) : null
    const bossCenter = bossRoom ? toWorld(bossRoom.l, bossRoom.w) : null

    const spawnX = entranceCenter.x
    const spawnZ = entranceCenter.z

    const exitX = exitCenter.x
    const exitZ = exitCenter.z

    this.chunkManager?.removePlantsInWorldRadius?.(spawnX, spawnZ, 72)

    this._clearAirColumn(startX, startZ, floorBlockY, dir, entranceRoom.l, entranceRoom.w, 3, 6)
    this._clearAirColumn(startX, startZ, floorBlockY, dir, exitRoom.l, exitRoom.w, 3, 6)
    if (chestRoom)
      this._clearAirColumn(startX, startZ, floorBlockY, dir, chestRoom.l, chestRoom.w, 4, 10)

    const chestPortalIds = new Set(['plains', 'snow', 'desert', 'forest'])
    if (chestRoom && chestPortalIds.has(type))
      interactables.push({ x: chestCenter.x, y: surfaceY, z: chestCenter.z })

    if (bossCenter)
      interactables.push({ x: bossCenter.x + perpX * 2, y: surfaceY, z: bossCenter.z + perpZ * 2 })
    interactables.push({ x: entranceCenter.x - perpX * 2, y: surfaceY, z: entranceCenter.z - perpZ * 2 })

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
    const clearExtra = 12
    const clearHeight = Math.max(height, 0) + clearExtra

    for (let dl = -halfL; dl <= halfL; dl++) {
      for (let dw = -halfW; dw <= halfW; dw++) {
        for (let h = -1; h <= clearHeight; h++) {
          const perpX = -dir.z
          const perpZ = dir.x

          const forward = l + dl
          const right = w + dw

          const x = startX + Math.floor(dir.x * forward + perpX * right)
          const z = startZ + Math.floor(dir.z * forward + perpZ * right)
          const y = floorBlockY + h

          let blockId = blocks.empty.id

          const isWall = (dl === -halfL || dl === halfL || dw === -halfW || dw === halfW)

          if (h > height) {
            blockId = blocks.empty.id
          }
          else if (h === 0) {
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
    if (roomType === 'boss') {
      const cx = startX + dir.x * l + (-dir.z * w)
      const cz = startZ + dir.z * l + (dir.x * w)
      const pool = this._getEnemyPool(dungeonType, 4)
      const adds = pool?.adds?.length ? pool.adds : ['skeleton']
      const bossType = pool?.boss || adds[0] || 'skeleton'
      enemies.push({ x: cx, y: floorBlockY + 0.5, z: cz, isBoss: true, stage: 4, type: bossType, hp: 14, scale: 1.35 })
      reward = { x: cx, y: floorBlockY + 0.5, z: cz }
    }
    else if (stage) {
      const cx = startX + dir.x * l + (-dir.z * w)
      const cz = startZ + dir.z * l + (dir.x * w)
      const count = 1
      const pool = this._getEnemyPool(dungeonType, stage)
      const adds = pool?.adds?.length ? pool.adds : ['skeleton']
      for (let i = 0; i < count; i++) {
        const dx = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * (1 + Math.floor(i / 2))
        const dz = i === 0 ? 0 : ((i % 3) - 1)
        const spawnType = adds[i % adds.length]
        const hp = 3 + stage
        const scale = 1
        enemies.push({ x: cx + dx, y: floorBlockY + 0.5, z: cz + dz, isBoss: false, stage, type: spawnType, hp, scale })
      }
    }

    return { reward }
  }

  _buildCorridor(startX, startZ, floorBlockY, dir, corridor, style) {
    const { l, w, width, length, height, axis = 'forward' } = corridor

    // Corridors are aligned with direction
    const halfL = Math.floor(length / 2)
    const halfW = Math.floor(width / 2)
    const clearExtra = 12
    const clearHeight = Math.max(height, 0) + clearExtra

    for (let dl = -halfL; dl <= halfL; dl++) {
      for (let dw = -halfW; dw <= halfW; dw++) {
        for (let h = 0; h <= clearHeight; h++) {
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

          const isEndpoint = Math.abs(dl) >= Math.max(0, halfL - 1)
          const isWall = !isEndpoint && (dw === -halfW || dw === halfW)

          if (h > height) {
            blockId = blocks.empty.id
          }
          else if (h === 0) {
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
    const entrance = { l: 5, w: 0, width: 19, length: 19, height: 7, type: 'entrance' }

    const r1 = { l: 22, w: 0, width: 13, length: 13, height: 7, type: 'fight1' }
    const r2 = { l: 38, w: -10, width: 15, length: 15, height: 8, type: 'fight2' }
    const r3 = { l: 38, w: 10, width: 13, length: 13, height: 8, type: 'fight3' }
    const r4 = { l: 54, w: 10, width: 13, length: 13, height: 8, type: 'fight4' }
    const boss = { l: 30, w: 22, width: 15, length: 15, height: 9, type: 'boss' }
    const treasure = { l: 30, w: 36, width: 13, length: 13, height: 8, type: 'treasure' }
    const exit = { l: 14, w: 36, width: 13, length: 13, height: 8, type: 'exit' }

    const corridors = [
      { l: 14, w: 0, width: 7, length: 18, height: 6, axis: 'forward' },
      { l: 30, w: 0, width: 7, length: 18, height: 6, axis: 'forward' },

      { l: 38, w: -5, width: 7, length: 17, height: 6, axis: 'right' },
      { l: 38, w: 5, width: 7, length: 17, height: 6, axis: 'right' },
      { l: 38, w: 0, width: 7, length: 33, height: 6, axis: 'right' },

      { l: 46, w: 10, width: 7, length: 18, height: 6, axis: 'forward' },

      { l: 34, w: 10, width: 7, length: 18, height: 6, axis: 'forward' },
      { l: 30, w: 16, width: 7, length: 24, height: 6, axis: 'right' },

      { l: 30, w: 29, width: 7, length: 28, height: 6, axis: 'right' },
      { l: 22, w: 36, width: 7, length: 34, height: 6, axis: 'forward' },
    ]

    return {
      rooms: [entrance, r1, r2, r3, r4, boss, treasure, exit],
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
