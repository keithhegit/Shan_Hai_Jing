# World 资源加载列表（Models）

## 加载入口与可用数据结构

- 资源清单：[`src/js/sources.js`](file:///d:/Code/3rd_MC/src/js/sources.js)
- 加载器：[`Resources`](file:///d:/Code/3rd_MC/src/js/utils/resources.js)
  - 加载后可通过 `experience.resources.items[resourceKey]` 访问
  - `resourceKey` 等于 `sources.js` 里每个条目的 `name`

## World 内使用到的模型 Key（按功能）

| resourceKey | type | path | 主要使用位置 |
|---|---:|---|---|
| playerModel | gltfModel | models/character/character04.glb | [`Player`](file:///d:/Code/3rd_MC/src/js/world/player/player.js#L16-L121) |
| chest_closed | gltfModel | models/Environment/Chest_Closed.gltf | [`World._initInteractables`](file:///d:/Code/3rd_MC/src/js/world/world.js#L889-L965)、[`World._initDungeonInteractablesV2`](file:///d:/Code/3rd_MC/src/js/world/world.js#L792-L845) |
| enemy_demon | gltfModel | models/Enemies/Demon.gltf | [`HumanoidEnemy`](file:///d:/Code/3rd_MC/src/js/world/enemies/humanoid-enemy.js)（type='demon' 或 resourceKey='enemy_demon'） |
| enemy_giant | gltfModel | models/Enemies/Giant.gltf | 同上 |
| enemy_goblin | gltfModel | models/Enemies/Goblin.gltf | 同上 |
| enemy_hedgehog | gltfModel | models/Enemies/Hedgehog.gltf | 同上 |
| enemy_skeleton | gltfModel | models/Enemies/Skeleton.gltf | 同上 |
| enemy_skeleton_armor | gltfModel | models/Enemies/Skeleton_Armor.gltf | 同上 |
| enemy_wizard | gltfModel | models/Enemies/Wizard.gltf | 同上 |
| enemy_yeti | gltfModel | models/Enemies/Yeti.gltf | 同上 |
| enemy_zombie | gltfModel | models/Enemies/Zombie.gltf | 同上 |
| animal_cat | gltfModel | models/Animals/Cat.gltf | [`World._initAnimals`](file:///d:/Code/3rd_MC/src/js/world/world.js#L1012-L1046)、[`HumanoidEnemy`](file:///d:/Code/3rd_MC/src/js/world/enemies/humanoid-enemy.js)（type='animal_cat'） |
| animal_chicken | gltfModel | models/Animals/Chicken.gltf | 同上 |
| animal_pig | gltfModel | models/Animals/Pig.gltf | 同上 |
| animal_sheep | gltfModel | models/Animals/Sheep.gltf | 同上 |
| animal_wolf | gltfModel | models/Animals/Wolf.gltf | 同上 |
| animal_horse | gltfModel | models/Animals/Horse.gltf | 同上 |
| animal_dog | gltfModel | models/Animals/Dog.gltf | 同上 |

## HumanoidEnemy 的资源 key 解析规则

入口：[`HumanoidEnemy`](file:///d:/Code/3rd_MC/src/js/world/enemies/humanoid-enemy.js)

- `type` 先当作 `resourceKey` 直接取 `resources.items[type]`
  - 适用于：`animal_pig`、`animal_cat` 等（type 本身就是完整 key）
- 若取不到，再尝试 `resources.items['enemy_' + type]`
  - 适用于：地牢里传的 `type='skeleton'`，会映射到 `enemy_skeleton`

## “敌人/NPC 看不见”这一类问题的关键变量

在当前实现里，敌人/动物的可见性主要取决于：

- `resources.items[resourceKey]` 是否存在（资源是否真的加载到了该 key）
- 该 GLTF 是否含 SkinnedMesh/骨骼动画，以及“克隆方式”是否正确
  - `gltf.scene.clone()` 对 SkinnedMesh 常见风险：骨骼/绑定引用不完整，结果可能是对象存在但渲染为空
  - `SkeletonUtils.clone(gltf.scene)` 会复制 skeleton/bone 关联关系，用于“同一个 GLTF 多实例”的场景（敌人群/动物群）

