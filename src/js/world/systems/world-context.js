export default function createWorldContext(world) {
  return {
    world,
    experience: world?.experience || null,
    scene: world?.scene || null,
    resources: world?.resources || null,
  }
}
