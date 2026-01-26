# Scenery Variation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Hub 与五种地牢周边出现清晰差异的远景/地表景观组合，充分利用 `public/models/cube` 与指定 Environment 模型，让世界不单调。

**Architecture:** 在现有 Chunk/Biome 体系上叠加“世界区域群系覆盖(override)”来塑形（雪山/矿山/草山/死亡之山），并用“按群系的树/地物模型池(modelPoolsByBiome)”生成对应的树/岩石/死亡树/蘑菇/标记物；五种地牢周边用“以 portal target 为圆心的局部覆盖”匹配内部主题。

**Tech Stack:** Three.js (InstancedMesh)、glTF、现有 TerrainGenerator/BiomeGenerator/ChunkManager 管线

---

### Task 1: 补齐 cube 模型资源 key

**Files:**
- Modify: [sources.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/sources.js)

**Step 1: 增加资源条目**

- 为 `Diamond.gltf / Bricks_Dark.gltf / Exclamation.gltf / QuestionMark.gltf / WoodPlanks.gltf / Block_Blank.gltf / Block_Square.gltf` 补齐 `name: cube_*` 资源 key。

**Step 2: 本地验证**

- 运行 `pnpm -s build`，确保资源列表无拼写错误。

---

### Task 2: 增加方块类型（diamond/bricks dark/marker）

**Files:**
- Modify: [blocks-config.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/terrain/blocks-config.js)

**Step 1: 增加 BLOCK_IDS 与 blocks 条目**

- 新增：`DIAMOND_ORE`、`BRICKS_DARK`、`MARK_EXCLAMATION`、`MARK_QUESTION`（可见、使用 cube modelKey）。
- 将 `DIAMOND_ORE` 加入 `resources`（稀有度更高）。

**Step 2: 本地验证**

- 运行 `pnpm -s typecheck` / `pnpm -s build`。

---

### Task 3: 增加新的群系（雪山/矿山/草山/死亡之山）

**Files:**
- Modify: [biome-config.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/terrain/biome-config.js)

**Step 1: 新增群系配置**

- `snowMountains`: `surface=SNOW` / `subsurface=ICE` / `deep=STONE`，高度起伏更大，植被稀疏或禁用
- `mine`: `surface=STONE/GRAVEL`，植被禁用，允许矿物贴近地表
- `grassHills`: `surface=GRASS`，高度起伏更大，树密度更高
- `deadlands`: `surface=GRAVEL/STONE`，植被很稀疏（主要靠 dead tree model pool）

---

### Task 4: TerrainGenerator 支持按群系选择树/地物模型池

**Files:**
- Modify: [terrain-generator.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/terrain/terrain-generator.js)

**Step 1: 扩展 _pickTreeModelKey**

- 优先读取 `params.trees.modelPoolsByBiome[biomeId]`；缺失则回退到 `params.trees.modelPool`。

---

### Task 5: Hub 世界区域覆盖（远处雪山/矿山/草山/死亡之山）

**Files:**
- Modify: [terrain-generator.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/terrain/terrain-generator.js)
- Modify: [world.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/world.js)

**Step 1: 在 generateTerrain 内增加 override 逻辑**

- 基于 `hubCenter` + `wx/wz` 计算方位与距离，超过核心半径后按扇区选择 `snowMountains/mine/grassHills/deadlands`。
- 在地牢模式下，按 “portal target 圆形区域” 强制覆盖周边群系（forest/plains/desert/snow/mine）。

**Step 2: world.js 注入参数**

- 在创建 ChunkManager 时传入 `scenery` 配置（中心点、核心半径、扇区映射、地牢覆盖半径）。

---

### Task 6: 组合包（死亡之山 / 矿山）模型池落地

**Files:**
- Modify: [world.js](file:///D:/Code/Shan_Hai_Jing/might-magic_mc_new/src/js/world/world.js)

**Step 1: 配置 modelPoolsByBiome**

- `deadlands`: DeadTree_1/2/3 + Mushroom + cube Exclamation/Coal/QuestionMark（低密度但可见）
- `mine`: with_entity Rock/Bush + cube Coal/Diamond + Bricks_Dark
- `snowMountains`: DeadTree + Rock（稀疏）
- `grassHills/forest`: Tree_1-4/Tree_Fruit/Bamboo 权重更高（更密集）

---

### Task 7: 验证与回归

**Files:**
- Test: 手动验证 + `pnpm -s typecheck` / `pnpm -s lint` / `pnpm -s build`

**Step 1: 手动验证**

- Hub 远处可见：雪山、草山（树更密）、矿山（煤/钻石/暗砖）与死亡之山（枯树+蘑菇+标记物）。
- 进入五种地牢：周边地表风格与内部主题一致（平原/森林/沙漠/雪原/矿山）。

