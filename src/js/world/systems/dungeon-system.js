export default class DungeonSystem {
  init(ctx) {
    this.context = ctx || {}
    this.world = ctx?.world || null
    if (this.world)
      this.world.dungeonSystem = this
  }

  destroy() {
  }

  enterDungeon(portal) {
    return this.world?._enterDungeon?.(portal)
  }

  exitDungeon() {
    return this.world?._exitDungeon?.()
  }

  emitDungeonProgress() {
    return this.world?._emitDungeonProgress?.()
  }
}
