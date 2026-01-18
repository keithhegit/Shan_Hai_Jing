# 3rd_MC — Master Plan（GDD / PRD / 技术方案 / 迭代计划汇总）

更新时间：2026-01-17  
基线版本：`main@6759649`（已合并并推送 main）  
迭代分支：`new_battle`（战斗迭代分支；已合并过一次，后续可继续复用或按需新开）

本文件目标：把以下文档的信息去重合并为一份可执行的总表，并给出“已完成进度 + 下一迭代入口”。

口径与分工：
- 工程唯一口径：本仓库的迭代范围、里程碑拆分、验收口径、代码入口对照，统一以 `docs/master_plan.md` 为准
- 高概念愿景参考：`docs/Project_SHJ_development_plan_v2.md` 作为长线系统与愿景参考，不在其中维护本仓库的里程碑/排期/验收
- 去重规则：当两份文档都涉及同一主题时，本文件只保留“可执行的最小集”，其余以链接指向高概念段落
- 同步规则：本仓库实现现状的描述只在本文件更新；高概念文档如需提及实现现状，仅引用本文件对应章节/里程碑

来源文档：
- `docs/might&magic_development_plan.md`（技术行动纲领）
- `docs/terrain_data_system_cedd794c.plan.md`（地形数据系统专项方案）
- `docs/PRD.md`（产品需求/体验规格）
- `docs/project_plan.md`（项目总规划与里程碑）
- `docs/Project_SHJ_development_plan_v2.md`（高概念策划案：长线玩法系统参考）

---

## 0. 快速导航（文档 / 代码 / 事件）

### 0.1 文档索引
- 总表（本文件）：`docs/master_plan.md`
- PRD/体验规格：`docs/PRD.md`
- 战斗/锁定规格（可实现口径）：`docs/pokemon_gdd.md`
- 迭代里程碑：`docs/project_plan.md`
- 技术行动纲领：`docs/might&magic_development_plan.md`
- 地形数据系统专项：`docs/terrain_data_system_cedd794c.plan.md`
- 高概念策划案（长线参考）：`docs/Project_SHJ_development_plan_v2.md`

### 0.2 启动入口（Vue → Experience）
- Vue 根组件：`src/App.vue`（创建 canvas，`new Experience(canvas)`，订阅 UI 事件）
- Experience 单例：`src/js/experience.js`（挂 `window.Experience`，持有 Time/Camera/Renderer/World；可 `switchWorld()`）
- 旧入口（可能未使用）：`src/js/index.js`（DOM 查询 `#canvas` 后创建 Experience）

### 0.3 世界层（World / DungeonWorld）
- 主世界（Hub + Dungeon 切换）：`src/js/world/world.js`
- 切换世界占位实现：`src/js/world/dungeon-world.js`（由 `Experience.switchWorld(worldId)` 选择性创建）

### 0.4 地形与生成（两套数据源并存）
- TerrainDataManager（高度/颜色数据源）：`src/js/world/terrain-data-manager.js`
- Terrain（InstancedMesh 方块渲染）：`src/js/world/terrain.js`
- ChunkManager（流式/碰撞/方块查询）：`src/js/world/terrain/chunk-manager.js`
- BlockDungeonGenerator（块状地牢布局生成）：`src/js/world/dungeon/block-dungeon-generator.js`

### 0.5 输入与事件（关键链路）
- 输入采集与映射：`src/js/utils/input.js`
  - 移动状态：`input:update`
  - 跳跃：`input:jump`
  - 攻击（键盘）：`input:punch_straight`（Z）、`input:punch_hook`（X）
  - 格挡：`input:block`（C 按下/松开）
  - 交互：`input:interact`（E）
  - 快速返回：`input:quick_return`（R）
  - 锁定：`input:mouse_down(button=1)` / `input:lock_on`（中键）
- 输入到世界：`src/js/world/world.js`
  - 锁定：`_toggleLockOn()`、`_updateLockOn()`
  - 攻击：`_tryPlayerAttack(...)`（由 `input:punch_*` 触发）
  - 交互/进出地牢：`_onInteract()`、`_activatePortal()`、`_enterDungeon()`、`_exitDungeon()`
  - 探索进度：`_emitDungeonProgress()`（读完后解锁 `R` 快速返回）
