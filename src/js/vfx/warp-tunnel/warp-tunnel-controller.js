import * as THREE from 'three'
import {
  CAMERA_Z,
  COLORS,
  HIGH_SPEED_COLORS,
  INITIAL_SPEED,
  LINE_COUNT,
  TUNNEL_LENGTH,
  TUNNEL_RADIUS,
} from './warp-tunnel-constants.js'

export default class WarpTunnelController {
  constructor() {
    this._renderer = null
    this._scene = null
    this._camera = null
    this._geometry = null
    this._material = null
    this._linesMesh = null
    this._raf = 0
    this._velocityZ = null
    this._baseColors = null
    this._highColors = null
    this._speedMultiplier = 0.2
    this._mounted = false
  }

  mount(canvas) {
    if (this._mounted)
      return
    this._mounted = true

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x000000, 0.0015)

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000)
    camera.position.z = CAMERA_Z

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.ReinhardToneMapping
    renderer.toneMappingExposure = 1.5

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(LINE_COUNT * 2 * 3)
    const colors = new Float32Array(LINE_COUNT * 2 * 3)
    const baseColors = new Float32Array(LINE_COUNT * 2 * 3)
    const highColors = new Float32Array(LINE_COUNT * 2 * 3)
    const velocityZ = new Float32Array(LINE_COUNT)

    const rand = (min, max) => Math.random() * (max - min) + min

    for (let i = 0; i < LINE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const r = rand(TUNNEL_RADIUS * 0.1, TUNNEL_RADIUS * 1.5)
      const x = Math.cos(theta) * r * 2.5
      const y = Math.sin(theta) * r * 1.5
      const z = -Math.random() * TUNNEL_LENGTH
      const len = rand(20, 100)

      const pIdx = i * 6
      positions[pIdx] = x
      positions[pIdx + 1] = y
      positions[pIdx + 2] = z
      positions[pIdx + 3] = x
      positions[pIdx + 4] = y
      positions[pIdx + 5] = z + len

      const colorIdx = Math.floor(Math.random() * COLORS.length)
      const lowColor = COLORS[colorIdx]
      const highColor = HIGH_SPEED_COLORS[colorIdx]

      baseColors[pIdx] = lowColor.r
      baseColors[pIdx + 1] = lowColor.g
      baseColors[pIdx + 2] = lowColor.b
      baseColors[pIdx + 3] = lowColor.r
      baseColors[pIdx + 4] = lowColor.g
      baseColors[pIdx + 5] = lowColor.b

      highColors[pIdx] = highColor.r
      highColors[pIdx + 1] = highColor.g
      highColors[pIdx + 2] = highColor.b
      highColors[pIdx + 3] = highColor.r
      highColors[pIdx + 4] = highColor.g
      highColors[pIdx + 5] = highColor.b

      colors[pIdx] = lowColor.r
      colors[pIdx + 1] = lowColor.g
      colors[pIdx + 2] = lowColor.b
      colors[pIdx + 3] = lowColor.r
      colors[pIdx + 4] = lowColor.g
      colors[pIdx + 5] = lowColor.b

      velocityZ[i] = rand(0.8, 3.5)
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    })

    const linesMesh = new THREE.LineSegments(geometry, material)
    scene.add(linesMesh)

    this._renderer = renderer
    this._scene = scene
    this._camera = camera
    this._geometry = geometry
    this._material = material
    this._linesMesh = linesMesh
    this._velocityZ = velocityZ
    this._baseColors = baseColors
    this._highColors = highColors

    this.resize(window.innerWidth, window.innerHeight)
  }

  resize(width, height) {
    if (!this._renderer || !this._camera)
      return
    const w = Math.max(1, Math.floor(Number(width) || 1))
    const h = Math.max(1, Math.floor(Number(height) || 1))
    this._camera.aspect = w / h
    this._camera.updateProjectionMatrix()
    this._renderer.setSize(w, h, false)
  }

  setSpeedMultiplier(speedMultiplier) {
    const n = Number(speedMultiplier)
    if (!Number.isFinite(n))
      return
    this._speedMultiplier = Math.min(2.0, Math.max(0.2, n))
  }

  start() {
    if (this._raf)
      return
    const tick = () => {
      this._raf = requestAnimationFrame(tick)
      this._renderFrame()
    }
    this._raf = requestAnimationFrame(tick)
  }

  stop() {
    if (this._raf) {
      cancelAnimationFrame(this._raf)
      this._raf = 0
    }
  }

  destroy() {
    this.stop()
    this._geometry?.dispose?.()
    this._material?.dispose?.()
    this._renderer?.dispose?.()
    this._renderer = null
    this._scene = null
    this._camera = null
    this._geometry = null
    this._material = null
    this._linesMesh = null
    this._velocityZ = null
    this._baseColors = null
    this._highColors = null
    this._mounted = false
  }

  _renderFrame() {
    const renderer = this._renderer
    const scene = this._scene
    const camera = this._camera
    const geometry = this._geometry
    const linesMesh = this._linesMesh
    const velocityZ = this._velocityZ
    const baseColors = this._baseColors
    const highColors = this._highColors
    if (!renderer || !scene || !camera || !geometry || !linesMesh || !velocityZ || !baseColors || !highColors)
      return

    const time = performance.now() * 0.001
    const speedMultiplier = this._speedMultiplier
    const baseSpeed = INITIAL_SPEED * speedMultiplier
    const colorMix = THREE.MathUtils.clamp((speedMultiplier - 0.2) / 1.8, 0, 1)

    if (speedMultiplier > 1.2) {
      const intensity = (speedMultiplier - 1.2) * 1.2
      camera.position.x = (Math.sin(time * 30) + Math.sin(time * 17) * 0.5) * intensity
      camera.position.y = (Math.sin(time * 25) + Math.sin(time * 19) * 0.5) * intensity
    }
    else {
      camera.position.x *= 0.9
      camera.position.y *= 0.9
    }

    const posAttr = geometry.attributes.position
    const colAttr = geometry.attributes.color
    const posArr = posAttr.array
    const colArr = colAttr.array

    for (let i = 0; i < LINE_COUNT; i++) {
      const z1 = i * 6 + 2
      const z2 = i * 6 + 5
      const speed = baseSpeed * velocityZ[i]
      posArr[z1] += speed
      posArr[z2] += speed

      if (posArr[z1] > CAMERA_Z + 200) {
        const len = posArr[z2] - posArr[z1]
        const newZ = -TUNNEL_LENGTH
        posArr[z1] = newZ
        posArr[z2] = newZ + len
      }

      const cIdx = i * 6
      for (let j = 0; j < 6; j++)
        colArr[cIdx + j] = THREE.MathUtils.lerp(baseColors[cIdx + j], highColors[cIdx + j], colorMix)
    }

    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    linesMesh.rotation.z += 0.001 * speedMultiplier
    renderer.render(scene, camera)
  }
}
