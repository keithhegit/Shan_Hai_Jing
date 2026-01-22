export default class SystemManager {
  constructor(context) {
    this.context = context || {}
    this.systems = []
  }

  setContext(context) {
    this.context = context || {}
  }

  register(system) {
    if (!system)
      return
    this.systems.push(system)
    system.init?.(this.context)
  }

  update(dt, t) {
    for (const system of this.systems)
      system.update?.(dt, t, this.context)
  }

  destroy() {
    for (const system of this.systems)
      system.destroy?.(this.context)
    this.systems.length = 0
  }
}
