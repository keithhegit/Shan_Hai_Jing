import emitter from '../../utils/event-bus.js'

export default class PortalSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.portalSystem = this

    this._onPortalSelectClose = () => {
      this.handlePortalSelectClose()
    }

    this._onPortalSelect = (payload) => {
      this.handlePortalSelect(payload)
    }

    emitter.on('portal:select_close', this._onPortalSelectClose)
    emitter.on('portal:select', this._onPortalSelect)
  }

  destroy() {
    if (this._onPortalSelect)
      emitter.off('portal:select', this._onPortalSelect)
    if (this._onPortalSelectClose)
      emitter.off('portal:select_close', this._onPortalSelectClose)
    this._onPortalSelect = null
    this._onPortalSelectClose = null

    if (this.world?.portalSystem === this)
      this.world.portalSystem = null
    this.world = null
    this.context = null
  }

  update() {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return
    this.updatePortals()
  }

  updatePortals() {
    const world = this.world
    if (!world?.player || !world.portals || world.portals.length === 0)
      return
    if (world._activeInteractableId !== null) {
      if (world._activePortalId !== null) {
        world._activePortalId = null
        world._activePortal = null
        emitter.emit('portal:prompt_clear')
      }
      return
    }
    if (world.currentWorld !== 'hub')
      return

    const pos = world.player.getPosition()

    let best = null
    let bestD2 = Infinity
    for (const portal of world.portals) {
      const dx = pos.x - portal.anchor.x
      const dz = pos.z - portal.anchor.z
      const d2 = dx * dx + dz * dz
      if (d2 < bestD2) {
        bestD2 = d2
        best = portal
      }
    }

    const activationD2 = 3.0 * 3.0
    const shouldActivate = best && bestD2 <= activationD2

    if (shouldActivate) {
      if (world._activePortalId !== best.id) {
        world._activePortalId = best.id
        world._activePortal = best
        emitter.emit('portal:prompt', { title: best.name, hint: '按 E 选择地牢' })
      }
    }
    else if (world._activePortalId !== null) {
      world._activePortalId = null
      world._activePortal = null
      emitter.emit('portal:prompt_clear')
    }

    for (const portal of world.portals) {
      const saved = world._portalDungeonProgress?.[portal.id]
      if (portal._completeRing)
        portal._completeRing.visible = !!saved?.completed
      if (portal._mesh)
        portal._mesh.rotation.y += 0.01
    }
  }

  openDungeonSelect() {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return
    if (world.isPaused)
      return

    world.isPaused = true
    world._emitDungeonState()
    world.experience.pointerLock?.exitLock?.()
    emitter.emit('portal:prompt_clear')
    emitter.emit('interactable:prompt_clear')

    const options = (world._dungeonPortals || []).map((p) => {
      const saved = world._portalDungeonProgress?.[p.id] || {}
      const locked = (p.id === 'mine' && !world._portalUnlocks?.mine) || (p.id === 'hellfire' && !world._portalUnlocks?.hellfire)
      return {
        id: p.id,
        name: p.name,
        completed: !!saved.completed,
        read: saved.read ?? 0,
        total: saved.total ?? 0,
        locked,
        lockReason: locked ? '需要购买解锁' : '',
      }
    })

    emitter.emit('portal:select_open', { title: '选择地牢入口', options })
  }

  handlePortalSelectClose() {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return
    if (world.isPaused) {
      world.isPaused = false
      world._emitDungeonState()
      world.experience.pointerLock?.requestLock?.()
    }
  }

  handlePortalSelect(payload) {
    const world = this.world
    if (!world || world.currentWorld !== 'hub')
      return
    const id = payload?.id
    if (!id)
      return
    const locked = (id === 'mine' && !world._portalUnlocks?.mine) || (id === 'hellfire' && !world._portalUnlocks?.hellfire)
    if (locked) {
      emitter.emit('dungeon:toast', { text: '该地牢需要先在旅行商人处购买解锁' })
      return
    }
    const portal = (world._dungeonPortals || []).find(p => p?.id === id)
    if (!portal)
      return
    world._activatePortal(portal)
  }
}
