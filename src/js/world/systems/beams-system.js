import * as THREE from 'three'

export default class BeamsSystem {
  init(ctx) {
    const world = ctx?.world
    if (!world?.scene)
      return

    const material = this._createBeam({
      world,
      color: 0xFF_3B_3B,
      opacity: 0.9,
      radius: 0.09,
      decoratorKey: 'crystal2',
    })
    material.visible = false
    world._materialGunBeam = material
    world.scene.add(material)

    const capture = this._createBeam({
      world,
      color: 0x66FFAA,
      opacity: 0.85,
      radius: 0.07,
      decoratorKey: 'heart_ui',
    })
    capture.visible = false
    world._captureBeam = capture
    world.scene.add(capture)
  }

  update() {
  }

  destroy(ctx) {
    const world = ctx?.world
    if (!world)
      return
    if (world._materialGunBeam) {
      world._materialGunBeam.removeFromParent?.()
      world._materialGunBeam = null
    }
    if (world._captureBeam) {
      world._captureBeam.removeFromParent?.()
      world._captureBeam = null
    }
  }

  setBeamVisible(world, beamId, visible) {
    const beam = beamId === 'capture' ? world?._captureBeam : world?._materialGunBeam
    if (beam)
      beam.visible = !!visible
  }

  updateBeam(world, beamId, start, end) {
    const beam = beamId === 'capture' ? world?._captureBeam : world?._materialGunBeam
    if (!beam || !start || !end)
      return

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z
    const len = Math.sqrt(Math.max(0.000001, dx * dx + dy * dy + dz * dz))

    const mid = new THREE.Vector3(
      (start.x + end.x) * 0.5,
      (start.y + end.y) * 0.5,
      (start.z + end.z) * 0.5,
    )

    const dir = new THREE.Vector3(dx, dy, dz).multiplyScalar(1 / len)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

    beam.position.copy(mid)
    beam.quaternion.copy(q)
    const tube = beam.userData?.tube
    if (tube)
      tube.scale.set(1, len, 1)
    const deco = beam.userData?.decorator
    if (deco) {
      deco.position.set(0, 0, 0)
      deco.rotation.set(0, 0, 0)
    }
  }

  _createBeam({ world, color, opacity, radius, decoratorKey }) {
    const group = new THREE.Group()
    group.frustumCulled = false
    group.userData.decoratorKey = decoratorKey

    const tubeGeo = new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true)
    const tubeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const tube = new THREE.Mesh(tubeGeo, tubeMat)
    tube.frustumCulled = false
    group.add(tube)
    group.userData.tube = tube

    const res = world?.resources?.items?.[decoratorKey]
    let deco = null
    if (res?.scene) {
      deco = res.scene.clone(true)
      deco.scale.setScalar(0.22)
    }
    else {
      deco = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.18, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity + 0.05), depthWrite: false }),
      )
    }
    deco.frustumCulled = false
    group.add(deco)
    group.userData.decorator = deco

    return group
  }
}
