import * as THREE from 'three'
import Experience from '../../experience.js'
import { loadGltfCached } from './gltf-cache.js'

function _hash2D(x, z, seed = 1337) {
  const xi = Math.floor(Number(x) || 0)
  const zi = Math.floor(Number(z) || 0)
  const s = Math.floor(Number(seed) || 0)
  let h = (xi * 374761393) ^ (zi * 668265263) ^ (s * 1442695041)
  h = (h ^ (h >>> 13)) * 1274126177
  h ^= (h >>> 16)
  return (h >>> 0) / 4294967295
}

function _pickWeighted(list, r01) {
  const items = Array.isArray(list) ? list.filter(Boolean) : []
  if (items.length === 0)
    return null
  let total = 0
  for (const it of items) {
    const w = Math.max(0, Number(it.weight) || 1)
    total += w
  }
  if (total <= 0)
    return items[0]
  let t = (Number(r01) || 0) * total
  for (const it of items) {
    const w = Math.max(0, Number(it.weight) || 1)
    t -= w
    if (t <= 0)
      return it
  }
  return items[items.length - 1]
}

export default class PlantModelRenderer {
  constructor(_container, options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.params = options.sharedParams || { scale: 1, heightScale: 1 }
    this.plantParams = options.sharedPlantParams || {}
    this._chunkName = options.chunkName
    this._originX = Number(options.originX) || 0
    this._originZ = Number(options.originZ) || 0
    this._seed = Math.floor(Number(options.seed) || 1337)

    this.group = new THREE.Group()
    if (this._chunkName)
      this.group.name = `plantsModel(${this._chunkName})`
    this.scene.add(this.group)

    this._tempObject = new THREE.Object3D()
    this._tempMatrix = new THREE.Matrix4()
    this._meshesByModel = new Map()
    this._buildToken = 0
  }

  build(plantData) {
    this._disposeChildren()
    if (!Array.isArray(plantData) || plantData.length === 0)
      return

    const token = ++this._buildToken

    const densityScale = Math.max(0, Math.min(1, Number(this.plantParams?.densityScale ?? 0.35)))
    const poolsByPlantId = this.plantParams?.poolsByPlantId || {}
    const defaultPool = this.plantParams?.defaultPool || []

    const grouped = new Map()
    for (const p of plantData) {
      const x = Number(p?.x) || 0
      const y = Number(p?.y) || 0
      const z = Number(p?.z) || 0
      const plantId = String(p?.plantId ?? '')

      const wx = this._originX + x
      const wz = this._originZ + z
      const r = _hash2D(wx, wz, this._seed)
      if (densityScale < 1 && r > densityScale)
        continue

      const pool = Array.isArray(poolsByPlantId?.[plantId]) ? poolsByPlantId[plantId] : defaultPool
      const pick = _pickWeighted(pool, _hash2D(wx + 17.3, wz - 9.1, this._seed))
      const url = String(pick?.url || '')
      if (!url)
        continue
      const list = grouped.get(url) || []
      list.push({
        x,
        y,
        z,
        plantId,
        r,
        rotationY: (_hash2D(wx - 3.7, wz + 5.9, this._seed) * Math.PI * 2),
        scaleJitter: 0.85 + _hash2D(wx + 11.1, wz + 12.2, this._seed) * 0.35,
      })
      grouped.set(url, list)
    }

    grouped.forEach((instances, url) => {
      loadGltfCached(this.resources, url).then((gltf) => {
        if (token !== this._buildToken)
          return
        const scene = gltf?.scene
        if (!scene)
          return

        const box = new THREE.Box3().setFromObject(scene)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)

        const desiredHeight = Math.max(0.05, Number(this.plantParams?.desiredHeight ?? 0.8))
        const h = Math.max(0.001, size.y || 0.001)
        const modelScaleBase = desiredHeight / h

        const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z)
        const offsetMatrix = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z)

        const sourceMeshes = []
        scene.traverse((child) => {
          if (child?.isMesh && child.geometry && child.material)
            sourceMeshes.push(child)
        })
        if (sourceMeshes.length === 0)
          return

        const instancedMeshes = []
        for (let mi = 0; mi < sourceMeshes.length; mi++) {
          const src = sourceMeshes[mi]
          const geometry = src.geometry.clone()
          geometry.computeBoundingSphere()
          const material = Array.isArray(src.material)
            ? src.material.map(m => m.clone())
            : src.material.clone()
          const mesh = new THREE.InstancedMesh(geometry, material, instances.length)
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          mesh.castShadow = !!this.plantParams?.castShadow
          mesh.receiveShadow = true
          mesh.name = this._chunkName ? `(${this._chunkName}) - plant:${mi}` : `plant:${mi}`
          this.group.add(mesh)
          instancedMeshes.push(mesh)
        }

        for (let i = 0; i < instances.length; i++) {
          const pos = instances[i]
          const groundY = (pos.y - 1) * this.params.heightScale + 0.5 + (Number(this.plantParams?.yOffset) || 0)
          this._tempObject.position.set(pos.x, groundY, pos.z)
          this._tempObject.rotation.set(0, pos.rotationY, 0)
          this._tempObject.scale.setScalar(modelScaleBase * pos.scaleJitter)
          this._tempObject.updateMatrix()
          this._tempMatrix.copy(this._tempObject.matrix)
          this._tempMatrix.multiply(offsetMatrix)
          for (const mesh of instancedMeshes)
            mesh.setMatrixAt(i, this._tempMatrix)
        }

        for (const mesh of instancedMeshes)
          mesh.instanceMatrix.needsUpdate = true

        this._meshesByModel.set(url, instancedMeshes)
      })
    })

    this.group.scale.setScalar(this.params.scale)
  }

  update() {}

  _disposeChildren() {
    this._buildToken++
    this._meshesByModel.forEach((meshes) => {
      const list = Array.isArray(meshes) ? meshes : []
      for (const mesh of list) {
        if (mesh?.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mats.forEach(m => m?.dispose?.())
        }
        mesh?.geometry?.dispose?.()
        this.group.remove(mesh)
        mesh?.dispose?.()
      }
    })
    this._meshesByModel.clear()
  }

  dispose() {
    this._disposeChildren()
    this.scene.remove(this.group)
  }
}