- UI 事件订阅入口：`src/App.vue`
  - Portal/Interactable Prompt：`portal:*`、`interactable:*`
  - Loading：`loading:*`
  - Dungeon：`dungeon:*`
  - Lock：`combat:lock` / `combat:lock_clear`
  - CTA：`ui:show_cta` / `ui:hide_cta`（组件：`src/components/GameCTA.vue`）

---

## 1. 产品定位与体验闭环（PRD + Master Plan）

### 1.1 一句话定位
Web 端 Three.js + Vue 3 的可交互体验站：MC 风格的多世界传送门探索 + 魂类锁定战斗预热体验。

### 1.2 核心体验流程
加载页 → Hub（超平坦世界） → 传送门选择 → 加载过渡 → Dungeon（探索/互动/战斗） → 通关 CTA → 返回 Hub

### 1.3 目标平台与最低验收环境
- 目标平台：PC Chrome
- 最低分辨率：1380 × 840

---

## 2. 当前实现进度汇总（对照四份文档）

说明：状态仅描述“代码/线上表现是否具备该能力”，不对体验质量做判断。

### 2.1 已完成（可演示闭环）
- Hub 可进入、可移动、相机与 PointerLock 链路可用
- Hub 边界约束生效（软/硬边界逻辑已存在）
- 传送门交互：单入口靠近提示（prompt）+ 目的地选择菜单 + Loading 过渡 + 进入地牢
- Dungeon 可进入：线性地牢生成、出口返回 Hub、返回时 Loading 过渡
- 互动点（Interactables）：靠近提示、按键打开、关闭后标记“已阅读”、进度上报 HUD
- 上锁宝箱：地牢内生成上锁宝箱；解锁后战利品弹出动画可见；可在场景内按 E 拾取
- HUD（Vue）：血量/体力/操作提示/小地图/提示与 Toast（以现状为准）
- 小地图（MiniMap）：Canvas2D 绘制 + 玩家位置标记（依赖 `Experience.terrainDataManager`）
- 端到端测试：Playwright smoke 覆盖“加载→进地牢→出地牢”，并校验渲染 canvas 绑定
- 敌人/动物模型渲染：支持同一 GLTF 多实例创建（修复“创建了但不可见”的常见骨骼克隆问题）
- 地牢敌人动画：进入地牢后默认播放走动类动画（Walk/Run/Move 兜底）

### 2.1.1 近期新增（相对 2026-01-14 文档版本）
- 修复：SkinnedMesh/骨骼模型多实例克隆（敌人/动物）导致不可见
- 增强：Playwright smoke 额外校验 Hub 动物与地牢敌人存在
- 降噪：Vite SCSS 配置切到 modern API，避免 Sass legacy-js-api 警告刷屏
- 文档：新增 `src/js/world/model_list.md`，汇总 World 资源加载 key 与使用点
- Hub：交互物模型替换（仓库/纸条/水晶）与位置调整
- Hub：传送门改为单入口 + 菜单选择目的地
- 地牢：奖励宝箱迁移进各地牢，上锁宝箱解锁后支持战利品弹出与场景拾取

### 2.2 部分完成（存在入口/占位，但不完整）
- 战斗锁定（Lock-on）：支持“中键锁定最近敌人 / 再按解除”，并推送 UI 提示事件；锁定视觉与验收口径以 `docs/pokemon_gdd.md` 的“锁定原型规格”为准；但“战斗判定/伤害/受击/死亡/重生”仍未形成闭环
- 敌人：地牢内可生成敌人实体并播放基础移动动画，但战斗交互未闭环（无攻击/受击/死亡/重生闭环）
- CTA：PRD 要求通关后弹 CTA；当前代码存在 CTA 组件与事件入口，但“通关条件与触发”以现状为准

