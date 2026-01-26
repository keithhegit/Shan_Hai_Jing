import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import Experience from '../../experience.js'

export default class MerchantSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    this.experience = new Experience()
    this.resources = this.experience.resources
    this.group = new THREE.Group()
    this._ready = false
    this._mixer = null
    this._idle = null
    this._wave = null
    this._nextWaveAt = 0
    this._pos = new THREE.Vector3(36.5, 9.5, 37.6)
    this._rabbit = null

    const host = this.world?._hubNpcGroup || this.world?.scene || null
    if (host?.add)
      host.add(this.group)

    this._ensureInteractable()
  }

  destroy() {
    if (this.group?.parent)
      this.group.parent.remove(this.group)
    this._mixer = null
    this._idle = null
    this._wave = null
    this._rabbit = null
    this.group = null
    this.world = null
    this.context = null
  }

  update(dt, _t) {
    const world = this.world
    if (!world)
      return
    this.group.visible = world.currentWorld === 'hub'
    if (world.currentWorld !== 'hub')
      return

    this._ensureInteractable()

    if (!this._ready) {
      const gltf = this.resources?.items?.character_rabbit_gun || this.resources?.items?.character_rabbit
      if (!gltf?.scene)
        return

      let rabbit = null
      try {
        rabbit = cloneSkinned(gltf.scene)
      }
      catch {
        rabbit = gltf.scene.clone(true)
      }
      let meshCount = 0
      rabbit.traverse((o) => {
        if (o.isMesh) {
          meshCount++
          o.castShadow = true
          o.receiveShadow = true
          o.frustumCulled = false
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])
          for (const m of mats) {
            if (!m)
              continue
            if ('transparent' in m)
              m.transparent = false
            if ('opacity' in m)
              m.opacity = 1
            if ('alphaTest' in m)
              m.alphaTest = 0
            if ('side' in m)
              m.side = THREE.DoubleSide
            if ('emissive' in m && m.emissive)
              m.emissive.setRGB(0.2, 0.2, 0.2)
            if ('emissiveIntensity' in m)
              m.emissiveIntensity = Math.max(Number(m.emissiveIntensity) || 0, 0.2)
            m.needsUpdate = true
          }
        }
      })
      if (meshCount <= 0) {
        rabbit.add(new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1.2, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xFF88CC, roughness: 0.6, metalness: 0 }),
        ))
      }
      const groundY = world._getSurfaceY?.(this._pos.x, this._pos.z)
      rabbit.position.set(this._pos.x, (Number.isFinite(Number(groundY)) ? Number(groundY) : this._pos.y), this._pos.z)
      rabbit.rotation.y = Math.PI * 0.5
      rabbit.scale.setScalar(0.475)

      this.group.add(rabbit)
      this._rabbit = rabbit

      try {
        const box = new THREE.Box3().setFromObject(rabbit)
        const dy = Number.isFinite(Number(groundY)) ? (Number(groundY) - box.min.y) : 0
        if (Number.isFinite(dy))
          rabbit.position.y += dy + 0.02
      }
      catch {
      }

      const clips = Array.isArray(gltf.animations) ? gltf.animations : []
      if (clips.length > 0) {
        this._mixer = new THREE.AnimationMixer(rabbit)
        const idleClip = clips.find(c => c?.name === 'Idle') || clips[0] || null
        const waveClip = clips.find(c => c?.name === 'Wave') || null
        if (idleClip) {
          this._idle = this._mixer.clipAction(idleClip)
          this._idle.reset()
          this._idle.play()
        }
        if (waveClip) {
          this._wave = this._mixer.clipAction(waveClip)
          this._wave.clampWhenFinished = true
          this._wave.loop = THREE.LoopOnce
        }
      }

      this._nextWaveAt = (world.experience?.time?.elapsed ?? 0) + 4000
      this._ready = true
    }

    if (this._rabbit && world.player?.group?.position) {
      const p = world.player.group.position
      const cx = this._pos.x
      const cz = this._pos.z
      const dx = p.x - cx
      const dz = p.z - cz
      const r = 1.1
      const d2 = dx * dx + dz * dz
      if (d2 > 0.000001 && d2 < r * r) {
        const d = Math.sqrt(d2)
        const nx = dx / d
        const nz = dz / d
        p.x = cx + nx * r
        p.z = cz + nz * r
      }
    }

    if (this._mixer)
      this._mixer.update(Math.min(0.05, Number(dt) || 0))

    const now = world.experience?.time?.elapsed ?? 0
    if (this._wave && now >= this._nextWaveAt) {
      this._nextWaveAt = now + 4000
      if (this._idle)
        this._idle.fadeOut(0.12)
      this._wave.reset()
      this._wave.play()
      const dur = this._wave.getClip()?.duration
      const backAt = now + (Number.isFinite(Number(dur)) ? Number(dur) * 1000 : 900)
      setTimeout(() => {
        if (!this._mixer || !this._idle)
          return
        this._wave?.stop?.()
        this._idle.reset()
        this._idle.fadeIn(0.15)
        this._idle.play()
      }, Math.max(120, backAt - now))
    }
  }

  _ensureInteractable() {
    const world = this.world
    if (!world)
      return
    const list = Array.isArray(world.interactables) ? world.interactables : []
    const existing = list.find(i => i?.id === 'shop_merchant')
    const item = {
      id: 'shop_merchant',
      title: '旅行商人',
      description: '欢迎光临。这里可以买解锁地牢与补给物资。',
      hint: '按 E 打开商店',
      x: this._pos.x,
      z: this._pos.z,
      range: 2.7,
      read: false,
      spinSpeed: 0,
    }
    if (existing)
      Object.assign(existing, item)
    else
      world.interactables = [...list, item]
  }
}
