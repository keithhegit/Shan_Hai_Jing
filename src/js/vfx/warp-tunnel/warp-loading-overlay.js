import WarpTunnelController from './warp-tunnel-controller.js'

class WarpLoadingOverlay {
  constructor() {
    this._root = null
    this._canvas = null
    this._label = null
    this._white = null
    this._styleTag = null
    this._controller = new WarpTunnelController()
    this._visible = false
    this._progress = 0
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

    const root = document.createElement('div')
    root.id = 'warp-overlay'
    root.setAttribute('aria-hidden', 'true')
    root.style.display = 'none'

    const canvas = document.createElement('canvas')
    canvas.id = 'warp-canvas'
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    const white = document.createElement('div')
    white.id = 'warp-whiteout'

    const hud = document.createElement('div')
    hud.id = 'warp-hud'

    const pill = document.createElement('div')
    pill.id = 'warp-pill'
    const label = document.createElement('div')
    label.id = 'warp-pill-label'
    label.textContent = 'Portal Initiating'
    pill.appendChild(label)
    hud.appendChild(pill)

    root.appendChild(canvas)
    root.appendChild(white)
    root.appendChild(hud)
    document.body.appendChild(root)

    const styleTag = document.createElement('style')
    styleTag.id = 'warp-overlay-style'
    styleTag.textContent = `
#warp-overlay{position:fixed;inset:0;z-index:999999;background:#000;pointer-events:none;overflow:hidden}
#warp-whiteout{position:fixed;inset:0;background:#fff;opacity:0;transition:opacity 90ms linear;mix-blend-mode:screen}
#warp-hud{position:absolute;left:50%;bottom:48px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:12px}
#warp-pill{padding:18px 46px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);box-shadow:0 20px 70px rgba(0,0,0,0.75);backdrop-filter:blur(18px);opacity:1;transform:scale(1);transition:opacity 700ms ease,transform 700ms ease}
#warp-pill-label{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:11px;letter-spacing:0.55em;text-transform:uppercase;font-weight:800;color:rgba(255,255,255,0.92)}
    `
    document.head.appendChild(styleTag)

    this._root = root
    this._canvas = canvas
    this._label = label
    this._white = white
    this._styleTag = styleTag

    this._controller.mount(canvas)
    this._resizeHandler = () => this._controller.resize(window.innerWidth, window.innerHeight)
    window.addEventListener('resize', this._resizeHandler)
  }

  show({ text = 'Portal Initiating' } = {}) {
    this.ensureMounted()
    this._label.textContent = text
    this._visible = true
    this._readyToReveal = false
    this._fadeOutAt = null
    this._progress = 0
    this._engaged = false
    this._hyperdriveStartAt = null

    this._root.style.display = 'block'
    this._root.style.opacity = '1'
    this._white.style.opacity = '0'
    this._controller.setSpeedMultiplier(0.2)
    this._controller.start()
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
    this._readyToReveal = false
    this._fadeOutAt = null
    this._root.style.display = 'none'
    this._white.style.opacity = '0'
    this._controller.stop()
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

export default overlay
