import WarpTunnelController from './warp-tunnel-controller.js'

class WarpLoadingOverlay {
  constructor() {
    this._root = null
    this._canvas = null
    this._label = null
    this._white = null
    this._styleTag = null
    this._bg = null
    this._dim = null
    this._progressWrap = null
    this._progressBar = null
    this._progressText = null
    this._controller = new WarpTunnelController()
    this._visible = false
    this._progress = 0
    this._backdropMode = false
    this._backdropStartAt = null
    this._backdropReady = false
    this._hyperdriveStartAt = null
    this._hyperdriveDurationMs = 6000
    this._readyToReveal = false
    this._fadeOutAt = null
    this._resizeHandler = null
    this._engaged = false
  }

  ensureMounted() {
    if (this._root)
      return

    const root = document.getElementById('warp-overlay') || document.createElement('div')
    if (!root.id)
      root.id = 'warp-overlay'
    root.setAttribute('aria-hidden', 'true')

    const bg = document.getElementById('warp-bg') || document.createElement('div')
    if (!bg.id)
      bg.id = 'warp-bg'
    const dim = document.getElementById('warp-dim') || document.createElement('div')
    if (!dim.id)
      dim.id = 'warp-dim'
    const canvas = document.getElementById('warp-canvas') || document.createElement('canvas')
    if (!canvas.id)
      canvas.id = 'warp-canvas'
    const white = document.getElementById('warp-whiteout') || document.createElement('div')
    if (!white.id)
      white.id = 'warp-whiteout'
    const hud = document.getElementById('warp-hud') || document.createElement('div')
    if (!hud.id)
      hud.id = 'warp-hud'
    const pill = document.getElementById('warp-pill') || document.createElement('div')
    if (!pill.id)
      pill.id = 'warp-pill'
    const label = document.getElementById('warp-pill-label') || document.createElement('div')
    if (!label.id)
      label.id = 'warp-pill-label'
    if (!label.textContent)
      label.textContent = 'Portal Initiating'
    if (!pill.contains(label))
      pill.appendChild(label)
    if (!hud.contains(pill))
      hud.appendChild(pill)

    const progressWrap = document.getElementById('warp-progress') || document.createElement('div')
    if (!progressWrap.id)
      progressWrap.id = 'warp-progress'
    const progressTrack = document.getElementById('warp-progress-track') || document.createElement('div')
    if (!progressTrack.id)
      progressTrack.id = 'warp-progress-track'
    const progressBar = document.getElementById('warp-progress-bar') || document.createElement('div')
    if (!progressBar.id)
      progressBar.id = 'warp-progress-bar'
    if (!progressTrack.contains(progressBar))
      progressTrack.appendChild(progressBar)
    const progressText = document.getElementById('warp-progress-text') || document.createElement('div')
    if (!progressText.id)
      progressText.id = 'warp-progress-text'
    if (!progressText.textContent)
      progressText.textContent = '0%'
    if (!progressWrap.contains(progressTrack))
      progressWrap.appendChild(progressTrack)
    if (!progressWrap.contains(progressText))
      progressWrap.appendChild(progressText)
    if (!hud.contains(progressWrap))
      hud.appendChild(progressWrap)

    if (!root.contains(bg))
      root.appendChild(bg)
    if (!root.contains(dim))
      root.appendChild(dim)
    if (!root.contains(canvas))
      root.appendChild(canvas)
    if (!root.contains(white))
      root.appendChild(white)
    if (!root.contains(hud))
      root.appendChild(hud)
    if (!document.body.contains(root))
      document.body.appendChild(root)

    const styleTag = document.getElementById('warp-overlay-style')

    this._root = root
    this._bg = bg
    this._dim = dim
    this._canvas = canvas
    this._label = label
    this._white = white
    this._progressWrap = progressWrap
    this._progressBar = progressBar
    this._progressText = progressText
    this._styleTag = styleTag

    this._controller.mount(canvas)
    this._resizeHandler = () => this._controller.resize(window.innerWidth, window.innerHeight)
    window.addEventListener('resize', this._resizeHandler)
  }

  show({ text = 'Portal Initiating' } = {}) {
    this.ensureMounted()
    this._label.textContent = text
    this._visible = true
    this._backdropMode = false
    this._backdropStartAt = null
    this._backdropReady = false
    this._readyToReveal = false
    this._fadeOutAt = null
    this._progress = 0
    this._engaged = false
    this._hyperdriveStartAt = null

    this._root.style.display = 'block'
    this._root.style.opacity = '1'
    this._white.style.opacity = '0'
    if (this._bg)
      this._bg.style.opacity = '1'
    if (this._dim)
      this._dim.style.opacity = '1'
    if (this._canvas)
      this._canvas.style.display = 'block'
    if (this._progressWrap)
      this._progressWrap.style.display = 'none'
    this._controller.setSpeedMultiplier(0.2)
    this._controller.start()
  }

  showBackdropProgress({ text = 'Portal Initiating' } = {}) {
    this.ensureMounted()
    this._label.textContent = text
    this._visible = true
    this._backdropMode = true
    this._backdropStartAt = performance.now()
    this._backdropReady = false
    this._readyToReveal = false
    this._fadeOutAt = null
    this._progress = 0
    this._engaged = false
    this._hyperdriveStartAt = null

    this._root.style.display = 'block'
    this._root.style.opacity = '1'
    this._white.style.opacity = '0'
    if (this._bg)
      this._bg.style.opacity = '1'
    if (this._dim)
      this._dim.style.opacity = '1'
    if (this._canvas)
      this._canvas.style.display = 'none'
    if (this._progressWrap)
      this._progressWrap.style.display = 'flex'
    this._setProgressUi(0)
    this._controller.stop()
  }

