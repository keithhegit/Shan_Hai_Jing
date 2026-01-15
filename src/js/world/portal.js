import * as THREE from 'three'
import fragmentShader from '../../shaders/portal/fragment.glsl'
import vertexShader from '../../shaders/portal/vertex.glsl'
import Experience from '../experience.js'

export default class Portal {
  constructor(position = { x: 0, y: 1, z: 0 }, colorStart = '#6e00ff', colorEnd = '#ff00aa') {
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.time = this.experience.time
    this.debug = this.experience.debug

    this.position = new THREE.Vector3(position.x, position.y, position.z)
    this.colorStart = new THREE.Color(colorStart)
    this.colorEnd = new THREE.Color(colorEnd)

    this.init()
  }

  init() {
    // 门框 (黑曜石)
    this.frameGeometry = new THREE.BoxGeometry(2.5, 3.5, 0.4)
    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1A1A1A,
      roughness: 0.2,
      metalness: 0.8,
    })
    this.frame = new THREE.Mesh(this.frameGeometry, this.frameMaterial)
    this.frame.position.copy(this.position)
    this.frame.castShadow = true
    this.scene.add(this.frame)

    // 传送门入口 (Shader)
    this.portalGeometry = new THREE.PlaneGeometry(1.8, 2.8)
    this.portalMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColorStart: { value: this.colorStart },
        uColorEnd: { value: this.colorEnd },
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending, // 发光叠加
    })

    this.portalMesh = new THREE.Mesh(this.portalGeometry, this.portalMaterial)
    // 稍微前移一点防止 z-fighting
    this.portalMesh.position.copy(this.position)
    this.portalMesh.position.z += 0.01
    this.scene.add(this.portalMesh)

    // 点光源 (营造氛围)
    this.light = new THREE.PointLight(this.colorStart, 5, 5)
    this.light.position.copy(this.position)
    this.light.position.z += 1
    this.scene.add(this.light)
  }

  update() {
    // 更新 Shader 时间
    this.portalMaterial.uniforms.uTime.value = this.time.elapsed * 0.001
  }

  destroy() {
    this.scene.remove(this.frame)
    this.scene.remove(this.portalMesh)
    this.scene.remove(this.light)

    this.frameGeometry.dispose()
    this.frameMaterial.dispose()
    this.portalGeometry.dispose()
    this.portalMaterial.dispose()
  }
}
