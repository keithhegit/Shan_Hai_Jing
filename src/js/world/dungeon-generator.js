import * as THREE from 'three'
import Experience from '../experience.js'

/**
 * 地牢生成器
 * 负责生成 50m 长的线性地牢长廊
 */
export default class DungeonGenerator {
  constructor() {
    this.experience = new Experience()
    this.scene = this.experience.scene

    // 材质
    this.materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 }),
    }

    this.group = new THREE.Group()
    this.scene.add(this.group)

    this.generate()
  }

  generate() {
    // 50m 长廊, 宽 6m, 高 4m
    const length = 50
    const width = 6
    const height = 4

    // 地板
    const floorGeo = new THREE.BoxGeometry(width, 1, length)
    const floor = new THREE.Mesh(floorGeo, this.materials.floor)
    floor.position.set(0, -0.5, length / 2) // 起点在 (0,0,0)
    floor.receiveShadow = true
    this.group.add(floor)

    // 天花板
    const ceilGeo = new THREE.BoxGeometry(width, 1, length)
    const ceil = new THREE.Mesh(ceilGeo, this.materials.ceiling)
    ceil.position.set(0, height + 0.5, length / 2)
    this.group.add(ceil)

    // 左墙
    const wallGeo = new THREE.BoxGeometry(1, height, length)
    const wallL = new THREE.Mesh(wallGeo, this.materials.wall)
    wallL.position.set(-(width / 2 + 0.5), height / 2, length / 2)
    wallL.castShadow = true
    wallL.receiveShadow = true
    this.group.add(wallL)

    // 右墙
    const wallR = new THREE.Mesh(wallGeo, this.materials.wall)
    wallR.position.set(width / 2 + 0.5, height / 2, length / 2)
    wallR.castShadow = true
    wallR.receiveShadow = true
    this.group.add(wallR)

    // 终点墙
    const endWallGeo = new THREE.BoxGeometry(width + 2, height, 1)
    const endWall = new THREE.Mesh(endWallGeo, this.materials.wall)
    endWall.position.set(0, height / 2, length + 0.5)
    this.group.add(endWall)

    // 装饰性火把/光源 (每隔 10m)
    for (let z = 5; z < length; z += 10) {
      this.addTorch(-width / 2 + 0.5, 2, z)
      this.addTorch(width / 2 - 0.5, 2, z)
    }
  }

  addTorch(x, y, z) {
    const light = new THREE.PointLight(0xFFAA00, 2, 8)
    light.position.set(x, y, z)
    this.group.add(light)

    // 简单的火把模型
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8B4513 }),
    )
    stick.position.set(x, y - 0.25, z)
    this.group.add(stick)
  }

  destroy() {
    this.scene.remove(this.group)
    // 释放几何体与材质...
    this.group.traverse((child) => {
      if (child.geometry)
        child.geometry.dispose()
      // Material 在 this.materials 中统一管理，这里可以不释放或单独释放
    })
  }
}