  markBackdropReady() {
    this._backdropReady = true
  }

  startTunnel({ text = 'Portal Initiating', durationMs = 6000 } = {}) {
    this.ensureMounted()
    this._label.textContent = text
    this._visible = true
    this._backdropMode = false
    this._backdropStartAt = null
    this._backdropReady = false
    this._fadeOutAt = null
    this._progress = 1

    this._root.style.display = 'block'
    this._root.style.opacity = '1'
    this._white.style.opacity = '0'
    if (this._bg)
      this._bg.style.opacity = '1'
    if (this._dim)
      this._dim.style.opacity = '1'
    if (this._canvas)
      this._canvas.style.display = 'block'
    if (this._progressWrap)
      this._progressWrap.style.display = 'none'

    this._controller.setSpeedMultiplier(0.2)
    this._controller.start()
    this._engaged = true
    this._hyperdriveDurationMs = Math.min(6000, Math.max(600, Math.floor(Number(durationMs) || 6000)))
    this._hyperdriveStartAt = performance.now()
    this._readyToReveal = true
  }

  setProgress(progress0to1) {
    const p = Number(progress0to1)
    if (!Number.isFinite(p))
      return
    this._progress = Math.min(1, Math.max(0, p))
    if (this._engaged)
      return
    if (this._progress >= 0.9) {
      this.engageHyperdrive()
      return
    }
    const t = this._progress / 0.9
    const speed = 0.2 + (1.0 - 0.2) * t
    this._controller.setSpeedMultiplier(speed)
  }

  engageHyperdrive({ durationMs = 6000 } = {}) {
    if (!this._visible)
      this.show()
    this._engaged = true
    this._hyperdriveDurationMs = Math.min(6000, Math.max(600, Math.floor(Number(durationMs) || 6000)))
    this._hyperdriveStartAt = performance.now()
  }

  whiteoutSoon() {
    if (!this._visible)
      this.show()
    if (!this._engaged)
      this.engageHyperdrive({ durationMs: 6000 })
    const now = performance.now()
    const remaining = 260
    this._hyperdriveStartAt = now - (this._hyperdriveDurationMs - remaining)
  }

  markReadyToReveal() {
    this._readyToReveal = true
    if (!this._engaged)
      this.completeSoon()
  }

  completeSoon() {
    if (!this._visible)
      this.show()
    if (!this._engaged)
      this.engageHyperdrive({ durationMs: 6000 })
    const now = performance.now()
    const remaining = 260
    this._hyperdriveStartAt = now - (this._hyperdriveDurationMs - remaining)
    this._readyToReveal = true
  }

  tick() {
    if (!this._visible)
      return

    if (this._backdropMode) {
      const now = performance.now()
      const startAt = this._backdropStartAt ?? now
      const elapsed = Math.max(0, now - startAt)
      const target = this._backdropReady ? 1 : 0.92
      const rate = this._backdropReady ? 0.28 : 0.00125
      const eased = this._backdropReady ? 0 : (1 - Math.exp(-elapsed * rate))
      const base = this._backdropReady ? this._progress : target * eased
      const next = this._backdropReady ? (this._progress + (1 - this._progress) * 0.25) : base
      this._setProgressUi(next)
      return
    }

    if (this._fadeOutAt != null) {
      const now = performance.now()
      if (now >= this._fadeOutAt) {
        this.hideImmediately()
      }
      return
    }

    if (this._engaged && this._hyperdriveStartAt != null) {
      const now = performance.now()
      const elapsed = now - this._hyperdriveStartAt
      const t = Math.min(1, Math.max(0, elapsed / this._hyperdriveDurationMs))
      const speed = 0.2 + (2.0 - 0.2) * t
      this._controller.setSpeedMultiplier(speed)

      const flash = speed < 1.0 ? 0 : Math.min(1, (speed - 1.0) / 1.0)
      this._white.style.opacity = String(flash)

      if (t >= 1) {
        this._white.style.opacity = '1'
        if (this._readyToReveal) {
          this._fadeOutAt = performance.now() + 120
        }
      }
    }
  }

  hideImmediately() {
    if (!this._root)
      return
    this._visible = false
    this._backdropMode = false
    this._backdropStartAt = null
    this._backdropReady = false
    this._readyToReveal = false
    this._fadeOutAt = null
    this._root.style.display = 'none'
    this._white.style.opacity = '0'
    if (this._bg)
      this._bg.style.opacity = '0'
    if (this._dim)
      this._dim.style.opacity = '0'
    if (this._canvas)
      this._canvas.style.display = 'none'
    if (this._progressWrap)
      this._progressWrap.style.display = 'none'
    this._controller.stop()
  }

  _setProgressUi(progress0to1) {
    const p = Math.min(1, Math.max(0, Number(progress0to1) || 0))
    this._progress = p
    if (this._progressBar)
      this._progressBar.style.width = `${Math.round(p * 1000) / 10}%`
    if (this._progressText)
      this._progressText.textContent = `${Math.round(p * 100)}%`
  }

  destroy() {
    this.hideImmediately()
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
      this._resizeHandler = null
    }
    this._controller.destroy()
    this._root?.remove?.()
    this._styleTag?.remove?.()
    this._root = null
    this._canvas = null
    this._label = null
    this._white = null
    this._styleTag = null
    this._progressWrap = null
    this._progressBar = null
    this._progressText = null
  }
}

const overlay = new WarpLoadingOverlay()

function startTickLoop() {
  const step = () => {
    overlay.tick()
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

startTickLoop()

if (typeof window !== 'undefined')
  window.WarpOverlay = overlay

export default overlay
