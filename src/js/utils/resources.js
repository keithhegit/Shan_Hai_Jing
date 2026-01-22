import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import Experience from '../experience.js'
import warpOverlay from '../vfx/warp-tunnel/warp-loading-overlay.js'
import emitter from './event-bus.js'

export default class Resources {
  constructor(sources, options = {}) {
    this.experience = new Experience()
    this.renderer = this.experience.renderer
    this.sources = sources

    this.items = {}
    this.toLoad = this.sources.length
    this.loaded = 0

    // Loading screen elements
    this.loadingScreen = document.getElementById('loading-screen')
    this.loadingBar = document.getElementById('loading-bar')
    this.loadingPercentage = document.getElementById('loading-percentage')
    this._warpOverlayShown = false

    this.options = {
      dracoDecoderPath: 'https://www.gstatic.com/draco/v1/decoders/',
      ktx2TranscoderPath: 'https://unpkg.com/three/examples/jsm/libs/basis/',
      ...options,
    }

    this.setLoaders()
    this.startLoading()
  }

  setLoaders() {
    const missingColorMapPng = 'textures/background/background.png'
    this.loadingManager = new THREE.LoadingManager()
    this.loadingManager.setURLModifier((url) => {
      const raw = String(url ?? '')
      const normalized = raw.replaceAll('\\', '/').toLowerCase()
      if (normalized.endsWith('textures/colormap.png'))
        return missingColorMapPng
      return url
    })

    this.loaders = {}
    this.loaders.gltfLoader = new GLTFLoader(this.loadingManager)
    this.loaders.textureLoader = new THREE.TextureLoader(this.loadingManager)
    this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader(this.loadingManager)
    this.loaders.fontLoader = new FontLoader()
    this.loaders.fbxLoader = new FBXLoader()
    this.loaders.audioLoader = new THREE.AudioLoader()
    this.loaders.objLoader = new OBJLoader()
    this.loaders.hdrTextureLoader = new RGBELoader()
    this.loaders.svgLoader = new SVGLoader()
    this.loaders.exrLoader = new EXRLoader()
    this.loaders.ktx2Loader = new KTX2Loader()

    // Set up DRACOLoader
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(this.options.dracoDecoderPath)
    this.loaders.gltfLoader.setDRACOLoader(dracoLoader)

    // Set up KTX2Loader
    this.loaders.ktx2Loader
      .setTranscoderPath(this.options.ktx2TranscoderPath)
      .detectSupport(this.renderer.instance)
    this.loaders.gltfLoader.setKTX2Loader(this.loaders.ktx2Loader)
  }

  startLoading() {
    if (!this._warpOverlayShown) {
      this._warpOverlayShown = true
      warpOverlay.show({ text: 'Portal Initiating' })
      if (this.loadingBar)
        this.loadingBar.style.display = 'none'
      if (this.loadingPercentage)
        this.loadingPercentage.style.display = 'none'
    }

    for (const source of this.sources) {
      const onLoad = file => this.sourceLoaded(source, file)
      const onError = () => {
        console.warn(`Failed to load resource: ${source.name} (${source.type}) from ${source.path}`)
        this.sourceLoaded(source, null)
      }
      switch (source.type) {
        case 'gltfModel': {
          this.loaders.gltfLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'texture': {
          this.loaders.textureLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'cubeTexture': {
          this.loaders.cubeTextureLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'font': {
          this.loaders.fontLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'fbxModel': {
          this.loaders.fbxLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'audio': {
          this.loaders.audioLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'objModel': {
          this.loaders.objLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'hdrTexture': {
          this.loaders.hdrTextureLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'svg': {
          this.loaders.svgLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'exrTexture': {
          this.loaders.exrLoader.load(source.path, onLoad, undefined, onError)
          break
        }
        case 'video': {
          this.loadVideoTexture(source.path).then((file) => {
            this.sourceLoaded(source, file)
          })
          break
        }
        case 'ktx2Texture': {
          this.loaders.ktx2Loader.load(source.path, onLoad, undefined, onError)
          break
        }
        // No default
      }
    }
  }

  sourceLoaded(source, file) {
    this.items[source.name] = file
    this.loaded++

    // Update loading progress
    const progress = this.loadProgress

    warpOverlay.setProgress(progress)

    if (this.loaded === this.toLoad) {
      emitter.emit('core:ready')
      warpOverlay.markReadyToReveal()
      if (this.loadingScreen) {
        this.loadingScreen.style.transition = 'opacity 0.25s ease-out'
        this.loadingScreen.style.opacity = '0'
        setTimeout(() => {
          this.loadingScreen.style.display = 'none'
        }, 260)
      }
    }
  }

  loadVideoTexture(path) {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.src = path
      video.loop = true
      video.muted = true
      video.playsInline = true

      video.addEventListener('loadeddata', () => {
        const texture = new THREE.VideoTexture(video)
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.format = THREE.RGBFormat

        resolve(texture)
      })

      video.load()
    })
  }

  get loadProgress() {
    return this.loaded / this.toLoad
  }

  get isLoaded() {
    return this.loaded === this.toLoad
  }

  destroy() {
    // Dispose all loaded textures
    for (const item of Object.values(this.items)) {
      if (item?.dispose) {
        item.dispose()
      }
      // For GLTF models, traverse and dispose
      if (item?.scene?.traverse) {
        item.scene.traverse((child) => {
          if (child.geometry)
            child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose())
            }
            else {
              child.material.dispose()
            }
          }
        })
      }
    }

    // Clear items
    this.items = {}
    this.loaded = 0
  }
}
