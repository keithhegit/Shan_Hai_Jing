import * as THREE from 'three'

const _cache = new Map()

export function loadGltfCached(resources, keyOrUrl) {
  const k = String(keyOrUrl || '')
  if (!k)
    return Promise.resolve(null)

  const cached = _cache.get(k)
  if (cached)
    return cached

  const fromResources = resources?.items?.[k]
  if (fromResources) {
    const p = Promise.resolve(fromResources)
    _cache.set(k, p)
    return p
  }

  const url = k.endsWith('.gltf') || k.endsWith('.glb') || k.includes('/')
    ? k
    : null
  if (!url) {
    const p = Promise.resolve(null)
    _cache.set(k, p)
    return p
  }

  const loader = resources?.loaders?.gltfLoader
  if (!loader) {
    const p = Promise.resolve(null)
    _cache.set(k, p)
    return p
  }

  const p = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        gltf?.scene?.traverse?.((child) => {
          if (child?.isMesh) {
            child.frustumCulled = false
            child.castShadow = false
            child.receiveShadow = true
          }
        })
        resolve(gltf || null)
      },
      undefined,
      () => resolve(null),
    )
  })

  _cache.set(k, p)
  return p
}

export function disposeGltfCache() {
  for (const p of _cache.values()) {
    if (p && typeof p.then === 'function') {
      p.then((gltf) => {
        gltf?.scene?.traverse?.((child) => {
          if (child?.geometry)
            child.geometry.dispose()
          if (child?.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            for (const m of mats)
              m?.dispose?.()
          }
          if (child?.material instanceof THREE.Material)
            child.material.dispose?.()
        })
      })
    }
  }
  _cache.clear()
}