### 2.3 未实现（文档存在，但代码未形成能力）
- 战斗 MVP：轻击连击/重击/格挡、受击反馈、敌人攻击预警、死亡/重生完整闭环
- “3D 心形模型血量”（PRD 规格）：当前以现状 HUD 实现为基线，3D 心形模型与破碎效果未落地为强制能力
- 埋点与指标闭环：PRD 的 CTA 点击率/完成率等未形成统一埋点输出

---

## 3. 系统设计（GDD 视角：玩法与系统拆解）

### 3.1 世界与场景
- Hub（超平坦世界）
  - 玩家自由移动
  - 传送门集群：选择目标地牢
  - 边界约束：防止玩家离开核心区域太远
- Dungeon（地牢世界）
  - 线性探索路径
  - 互动点：提供图文叙事信息
  - 敌人与战斗（下一迭代重点：战斗 MVP 闭环）
  - 出口：返回 Hub

### 3.2 交互协议（输入 → 游戏事件 → UI）
- 输入层：键盘/鼠标输入抽象为事件（mitt）
- 世界层：World 处理交互与状态机（hub/dungeon）
- UI 层：Vue 组件订阅事件并渲染 HUD/Modal/Toast/Prompt

### 3.3 控制与交互（以 PRD 为目标规格）
- 移动：WASD
- 加速：Shift
- 跳跃：Space
- 互动：E（或 E/F 取决于当前实现）
- 锁定：鼠标中键
- 格挡：C
- 攻击：左键/右键（目标规格；是否已接入以当前实现为准）

---

## 4. 技术架构（TDD 视角：模块边界与数据流）

### 4.1 目录与核心模块
- `src/js/experience.js`：Experience 单例（Time/Sizes/Camera/Renderer/World/Resources 统一入口）
- `src/js/renderer.js`：WebGLRenderer + 后处理（EffectComposer/RenderPass/Bloom/SpeedLines）
- `src/js/world/world.js`：世界主逻辑（Hub/Dungeon 切换、交互、进度、锁定等）
- `src/components/*.vue`：HUD/Modal/CTA/MiniMap 等 UI
- `src/js/utils/event-bus.js`：mitt 事件总线（跨层通信）
- `tests/browsers.test.js`：Playwright smoke（流程 + canvas 绑定断言）

### 4.2 Experience 单例约束（稳定性关键）
- 约束：`Experience` 是单例；第一次构造时传入的 `canvas` 会固定下来
- 风险：任何 Vue 子组件若在父组件 `onMounted` 之前调用 `new Experience()`，会导致单例在“无 canvas”状态被提前创建，从而出现“页面 canvas 不渲染、背景透白、HUD 正常”的现象
- 规约：UI 子组件不得主动 `new Experience()` 创建实例；应通过已就绪的全局入口读取（例如 `window.Experience`）或由父组件注入引用

### 4.3 Terrain Data System（专项方案 + 当前实现对照）
目标（来自 `terrain_data_system_cedd794c.plan.md`）：
- 噪声库（Perlin/FBM）
- TerrainDataManager（高度/颜色映射数据源）
- Terrain.js（InstancedMesh 渲染）
- MiniMap（Canvas2D 使用数据源绘制）

当前实现（以仓库现状为准）：
- `src/js/tools/noise.js`：已存在（Perlin/FBM）
- `src/js/world/terrain-data-manager.js`：已存在（生成 `dataBlocks`，包含颜色映射）
- `src/js/world/terrain.js`：已存在（InstancedMesh 渲染方块）
- `src/components/MiniMap.vue`：已存在（Canvas2D 绘制；支持不同数据源接口）
- 兼容点：当前游戏世界还存在基于 ChunkManager 的地形/碰撞数据源；MiniMap 绘制逻辑包含对不同 provider 的兼容路径

---

## 5. 迭代计划（项目节奏 + 战斗 MVP 目标）

### 5.1 完成度口径（用于统一“完成/未完成”表述）
- 完成：核心流程可稳定走通，且满足该里程碑的最小验收口径（见每节“验收口径”）
- 部分完成：已有代码入口/占位或可演示，但缺少关键子系统，导致无法形成该里程碑的闭环验收
- 未开始：没有可演示的代码路径，或仅存在文档/占位组件但无集成

