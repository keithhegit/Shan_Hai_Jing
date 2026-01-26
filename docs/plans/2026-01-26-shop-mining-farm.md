# Shop + Mining + Farm (Hub) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Hub 增加旅行商人商店、矿山解锁、鹤嘴镐挖矿流程、灵兽补充剂，并修复牧场/鱼相关问题。

**Architecture:** 以现有 `World + Systems + Inventory + InteractableModal` 模式扩展：商店/牧场/挖矿都通过“可交互物体 + E 打开 modal + action 回传”落地；购买/消耗统一走 InventorySystem；解锁状态写入 `world._portalUnlocks` 并持久化到 save。

**Tech Stack:** Vue 3（单文件组件）、Three.js、mitt event bus、现有资源加载器（GLTFLoader/FBXLoader）。

---

### Task 1: 修复牧场围栏与交互（矩形 + 阻挡）

**Files:**
- Modify: `src/js/world/systems/farm-system.js`
- Modify: `src/js/world/systems/interactable-system.js`

**Step 1: 写一个最小复现脚本/日志**
- 在牧场终端按 E 时打印出 modal payload（actions 数量、canisterMeta 条目数）到左下角日志（使用现有 toast/log 机制）。

**Step 2: 围栏生成改为轴对齐矩形**
- 只放 4 个 `Fence_Corner`，边缘用 `Fence_Center` 铺满。

**Step 3: 增加“阻挡主控”效果**
- 以 AABB 边界做软碰撞：玩家靠近边界并试图穿越时将位置 clamp 回边界内。

**Step 4: 牧场终端交互投放**
- modal actions 从 `inventory.canisterMeta` 枚举；点击 action：扣背包 `canister_*` + 生成对应 `animal_*` 并写入 `farmBounds` 让其在围栏内游荡。

**Step 5: 手动回归**
- 背包有狗收容罐：按 E 能出现列表并投放成功；主控无法穿越围栏。

---

### Task 2: 修复鱼 FBX 不出现（确保加载 + 可见 + 名字）

**Files:**
- Modify: `src/js/sources.js`
- Modify: `src/js/world/systems/fish-npc-system.js`

**Step 1: 确认 sources.js 有三条鱼的 fbxModel**
- `fish_goblin_shark`, `fish_tuna`, `fish_yellow_tang` 指向对应 `.fbx`。

**Step 2: FishNpcSystem 使用正确 resourceKey**
- 生成时写入 name label；把 wrapper 加到 `world.animalsGroup` 或一个可见 group。

**Step 3: 手动回归**
- Hub 水里能看到鱼模型与名字标签。

---

### Task 3: 新增旅行商人（兔子）+ 商店 UI

**Files:**
- Modify: `src/js/sources.js`
- Create/Modify: `src/components/ShopModal.vue`（或复用 InteractableModal 扩展 shop 模式）
- Modify: `src/App.vue`
- Modify: `src/js/world/world.js`
- Modify: `src/js/world/systems/interactable-system.js`

**Step 1: 加载兔子模型到 resources**
- `character_rabbit` → `public/models/character/Character_rabbit.gltf`

**Step 2: 在 Hub 固定坐标放置 NPC**
- 不移动；Idle/Wave 动画循环（每 4 秒 wave）。

**Step 3: 增加 E 交互打开商店**
- Modal 展示商品列表，显示价格与库存/条件（金币/矿物）。

**Step 4: 购买与解锁**
- 扣金币/扣 `crystal_small`；写入 `world._portalUnlocks.mine/hellfire` 并持久化；portal 面板根据 unlock 置灰/解锁。

**Step 5: 手动回归**
- 未解锁时 portal 置灰；购买后可进入。

---

### Task 4: 鹤嘴镐道具 + 挖矿交互（矿山）

**Files:**
- Modify: `src/js/sources.js`
- Modify: `src/js/world/systems/inventory-system.js`
- Modify: `src/js/world/systems/interactable-system.js`
- Modify: `src/js/world/world.js`
- Modify: `src/js/world/player/player.js`

**Step 1: 新增道具定义**
- `Pickaxe_Wood`：背包占格 1×2，Icon `img/icons/pickaxe.jpg`。

**Step 2: 购买入包/满则掉落**
- 商店购买后尝试 `addItemToBackpackGrid`；失败则在地上生成拾取物。

**Step 3: 矿物可交互挖矿**
- 在矿山的矿物对象旁边提供 `E` 交互；点击后：
  - 锁定玩家输入 5 秒
  - 播放 Punch
  - 右手挂载 Pickaxe 模型（挖矿结束卸下）
  - 5 秒进度条（复用现有 UI 或新建简易进度条 overlay）
  - 产出 `crystal_small`（入包，满则掉地）

**Step 4: 手动回归**
- 能稳定挖到 `crystal_small` 并看到进度条；5 秒内不能移动/开火/交互。

---

### Task 5: 灵兽补充剂（替代金币恢复）

**Files:**
- Modify: `src/js/world/systems/inventory-system.js`
- Modify: `src/App.vue`
- Modify: `src/js/world/world.js`

**Step 1: 新增 itemId**
- `pet_potion`：1×1，Icon `img/icons/Potion2_Filled.jpg`。

**Step 2: 改造“恢复灵兽”消耗逻辑**
- 从“扣 1 金币”改为“消耗 1 个 pet_potion”。

**Step 3: 使用确认弹窗**
- 有补充剂：弹窗“使用/放弃”；无补充剂：toast/HUD 提示。

**Step 4: 手动回归**
- 恢复灵兽消耗补充剂；无补充剂提示正确。

---

### Task 6: 验证

**Run:**
- `pnpm -s lint`
- `pnpm -s build`

**Manual smoke checklist:**
- 牧场：E 打开投放；围栏阻挡；投放生成灵兽且不越界
- 鱼：三种鱼可见且有名字
- 商店：E 打开；购买解锁 portal 生效
- 挖矿：E 挖矿、5 秒进度、产出 crystal_small
- 恢复：补充剂替代金币、弹窗流程正确

