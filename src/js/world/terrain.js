import * as THREE from 'three'
import Experience from '../experience.js'
import TerrainDataManager from './terrain-data-manager.js'

export default class Terrain {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene

    // 初始化数据管理器
    this.dataManager = new TerrainDataManager({
      size: 100,
      seed: Math.random(),
    })

    // 公开给其他模块使用 (如 MiniMap)
    this.experience.terrainDataManager = this.dataManager

    // 几何体与材质
    this.geometry = new THREE.BoxGeometry(1, 1, 1)
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
    })

    this.mesh = null

    this.init()
  }

  init() {
    const count = this.dataManager.dataBlocks.length
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true

    const dummy = new THREE.Object3D()

    for (let i = 0; i < count; i++) {
      const block = this.dataManager.dataBlocks[i]

      // 设置位置
      // 注意：这里简单地将方块放置在 (x, height, z)
      // 如果需要柱状地形，需要调整 scale.y 和 position.y
      dummy.position.set(block.x, block.height, block.z)
      dummy.updateMatrix()

      this.mesh.setMatrixAt(i, dummy.matrix)
      this.mesh.setColorAt(i, block.color)
    }

    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor)
      this.mesh.instanceColor.needsUpdate = true

    this.scene.add(this.mesh)
  }
}