### 5.2 里程碑状态（对照 `project_plan.md`，按当前代码评估）
- I0 基线：完成（可部署可演示 + 回归命令可跑通）
- I1 世界基建：部分完成（存在 TerrainDataManager/InstancedMesh/MiniMap，但 Hub 地形与数据源存在“双体系”，尚未统一为单一权威数据源）
- I2 Hub + 传送门：完成（可进入 Hub、靠近提示、按键进入地牢、加载过渡）
- I3 地牢探索：部分完成（“可进地牢 + 互动 + 返回”已具备；但“地牢系统”按 PRD 口径还缺战斗闭环/通关与 CTA 触发/内容规模）
- I4 战斗 MVP：未开始或仅有雏形（现有“中键锁定/解除”属于雏形；缺攻击/格挡/受击/HP/死亡重生闭环）
- I5 UI + CTA：未开始（组件存在不等于闭环；缺“通关条件→触发 CTA→回到 Hub”的完整串联与数据埋点）
- I6 打磨优化：未开始（性能、加载、资源压缩、缺陷清零、监控/埋点等为后续工作）

### 5.3 I3（地牢探索）细化拆分（建议：先把“地牢系统”定义清楚）
I3 在 PRD 里不仅是“能进能出”，还包含“探索/互动的完整体验 + 与后续战斗/通关的可扩展接口”。建议拆成 I3.1-I3.4 逐步验收：

I3.1 地牢基础闭环（当前已具备，归档为“完成”）
- 进入地牢：Hub 传送门触发 → Loading → 地牢生成/加载
- 返回 Hub：地牢出口触发 → Loading → 回到 Hub

I3.2 互动与叙事闭环（当前已具备，质量迭代可后置）
- 互动点：靠近提示 → 按键打开 → 关闭后标记“已阅读”
- 进度提示：地牢阅读进度 HUD + Toast 提示 + 快速返回提示

I3.3 地牢“内容规模”最小验收（建议作为 I3 收尾条件）
- 每个地牢至少 1 条可走通路线（50m 量级或等价体验）
- 每个地牢至少 2~3 个可互动物体（文案/图片/标题至少一项可配置）
- 地牢出口提示需能表达“未读剩余/已完成”两态（避免玩家不知道为何不能快速返回）

I3.4 与战斗/通关系统的接口预留（建议在 I4 前补齐）
- 统一“地牢状态”数据结构：`currentWorld`、`dungeonId`、`progress(read/total/completed)`、`combatState`（最小字段即可）
- 统一“暂停/恢复”协议：互动弹窗/CTA/加载过渡不应打断输入系统（避免 pointerlock/输入状态残留）

### 5.4 I4 战斗 MVP 细化计划（对齐 PRD，按闭环优先）
目标：在地牢内稳定完成 1 次战斗闭环：锁定 → 攻击/格挡 → 受击反馈 → 敌人死亡或玩家死亡 → 重生/继续。

交付物（建议顺序）：
1) 战斗数据模型最小集
- Player：`hp/maxHp`、`stamina/maxStamina`、`isBlocking`、`isDead`
- Enemy：`id/name`、`hp/maxHp`、`isLocked`、`isDead`

2) 输入映射与状态机最小可用
- 轻击（左键）/重击（右键）/格挡（C）/锁定（中键）
- 输入在“互动弹窗/加载过渡/CTA”期间要被正确禁用或路由（避免误触）

3) 锁定视觉与信息反馈（对齐原型规格）
- 锁定准星：圆圈收缩动画
- 被锁定目标：红色描边
- 被锁定目标：脚底光幕圈（圈高约为怪物身高 30%，持续 pulsate）
- 被锁定目标：头顶显示名称与血条
- 规格与验收口径：以 `docs/pokemon_gdd.md` 的“锁定原型规格”为准

