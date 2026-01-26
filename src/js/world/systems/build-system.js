import * as THREE from 'three'
import Experience from '../../experience.js'
import BlockRaycaster from '../../interaction/block-raycaster.js'
import emitter from '../../utils/event-bus.js'
import { blocks } from '../terrain/blocks-config.js'

export default class BuildSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    this.experience = new Experience()
    this.resources = this.experience.resources
    this.camera = this.experience.camera?.instance || null
    this.scene = this.experience.scene

    this.active = false
    this.mode = 'add'
    this.rotationIndex = 0
    this.itemId = null
    this._pending = null
    this._placements = new Map()
    this._group = new THREE.Group()
    this._group.visible = false
    this.scene.add(this._group)

    this._preview = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({
        color: 0x33_FF_33,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    )
    this._preview.visible = false
    this._preview.frustumCulled = false
    this._previewModel = new THREE.Group()
    this._previewModel.visible = false
    this._preview.add(this._previewModel)
    this.scene.add(this._preview)

    this._raycaster = new BlockRaycaster({
      chunkManager: this.world?.chunkManager,
      maxDistance: 10,
      useMouse: false,
      enabled: false,
    })
    this._fenceRaycaster = new THREE.Raycaster()
    this._fenceRaycaster.far = 9

    this._onToggle = () => {
      if (!this.active)
        return
      this.mode = this.mode === 'add' ? 'remove' : 'add'
      this._syncHud()
    }
    this._onRotate = () => {
      if (!this.active)
        return
      this.rotationIndex = (this.rotationIndex + 1) % 4
      this._syncHud()
    }
    this._onEquip = (payload) => {
      const id = payload?.itemId ? String(payload.itemId) : ''
      if (id !== 'Fence_Center' && id !== 'Fence_Corner')
        return
      this.activate(id)
    }
    this._onClear = () => {
      this.deactivate()
    }

    emitter.on('input:toggle_block_edit_mode', this._onToggle)
    emitter.on('input:rotate_build', this._onRotate)
    emitter.on('build:equip', this._onEquip)
    emitter.on('build:clear', this._onClear)

    this._load()
  }

  destroy() {
    emitter.off('input:toggle_block_edit_mode', this._onToggle)
    emitter.off('input:rotate_build', this._onRotate)
    emitter.off('build:equip', this._onEquip)
    emitter.off('build:clear', this._onClear)
    this._onToggle = null
    this._onRotate = null
    this._onEquip = null
    this._onClear = null

    this._preview?.removeFromParent?.()
    this._preview?.geometry?.dispose?.()
    this._preview?.material?.dispose?.()
    this._preview = null
    this._previewModel = null

    this._group?.removeFromParent?.()
    this._group = null
    this._placements?.clear?.()
    this._placements = null

    this._raycaster = null
    this._fenceRaycaster = null
    this.world = null
    this.context = null
  }

  activate(itemId) {
    this.active = true
    this.itemId = String(itemId)
    this.mode = 'add'
    this.rotationIndex = 0
    this._group.visible = this.world?.currentWorld === 'hub'
    this._raycaster.params.enabled = true
    this._setPreviewItem(this.itemId)
    emitter.emit('build:active', true)
    this._syncHud()
  }

  deactivate() {
    this.active = false
    this.itemId = null
    this._pending = null
    if (this._group)
      this._group.visible = false
    if (this._preview)
      this._preview.visible = false
    if (this._previewModel)
      this._previewModel.visible = false
    if (this._raycaster?.params)
      this._raycaster.params.enabled = false
    emitter.emit('build:active', false)
    emitter.emit('build:hud_clear')
  }

  update() {
    const world = this.world
    if (!world || !this._preview)
      return
    if (world.currentWorld !== 'hub') {
      this._preview.visible = false
      if (this._previewModel)
        this._previewModel.visible = false
      if (this._group)
        this._group.visible = false
      return
    }

    if (this._group)
      this._group.visible = true

    if (!this.active) {
      this._preview.visible = false
      if (this._previewModel)
        this._previewModel.visible = false
      return
    }

    if (!this._raycaster?.chunkManager && world.chunkManager)
      this._raycaster.chunkManager = world.chunkManager

    this._raycaster?.update?.()

    const mat = this._preview.material
    if (mat?.color) {
      mat.color.set(this.mode === 'add' ? 0x33_FF_33 : 0xFF_33_33)
    }

    if (this.mode === 'add') {
      const hit = this._raycaster?.current || null
      if (!hit?.worldBlock)
        return this._setPreview(false)
      const nx = hit.face?.normal ? Math.round(hit.face.normal.x) : 0
      const nz = hit.face?.normal ? Math.round(hit.face.normal.z) : 0
      const tx = Math.floor(hit.worldBlock.x + nx)
      const tz = Math.floor(hit.worldBlock.z + nz)
      const topY = world.chunkManager?.getTopSolidYWorld?.(tx, tz)
      if (!Number.isFinite(Number(topY)))
        return this._setPreview(false)
      const py = Number(topY) + 1
      this._preview.position.set(tx, py, tz)
      this._preview.visible = true
      if (this._previewModel) {
        this._previewModel.visible = true
        this._previewModel.rotation.y = this.rotationIndex * (Math.PI / 2)
      }
      this._pending = { x: tx, y: py, z: tz, rot: this.rotationIndex, itemId: this.itemId }
      return
    }

    const hitFence = this._raycastFence()
    if (!hitFence)
      return this._setPreview(false)
    this._preview.position.copy(hitFence.pos)
    this._preview.visible = true
    if (this._previewModel)
      this._previewModel.visible = false
    this._pending = { removeKey: hitFence.key }
  }

  handleMouseDown(event) {
    if (!this.active || !event || event.button !== 0)
      return false
    if (this.mode === 'add')
      return this._placeFence()
    return this._removeFence()
  }

  _placeFence() {
    const world = this.world
    const p = this._pending
    if (!world || !p || !p.itemId)
      return false
    const key = this._key(p.x, p.y, p.z)
    if (this._placements.has(key)) {
      emitter.emit('dungeon:toast', { text: '该位置已放置' })
      return true
    }
    const items = world.inventorySystem?.getBagItems?.('backpack') || {}
    const count = Math.max(0, Math.floor(Number(items?.[p.itemId]) || 0))
    if (count <= 0) {
      emitter.emit('dungeon:toast', { text: '背包里没有对应 Fence 道具' })
      return true
    }
    const ok = world.inventorySystem?.removeItem?.('backpack', p.itemId, 1)
    if (!ok) {
      emitter.emit('dungeon:toast', { text: '无法消耗 Fence 道具' })
      return true
    }
    const node = this._spawnFenceNode(p.itemId, p.x, p.y, p.z, p.rot)
    if (!node) {
      world.inventorySystem?.addItem?.('backpack', p.itemId, 1)
      emitter.emit('dungeon:toast', { text: '放置失败：资源未就绪' })
      return true
    }
    node.userData.placementKey = key
    world.chunkManager?.addBlockWorld?.(p.x, p.y, p.z, blocks.invisibleSolid.id)
    this._placements.set(key, { itemId: p.itemId, x: p.x, y: p.y, z: p.z, rot: p.rot, node })
    this._save()
    emitter.emit('dungeon:toast', { text: '已放置' })
    return true
  }

  _removeFence() {
    const world = this.world
    const p = this._pending
    if (!world || !p?.removeKey)
      return false
    const rec = this._placements.get(p.removeKey)
    if (!rec)
      return true
    rec.node?.removeFromParent?.()
    this._placements.delete(p.removeKey)
    world.chunkManager?.removeBlockWorld?.(rec.x, rec.y, rec.z)
    const canAdd = world.inventorySystem?._canAddToBackpack?.(rec.itemId, 1) ?? true
    if (canAdd) {
      world.inventorySystem?.addItem?.('backpack', rec.itemId, 1)
    }
    else {
      const pos = world.player?.getPosition?.()
      world._spawnHubDrop?.(rec.itemId, 1, pos?.x ?? 0, pos?.z ?? 0)
    }
    this._save()
    emitter.emit('dungeon:toast', { text: '已拆除' })
    return true
  }

  _setPreview(vis) {
    this._pending = null
    this._preview.visible = !!vis
  }

  _key(x, y, z) {
    return `${x},${y},${z}`
  }

  _syncHud() {
    if (!this.active)
      return
    emitter.emit('build:hud', {
      itemId: this.itemId,
      mode: this.mode,
      rotationIndex: this.rotationIndex,
      hint: 'R 旋转 · T 切换建造/拆卸 · 鼠标左键执行',
    })
  }

  _raycastFence() {
    if (!this.camera || !this._group)
      return null
    const origin = new THREE.Vector3()
    const dir = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    this.camera.getWorldDirection(dir)
    this._fenceRaycaster.set(origin, dir)
    const hits = this._fenceRaycaster.intersectObjects(this._group.children, true)
    const first = hits.find(h => h?.object)
    if (!first)
      return null
    let o = first.object
    while (o && o.parent && !o.userData?.placementKey)
      o = o.parent
    const key = o?.userData?.placementKey || null
    if (!key)
      return null
    const rec = this._placements.get(String(key))
    if (!rec)
      return null
    return { key: String(key), pos: new THREE.Vector3(rec.x, rec.y, rec.z) }
  }

  _spawnFenceNode(itemId, x, y, z, rotIndex) {
    const resKey = itemId === 'Fence_Corner' ? 'fence_corner' : 'fence_center'
    const scene = this.resources?.items?.[resKey]?.scene
    if (!scene || !this._group)
      return null
    const model = scene.clone(true)
    model.traverse((o) => {
      if (o?.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
        o.frustumCulled = false
      }
    })
    const wrapper = new THREE.Group()
    wrapper.add(model)
    wrapper.position.set(x, y, z)
    wrapper.rotation.y = (Number(rotIndex) || 0) * (Math.PI / 2)
    wrapper.scale.setScalar(0.5)
    this._group.add(wrapper)
    return wrapper
  }

  _setPreviewItem(itemId) {
    if (!this._previewModel)
      return
    this._previewModel.clear()
    const id = String(itemId || '')
    const resKey = id === 'Fence_Corner' ? 'fence_corner' : 'fence_center'
    const scene = this.resources?.items?.[resKey]?.scene
    if (!scene)
      return
    const model = scene.clone(true)
    model.traverse((o) => {
      if (o?.isMesh) {
        o.castShadow = false
        o.receiveShadow = false
        o.frustumCulled = false
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])
        for (const m of mats) {
          if (!m)
            continue
          if ('transparent' in m)
            m.transparent = true
          if ('opacity' in m)
            m.opacity = 0.6
          if ('depthWrite' in m)
            m.depthWrite = false
          if ('side' in m)
            m.side = THREE.DoubleSide
          m.needsUpdate = true
        }
      }
    })
    model.scale.setScalar(0.5)
    this._previewModel.add(model)
  }

  _load() {
    try {
      const raw = window.localStorage?.getItem?.('mmmc:fence_build_v1')
      if (!raw)
        return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed))
        return
      for (const it of parsed) {
        const itemId = it?.itemId ? String(it.itemId) : ''
        if (itemId !== 'Fence_Center' && itemId !== 'Fence_Corner')
          continue
        const x = Math.floor(Number(it.x))
        const y = Math.floor(Number(it.y))
        const z = Math.floor(Number(it.z))
        const rot = Math.floor(Number(it.rot)) % 4
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
          continue
        const key = this._key(x, y, z)
        if (this._placements.has(key))
          continue
        const node = this._spawnFenceNode(itemId, x, y, z, rot)
        if (!node)
          continue
        node.userData.placementKey = key
        this.world?.chunkManager?.addBlockWorld?.(x, y, z, blocks.invisibleSolid.id)
        this._placements.set(key, { itemId, x, y, z, rot, node })
      }
    }
    catch {
    }
  }

  _save() {
    try {
      const list = []
      for (const rec of this._placements.values()) {
        list.push({ itemId: rec.itemId, x: rec.x, y: rec.y, z: rec.z, rot: rec.rot })
      }
      window.localStorage?.setItem?.('mmmc:fence_build_v1', JSON.stringify(list))
    }
    catch {
    }
  }
}
