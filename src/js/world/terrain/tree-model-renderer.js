import * as THREE from 'three'
import Experience from '../../experience.js'

export default class TreeModelRenderer {
  constructor(_container, options = {}) {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources

    this.params = options.sharedParams || {
      scale: 1,
      heightScale: 1,
    }
    this._chunkName = options.chunkName

    this.group = new THREE.Group()
    if (this._chunkName) {
      this.group.name = `trees(${this._chunkName})`
    }
    this.scene.add(this.group)

    this._tempObject = new THREE.Object3D()
    this._tempMatrix = new THREE.Matrix4()
    this._treeMeshes = new Map()
  }

  build(treeData) {
    this._disposeChildren()
    if (!Array.isArray(treeData) || treeData.length === 0)
      return

    const byModelKey = new Map()
    for (const t of treeData) {
      const key = String(t?.modelKey || '')
      if (!key)
        continue
      const list = byModelKey.get(key) || []
      list.push({
        x: Number(t?.x) || 0,
        y: Number(t?.y) || 0,
        z: Number(t?.z) || 0,
        rotationY: Number(t?.rotationY) || 0,
      })
      byModelKey.set(key, list)
    }

    byModelKey.forEach((positions, modelKey) => {
      const gltf = this.resources.items?.[modelKey]
      const scene = gltf?.scene
      if (!scene)
        return

      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      const desiredHeight = 6.5
      const h = Math.max(0.001, size.y || 0.001)
      const modelScale = desiredHeight / h

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

        const mesh = new THREE.InstancedMesh(geometry, material, positions.length)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.name = this._chunkName ? `(${this._chunkName}) - ${modelKey}:${mi}` : `${modelKey}:${mi}`
        this.group.add(mesh)
        instancedMeshes.push(mesh)
      }

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        const groundY = pos.y * this.params.heightScale + 0.5
        this._tempObject.position.set(pos.x, groundY, pos.z)
        this._tempObject.rotation.set(0, pos.rotationY, 0)
        this._tempObject.scale.setScalar(modelScale)
        this._tempObject.updateMatrix()

        this._tempMatrix.copy(this._tempObject.matrix)
        this._tempMatrix.multiply(offsetMatrix)

        for (const mesh of instancedMeshes)
          mesh.setMatrixAt(i, this._tempMatrix)
      }

      for (const mesh of instancedMeshes) {
        mesh.instanceMatrix.needsUpdate = true
      }

      this._treeMeshes.set(modelKey, instancedMeshes)
    })

    this.group.scale.setScalar(this.params.scale)
  }

  _disposeChildren() {
    this._treeMeshes.forEach((meshes) => {
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
    this._treeMeshes.clear()
  }

  dispose() {
    this._disposeChildren()
    this.scene.remove(this.group)
  }
}
