import { Color, Vector2 } from 'three'
import { FBM } from '../tools/noise.js'

export default class TerrainDataManager {
  constructor(options = {}) {
    this.size = options.size || 100
    this.seed = options.seed || Math.random()

    // FBM 配置
    this.fbm = new FBM({
      seed: this.seed,
      scale: 0.05,
      octaves: 4,
      persistance: 0.5,
      lacunarity: 2,
      ...options.noise, // 允许覆盖
    })

    this.dataBlocks = [] // { x, z, height, normalizedHeight, color }

    this.colors = {
      water: new Color(0x22AADD),
      sand: new Color(0xE6DDC5),
      grass: new Color(0x55AA55),
      snow: new Color(0xFFFFFF),
    }

    this.init()
  }

  init() {
    this.generateMapData()
  }

  generateMapData() {
    const halfSize = Math.floor(this.size / 2)

    for (let x = -halfSize; x < halfSize; x++) {
      for (let z = -halfSize; z < halfSize; z++) {
        // 获取噪声值 (0 ~ 1)
        const noiseVal = this.fbm.get2(new Vector2(x, z))

        // 映射到 -1 ~ 1 用于逻辑判断
        const normalizedHeight = noiseVal * 2 - 1

        // 确定颜色和实际高度
        let color
        let height = Math.floor(normalizedHeight * 10) // 离散化高度，制造方块感

        if (normalizedHeight <= -0.2) {
          color = this.colors.water
          height = -2 // 水面统一高度
        }
        else if (normalizedHeight <= 0) {
          color = this.colors.sand
          height = Math.max(height, -1) // 沙滩略高于水面
        }
        else if (normalizedHeight <= 0.6) {
          color = this.colors.grass
        }
        else {
          color = this.colors.snow
        }

        this.dataBlocks.push({
          x,
          z,
          height, // 实际渲染高度 (y)
          normalizedHeight, // 原始高度数据 (用于逻辑)
          color,
        })
      }
    }
  }

  /**
   * 获取指定位置的地形数据
   * @param {number} x
   * @param {number} z
   */
  getDataAt(x, z) {
    // 简单遍历查找，优化可改为 Map 或二维数组索引
    return this.dataBlocks.find(b => b.x === x && b.z === z)
  }
}
