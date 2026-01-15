import { blocks } from '../terrain/blocks-config.js'

export default class BlockDungeonGenerator {
  constructor(chunkManager) {
    this.chunkManager = chunkManager
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
      const built = this._buildRoom(startX, startZ, floorBlockY, dir, room, style, enemyPositions, interactables)
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

    return {
      surfaceY,
      spawn: { x: spawnX, y: surfaceY + 0.1, z: spawnZ },
      exit: { x: exitX, y: surfaceY, z: exitZ },
      enemies: enemyPositions,
      interactables,
      reward,
    }
  }

  _buildRoom(startX, startZ, floorBlockY, dir, room, style, enemies, _interactables) {
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

    // Add enemies and loot in center
    if (room.type === 'main') {
      const cx = startX + dir.x * l + (-dir.z * w)
      const cz = startZ + dir.z * l + (dir.x * w)
      enemies.push({ x: cx + 2, y: floorBlockY + 0.5, z: cz + 2, isBoss: true })
      reward = { x: cx, y: floorBlockY + 0.5, z: cz }
    }

    return { reward }
  }

  _buildCorridor(startX, startZ, floorBlockY, dir, corridor, style) {
    const { l, w, width, length, height } = corridor

    // Corridors are aligned with direction
    const halfL = Math.floor(length / 2)
    const halfW = Math.floor(width / 2)

    for (let dl = -halfL; dl <= halfL; dl++) {
      for (let dw = -halfW; dw <= halfW; dw++) {
        for (let h = 0; h <= height; h++) {
          const perpX = -dir.z
          const perpZ = dir.x

          const forward = l + dl
          const right = w + dw

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
    // Simple 3-room layout
    // Room 1 (Start) -> Corridor -> Room 2 (Main) -> Corridor -> Room 3 (End)

    const r1 = { l: 5, w: 0, width: 9, length: 9, height: 6, type: 'start' }
    const c1 = { l: 14, w: 0, width: 3, length: 10, height: 5 }
    const r2 = { l: 24, w: 0, width: 15, length: 15, height: 8, type: 'main' } // Big room
    const c2 = { l: 36, w: 0, width: 3, length: 10, height: 5 }
    const r3 = { l: 45, w: 0, width: 9, length: 9, height: 6, type: 'end' }

    return {
      rooms: [r1, r2, r3],
      corridors: [c1, c2],
    }
  }

  _getDirection(type) {
    switch (type) {
      case 'plains': return { x: 0, z: 1 }
      case 'desert': return { x: 0, z: -1 }
      case 'snow': return { x: 1, z: 0 }
      case 'forest': return { x: -1, z: 0 }
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
      default: return { floor: stone, wall: stone, roof: stone }
    }
  }
}