4) 命中判定最小可用（先简单后复杂）
- 简化判定：距离阈值 + 视角夹角阈值（或 capsule/box hitbox 二选一）
- 输出事件：`combat:hit`、`combat:block`、`combat:damage`（命名可沿用现有事件风格）

5) 反馈最小可用（至少一项）
- 玩家受击：屏幕红闪或震动或飘字（三选一先做）
- 敌人受击：闪白/后退/飘字（至少一项）

6) 结束条件与重生
- 敌人 hp=0：死亡动画/消失占位 + 战斗结束状态回收
- 玩家 hp=0：重生到地牢入口（或回 Hub，二选一明确并实现）

7) UI 串联（I5 的前置一部分）
- 玩家 HP/体力 HUD 与战斗数据绑定
- 敌人血条（哪怕先用 2D overlay）+ 锁定提示

验收口径：
- 进入任意地牢后，可稳定触发 1 次战斗并结束，不出现输入锁死/无法退出/流程阻塞
- 锁定成功时，准星与目标的锁定反馈可被明确感知（细则见 `docs/pokemon_gdd.md`“锁定原型规格”）

### 5.4.1 I4 开始前需要先定的关键前提（建议本周定稿）
1) 通关条件（战斗与通关关系）
- 方案 A：击败“地牢精英（1v1）”即通关（最贴近战斗闭环）
- 方案 B：到达终点即通关，战斗是可选挑战（更利于先把 CTA 串起来）

2) 命中判定方案（先简后繁）
- 第一阶段建议：距离阈值 + 朝向夹角阈值（配合锁定），先跑通闭环
- 第二阶段再上：Hitbox（Capsule/Box）或射线/骨骼挂点

3) 敌人 AI 最小行为（能打起来即可）
- 待机/巡逻（可复用现有 Walk 动画）→ 发现玩家（范围）→ 追击 → 攻击 → 冷却

4) 失败处理（玩家死亡）
- 明确：玩家死亡后重生到地牢入口，或直接回 Hub（二选一，避免流程分叉）

### 5.5 I5（UI + CTA）细化计划（当前未开始）
目标：形成“通关 → CTA → 返回 Hub/继续探索”的可对外演示转化闭环。

交付物（建议顺序）：
1) 通关条件定义（最小可用）
- 方案 A：击败地牢精英（1v1）即通关
- 方案 B：到达终点触发通关（与战斗解耦，便于先跑通）

2) CTA 触发与可关闭
- 触发事件：`ui:show_cta`（或现有事件名复用）
- 关闭后状态：回到 Hub 或留在地牢继续探索（需明确并实现一致行为）

3) 埋点最小集（仅做事件输出即可）
- `portal_enter`、`dungeon_complete`、`cta_show`、`cta_click`、`return_hub`

验收口径：
- Hub → 地牢 → 通关 → CTA → 返回 Hub 全流程稳定走通（无需追求最终美术）

### 5.6 I6（打磨优化）细化计划（当前未开始）
目标：把“可跑通”提升为“可稳定分发”，重点是性能、加载、输入稳定性、缺陷清零与监控。

交付物（建议顺序）：
1) 性能与资源
- 大资源懒加载/预加载策略（地牢切换、模型/纹理）
- 渲染开销控制（后处理开关、阴影质量档位、chunk streaming 的策略优化）

2) 加载与状态一致性
- Loading 期间输入/指针锁定状态一致
- 世界切换的资源销毁/复用策略（避免内存泄漏与残留监听）

3) 稳定性回归
- 扩展 Playwright 用例覆盖：战斗开始/结束、CTA 显示/关闭、快速返回、暂停恢复

验收口径：
- 关键流程（Hub/传送/地牢/互动/战斗/CTA/返回）无阻塞缺陷，且回归脚本稳定通过

验收口径：
- 进入任意地牢后，可稳定触发 1 次战斗并结束，不出现输入锁死/无法退出/流程阻塞

---

## 6. 回归与发布（每次迭代必跑）

- `pnpm run lint`
- `pnpm run build`
- `npx playwright test tests/browsers.test.js --project=chromium`
- 例外：纯文档变更可跳过 `playwright`

