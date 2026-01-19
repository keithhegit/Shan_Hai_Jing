/**
 * 定义项目所需的静态资源列表。
 * Resources 类会根据 'type' 属性自动选择合适的加载器。
 *
 * 支持的资源类型 (type) 及其对应的加载器/方式:
 * - gltfModel:   GLTFLoader (支持 Draco 和 KTX2 压缩)
 * - texture:     TextureLoader (普通图像纹理, 如 jpg, png)
 * - cubeTexture: CubeTextureLoader (立方体贴图, 用于环境映射等)
 * - font:        FontLoader (加载字体文件, 通常是 json 格式)
 * - fbxModel:    FBXLoader (加载 FBX 模型)
 * - audio:       AudioLoader (加载音频文件)
 * - objModel:    OBJLoader (加载 OBJ 模型)
 * - hdrTexture:  RGBELoader (加载 HDR 环境贴图)
 * - svg:         SVGLoader (加载 SVG 文件作为纹理或数据)
 * - exrTexture:  EXRLoader (加载 EXR 高动态范围图像)
 * - video:       自定义加载逻辑，创建 VideoTexture (加载视频作为纹理)
 * - ktx2Texture: KTX2Loader (加载 KTX2 压缩纹理)
 */
export default [
  {
    name: 'environmentMapHDRTexture',
    type: 'hdrTexture',
    path: 'textures/environmentMap/HDRI_110.hdr',
  },
  {
    name: 'backgroundTexture',
    type: 'texture',
    path: 'textures/background/background.png',
  },
  {
    name: 'playerModel',
    type: 'gltfModel',
    path: 'models/character/Character_Male_1.gltf',
  },
  // ===== Enemies =====
  { name: 'enemy_demon', type: 'gltfModel', path: 'models/Enemies/Demon.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_giant', type: 'gltfModel', path: 'models/Enemies/Giant.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_goblin', type: 'gltfModel', path: 'models/Enemies/Goblin.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_hedgehog', type: 'gltfModel', path: 'models/Enemies/Hedgehog.gltf', animations: ['Attack', 'Death', 'Idle'] },
  { name: 'enemy_cactoro', type: 'gltfModel', path: 'models/Enemies/Cactoro.gltf' },
  { name: 'enemy_dino', type: 'gltfModel', path: 'models/Enemies/Dino.gltf' },
  { name: 'enemy_frog', type: 'gltfModel', path: 'models/Enemies/Frog.gltf' },
  { name: 'enemy_monkroose', type: 'gltfModel', path: 'models/Enemies/Monkroose.gltf' },
  { name: 'enemy_mushroomking', type: 'gltfModel', path: 'models/Enemies/MushroomKing.gltf' },
  { name: 'enemy_ninja', type: 'gltfModel', path: 'models/Enemies/Ninja.gltf' },
  { name: 'enemy_orc', type: 'gltfModel', path: 'models/Enemies/Orc.gltf' },
  { name: 'enemy_orc_skull', type: 'gltfModel', path: 'models/Enemies/Orc_Skull.gltf' },
  { name: 'enemy_skeleton', type: 'gltfModel', path: 'models/Enemies/Skeleton.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_skeleton_armor', type: 'gltfModel', path: 'models/Enemies/Skeleton_Armor.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_tribal', type: 'gltfModel', path: 'models/Enemies/Tribal.gltf' },
  { name: 'enemy_wizard', type: 'gltfModel', path: 'models/Enemies/Wizard.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_yeti', type: 'gltfModel', path: 'models/Enemies/Yeti.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  { name: 'enemy_yeti2', type: 'gltfModel', path: 'models/Enemies/Yeti2.gltf' },
  { name: 'enemy_zombie', type: 'gltfModel', path: 'models/Enemies/Zombie.gltf', animations: ['Attack', 'Death', 'HitRecieve', 'Idle', 'Jump', 'Run', 'Walk'] },
  // ===== Environment =====
  { name: 'chest_closed', type: 'gltfModel', path: 'models/Environment/Chest_Closed.gltf' },
  { name: 'chest_open', type: 'gltfModel', path: 'models/Environment/Chest_Open.gltf' },
  { name: 'key', type: 'gltfModel', path: 'models/Environment/Key.gltf' },
  { name: 'material_gun', type: 'gltfModel', path: 'models/Tools/heart.glb' },
  { name: 'heart_ui', type: 'gltfModel', path: 'models/Tools/heart.glb' },
  { name: 'canister', type: 'gltfModel', path: 'models/Environment/crystal3.glb' },
  { name: 'coin', type: 'gltfModel', path: 'models/Environment/coin.glb' },
  { name: 'crystal_big', type: 'gltfModel', path: 'models/Environment/Crystal_Big.gltf' },
  { name: 'crystal_small', type: 'gltfModel', path: 'models/Environment/Crystal_Small.gltf' },
  // ===== Animals =====
  { name: 'animal_cat', type: 'gltfModel', path: 'models/Animals/Cat.gltf' },
  { name: 'animal_chicken', type: 'gltfModel', path: 'models/Animals/Chicken.gltf' },
  { name: 'animal_pig', type: 'gltfModel', path: 'models/Animals/Pig.gltf' },
  { name: 'animal_sheep', type: 'gltfModel', path: 'models/Animals/Sheep.gltf' },
  { name: 'animal_wolf', type: 'gltfModel', path: 'models/Animals/Wolf.gltf' },
  { name: 'animal_horse', type: 'gltfModel', path: 'models/Animals/Horse.gltf' },
  { name: 'animal_dog', type: 'gltfModel', path: 'models/Animals/Dog.gltf' },
  // ===== Tools =====
  { name: 'Axe_Wood', type: 'gltfModel', path: 'models/Tools/Axe_Wood.gltf' },
  { name: 'Axe_Stone', type: 'gltfModel', path: 'models/Tools/Axe_Stone.gltf' },
  { name: 'Axe_Gold', type: 'gltfModel', path: 'models/Tools/Axe_Gold.gltf' },
  { name: 'Axe_Diamond', type: 'gltfModel', path: 'models/Tools/Axe_Diamond.gltf' },
  { name: 'Pickaxe_Wood', type: 'gltfModel', path: 'models/Tools/Pickaxe_Wood.gltf' },
  { name: 'Pickaxe_Stone', type: 'gltfModel', path: 'models/Tools/Pickaxe_Stone.gltf' },
  { name: 'Pickaxe_Gold', type: 'gltfModel', path: 'models/Tools/Pickaxe_Gold.gltf' },
  { name: 'Pickaxe_Diamond', type: 'gltfModel', path: 'models/Tools/Pickaxe_Diamond.gltf' },
  { name: 'Shovel_Wood', type: 'gltfModel', path: 'models/Tools/Shovel_Wood.gltf' },
  { name: 'Shovel_Stone', type: 'gltfModel', path: 'models/Tools/Shovel_Stone.gltf' },
  { name: 'Shovel_Gold', type: 'gltfModel', path: 'models/Tools/Shovel_Gold.gltf' },
  { name: 'Shovel_Diamond', type: 'gltfModel', path: 'models/Tools/Shovel_Diamond.gltf' },
  { name: 'Sword_Wood', type: 'gltfModel', path: 'models/Tools/Sword_Wood.gltf' },
  { name: 'Sword_Stone', type: 'gltfModel', path: 'models/Tools/Sword_Stone.gltf' },
  { name: 'Sword_Gold', type: 'gltfModel', path: 'models/Tools/Sword_Gold.gltf' },
  { name: 'Sword_Diamond', type: 'gltfModel', path: 'models/Tools/Sword_Diamond.gltf' },
  {
    name: 'grass_block_top_texture',
    type: 'texture',
    path: 'textures/blocks/grass_block_top.png',
  },
  {
    name: 'grass',
    type: 'texture',
    path: 'textures/blocks/grass.png',
  },
  {
    name: 'grass_block_side_texture',
    type: 'texture',
    path: 'textures/blocks/grass_block_side.png',
  },
  {
    name: 'coal_ore',
    type: 'texture',
    path: 'textures/blocks/coal_ore.png',
  },
  {
    name: 'dirt',
    type: 'texture',
    path: 'textures/blocks/dirt.png',
  },
  {
    name: 'stone',
    type: 'texture',
    path: 'textures/blocks/stone.png',
  },
  {
    name: 'iron_ore',
    type: 'texture',
    path: 'textures/blocks/iron_ore.png',
  },
  // ===== 沙子（体素方块）=====
  {
    name: 'sand',
    type: 'texture',
    path: 'textures/blocks/sand.png',
  },
  // ===== 红沙（体素方块）=====
  {
    name: 'red_sand',
    type: 'texture',
    path: 'textures/blocks/red_sand.png',
  },
  // ==== 陶瓦 黄色（体素方块）=====
  {
    name: 'terracotta_yellow',
    type: 'texture',
    path: 'textures/blocks/terracotta_yellow.png',
  },
  // ==== 陶瓦 红色（体素方块）=====
  {
    name: 'terracotta_red',
    type: 'texture',
    path: 'textures/blocks/terracotta_red.png',
  },
  // ===== 雪块（体素方块）=====
  {
    name: 'snow',
    type: 'texture',
    path: 'textures/blocks/snow.png',
  },
  // ===== 树（体素方块）=====
  {
    name: 'treeTrunk_TopTexture',
    type: 'texture',
    path: 'textures/blocks/tree_trunk_Top.png',
  },
  {
    name: 'treeTrunk_SideTexture',
    type: 'texture',
    path: 'textures/blocks/tree_trunk_Side.png',
  },
  {
    name: 'treeLeaves_Texture',
    type: 'texture',
    path: 'textures/blocks/azalea_leaves.png',
  },
  // ===== 白桦树（体素方块）=====
  {
    name: 'birchTrunk_TopTexture',
    type: 'texture',
    path: 'textures/blocks/birch_trunk_Top.png',
  },
  {
    name: 'birchTrunk_SideTexture',
    type: 'texture',
    path: 'textures/blocks/birch_trunk_Side.png',
  },
  {
    name: 'birchLeaves_Texture',
    type: 'texture',
    path: 'textures/blocks/azalea_leaves.png',
  },
  // ===== 樱花树（体素方块）=====
  {
    name: 'cherryTrunk_TopTexture',
    type: 'texture',
    path: 'textures/blocks/cherry_trunk_Top.png',
  },
  {
    name: 'cherryTrunk_SideTexture',
    type: 'texture',
    path: 'textures/blocks/cherry_trunk_Side.png',
  },
  {
    name: 'cherryLeaves_Texture',
    type: 'texture',
    path: 'textures/blocks/cherry_leaves.png',
  },
  // ===== 仙人掌（体素方块）=====
  {
    name: 'cactusTrunk_TopTexture',
    type: 'texture',
    path: 'textures/blocks/cactus_trunk_Top.png',
  },
  {
    name: 'cactusTrunk_SideTexture',
    type: 'texture',
    path: 'textures/blocks/cactus_trunk_Side.png',
  },
  // ===== 水（体素方块）=====
  {
    name: 'water_Texture',
    type: 'texture',
    path: 'textures/blocks/water.png',
  },
  // ===== 冰（体素方块）=====
  {
    name: 'ice_Texture',
    type: 'texture',
    path: 'textures/blocks/ice.png',
  },
  // ===== 压缩冰（体素方块）=====
  {
    name: 'packedIce_Texture',
    type: 'texture',
    path: 'textures/blocks/ice_packed.png',
  },
  // ===== 砂砾 （体素方块）=====
  {
    name: 'gravel_Texture',
    type: 'texture',
    path: 'textures/blocks/gravel.png',
  },

  // 植物
  {
    name: 'deadBush_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/dead_bush.png',
  },
  {
    name: 'shortDryGrass_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/short_dry_grass.png',
  },
  {
    name: 'shortGrass_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/short_grass.png',
  },
  {
    name: 'dandelion_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/dandelion.png',
  },
  {
    name: 'poppy_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/poppy.png',
  },
  {
    name: 'oxeyeDaisy_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/oxeye_daisy.png',
  },
  {
    name: 'allium_plant_Texture',
    type: 'texture',
    path: 'textures/blocks/allium.png',
  },
  {
    name: 'cactus_flower_Texture',
    type: 'texture',
    path: 'textures/blocks/cactus_flower.png',
  },
  {
    name: 'pink_tulip_Texture',
    type: 'texture',
    path: 'textures/blocks/pink_tulip.png',
  },
]
