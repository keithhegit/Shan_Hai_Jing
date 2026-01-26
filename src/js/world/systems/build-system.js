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
    this.scene.add(this._preview)

    this._raycaster = new BlockRaycaster({
      chunkManager: this.world?.chunkManager,
      maxDistance: 10,
      useMouse: false,
      enabled: false,
    })

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

    this._raycaster = null
    this.world = null
    this.context = null
  }

  activate(itemId) {
    this.active = true
    this.itemId = String(itemId)
    this.mode = 'add'
    this.rotationIndex = 0
    this._raycaster.params.enabled = true
    emitter.emit('build:active', true)
    this._syncHud()
  }

  deactivate() {
    this.active = false
    this.itemId = null
    this._pending = null
    if (this._preview)
      this._preview.visible = false
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
      return
    }

    if (!this.active) {
      this._preview.visible = false
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
      this._pending = { x: tx, y: py, z: tz, itemId: this.itemId }
      return
    }

    const hit = this._raycaster?.current || null
    if (!hit?.worldBlock || hit.blockId !== blocks.woodPlanks.id)
      return this._setPreview(false)
    this._preview.position.set(hit.worldBlock.x, hit.worldBlock.y, hit.worldBlock.z)
    this._preview.visible = true
    this._pending = { x: hit.worldBlock.x, y: hit.worldBlock.y, z: hit.worldBlock.z, remove: true }
  }

  handleMouseDown(event) {
    if (!this.active || !event || event.button !== 0)
      return false
    if (this.mode === 'add')
      return this._placeBlock()
    return this._removeBlock()
  }

  _placeBlock() {
    const world = this.world
    const p = this._pending
    if (!world || !p || !p.itemId)
      return false
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
    const placed = world.chunkManager?.addBlockWorld?.(p.x, p.y, p.z, blocks.woodPlanks.id)
    if (!placed) {
      world.inventorySystem?.addItem?.('backpack', p.itemId, 1)
      emitter.emit('dungeon:toast', { text: '放置失败：该位置不可放置' })
      return true
    }
    emitter.emit('dungeon:toast', { text: '已放置' })
    return true
  }

  _removeBlock() {
    const world = this.world
    const p = this._pending
    if (!world || !p?.remove)
      return false
    const ok = world.chunkManager?.removeBlockWorld?.(p.x, p.y, p.z)
    if (!ok)
      return true
    const itemId = this.itemId || 'Fence_Center'
    const canAdd = world.inventorySystem?._canAddToBackpack?.(itemId, 1) ?? true
    if (canAdd) {
      world.inventorySystem?.addItem?.('backpack', itemId, 1)
    }
    else {
      const pos = world.player?.getPosition?.()
      world._spawnHubDrop?.(itemId, 1, pos?.x ?? 0, pos?.z ?? 0)
    }
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
      hint: 'T 切换建造/拆卸 · 鼠标左键执行',
    })
  }
}
