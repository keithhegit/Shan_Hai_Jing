# Pokemon GDD（迭代：搜打撤融合 + UI/UX 升级）

更新时间：2026-01-26

## 0. 口径与入口

- 工程唯一口径：`docs/master_plan.md`
- 本文定位：本次迭代的设计拆解与验收口径（面向实现）

关键入口（以仓库现状为准）：

- World：`src/js/world/world.js`
- Player：`src/js/world/player/player.js`
- NPC（敌人/动物）：`src/js/world/enemies/humanoid-enemy.js`
- 资源清单：`src/js/sources.js`

## 0.1 当前实现状态（用于对齐验收与后续迭代）

已实现并回归通过（Playwright 覆盖）：

- Hub 流程可跑通；B 打开背包；靠近仓库按 E 打开仓库
- 背包 UI：拖拽道具到网格外会弹出“丢弃/取消”；也可在说明区点击“丢弃”（丢弃后掉落在地，可再次拾取）
- 灵兽石（itemId 仍为 `material_gun`）：背包内可装备/收起；挂载到主控；射线起点来自枪口（muzzle）；射程不足会在 HUD 提示
- 锁定：中键锁定/解除（Hub 动物与 Dungeon 敌人）；锁定时主控朝向会平滑对齐目标
- 灵兽石 DoT：锁定且开火时持续扣血；命中后目标进入仇恨追击并可近战攻击
- 地牢：固定 4 个战斗房间（fight1-4）；总敌人 4 杂兵 + 1 Boss；杂兵击败会掉落金币并可拾取入背包
- 地牢出口：出口点有明显可视标记，并做了清障，避免被墙体挡住
- 左下角日志 HUD：显示战斗伤害、拾取/丢弃、捕捉成功/失败、传送进入/离开等关键进度日志（默认高透明，悬停才变清晰）
- 搜打撤闭环（最小可用）：3 分钟倒计时；出口按 E 弹出撤离结算（撤离/重来）；死亡后黑屏“你死了”并进入死亡结算；Boss 击杀后每 10 秒在地牢中央刷 1 个追兵（skeleton/zombie）追击

未实装或未形成闭环（需要后续切片）：

- 图标系统：当前只接了少量 hardcode 的头像/钥匙图标（见 3.3.0）
- 网格背包（Tetris Inventory）：基础网格/拖拽/旋转/持久化已做，但占格规则需要扩展到更多道具（不再是全 1 格）
- 负重视觉化：已有背部挂载与基础惩罚，但缺少 Boss 罐的超大占格与更明确的高亮表达
- “参考图 1-5 号类”的房间配置：需要以图中编号规则作为房间/事件的生成口径

## 1. 本迭代目标

在不改变既有“Hub ↔ Dungeon”闭环的前提下，将核心体验改写为“搜打撤 + 魂类锁定决斗”的融合：备战 → 潜入 → 决斗 → 捕捉 → 撤离，并配套升级 UI/UX 为更拟物化、更沉浸、更少 2D HUD 占比的风格。

## 2. 需求拆解

### 2.1 主控换模与动作对齐

目标：

- 将主控模型替换为 `Character_Male_1.gltf`
- 从其 animations 列表中，匹配并覆盖现有主控所有动作（locomotion / jump / falling / standup / punch / block）

边界：

- 若新模型缺少某些动作，允许做最小可用的降级映射（例如缺少左右方向走路时，复用 Walk 作为四向）

验收口径：

- Hub 与 Dungeon 中，主控可正常移动/跑/蹲、可跳跃、Z/X 拳击与 C 格挡不报错、不会因模型结构差异崩溃

### 2.2 灵兽石道具：`material_gun`（当前绑定 `Tools/heart.glb`）

目标：

- `material_gun` 作为“灵兽石”道具进入背包体系
- 玩家打开背包点击该道具后，主控手持该武器
- 举枪姿势：优先使用主控模型动画 `holding-both` 的静态 Pose（若缺失则回退到 `wave` 最后一帧）
- “枪”语义：它是一块水晶；射线/激光从水晶枪口发射

交互协议：

- UI：背包条目提供“装备/卸下”
- World：响应装备事件，将武器挂到主控右手（或可用手部骨骼）

验收口径：

- 装备后可见武器模型且尺寸接近“枪”
- 卸下后武器消失
- 装备状态下主控保持举枪姿态（holding-both 优先），且不阻断基础移动动画
- 激光/射线起点来自水晶枪口（muzzle），而非主控身体中心点

### 2.3 锁定 + 激光弹道 + 持续伤害

目标：

- 当主控手持灵兽石（itemId 仍为 `material_gun`）且锁定目标（动物/敌人）时，枪口到目标之间持续显示激光弹道
- 命中目标后持续扣血（攻击力设为最低）

规则：

- 仅在“已装备灵兽石 + 已锁定目标”时生效
- 伤害方式为 DoT（每帧或定频扣血）
- 命中反馈至少包含：激光可见、目标血条下降

验收口径：

- 可稳定锁定一个目标并看到激光线
- 目标血量随时间下降，最终可触发死亡逻辑（若目标支持死亡）

### 2.4 仇恨与 NPC 攻击 + 数值管理表

目标：

- 任何被灵兽石攻击的目标会进入仇恨状态：跑向主控并尝试攻击
- 所有 NPC 具备攻击主控的能力（近身攻击）
- 数值集中管理：HP/攻击力/攻击范围/追击距离/移动速度
- 强度梯度：鸡最低攻击和 HP 最弱，狼最高

数值承接：

- 新增“数值管理表”，由 World 在生成 NPC 时注入（hp）并在 AI 更新时引用（伤害、追击/攻击距离）

验收口径：

- 鸡/狼在相同逻辑下表现出明显强弱差异（HP 与伤害）
- 被激光打到的目标会更积极追击并攻击主控

### 2.5 锁定原型规格（对齐 cursor\_.md）

本节用于把“战斗与锁定系统”从讨论态收敛为可实现的规格，作为后续战斗 MVP 与 VFX 的验收口径。

行为与触发：

- 怪物行为：固定位置等待玩家靠近
- 锁定方式：准星对准 + 鼠标中键锁定/解除
- 脱离规则：不做战斗区域封锁，允许跑开脱离战斗
- 战斗形式：实时动作战斗
- 战斗规模：1v1 单挑

锁定视觉（UI/VFX）：

- 锁定准星：圆圈收缩动画
- 被锁定目标：红色高亮（材质发光倾向/描边倾向，至少要可感知）
- 被锁定目标：脚底光幕圈（红色圆环），持续 pulsate
- 被锁定目标：头顶显示血条（仅在锁定时显示）
- 锁定状态：屏幕暗角（vignette），用于强化“已锁定”的状态识别

当前实现（对照）：

- 中键锁定/解除：已实装；并且不再因拾取/交互提示而失效
- 脚底红色圆环：已实装（锁定时显示）
- 头顶血条：已实装（锁定时显示）
- 镜头与转向：已实装（相机与主控朝向会对齐锁定目标）
- Vignette / 锁定准星圆圈收缩 / 红色高亮：未统一落地（可作为下一轮增强项）

镜头与转向（锁定模式）：

- 锁定时，相机 Rig 朝向敌人，并将注视点设置为“玩家与敌人中点 + 目标高度偏移”
- 锁定时，World 会持续将主控朝向平滑对齐目标，减少空挥

结束表现：

- 怪物死亡：播放死亡动画后消失

验收口径（最小）：

- 装备灵兽石后，可见武器模型且不影响基础移动
- 锁定成功时，准星与目标的锁定反馈可被明确感知
- 目标死亡后，不保留锁定状态与锁定 UI/VFX 残留

### 2.6 灵兽 HUD 快捷栏（1-0）

目标：

- 右下角“灵兽 HUD”提供 10 个快捷键槽位：`1-0`
- 槽位上显示按键标识，便于学习与肌肉记忆
- 右上角“操作说明”中补充 `1-0` 的说明

规则：

- `1` 键固定为“灵兽石”（itemId：`material_gun`）：按下即装备（若背包中存在），无需打开背包
- `2-0` 键用于快捷选择灵兽收容罐（背包内 `canister_*`，按可用顺序填充）
- UI 只负责触发“装备/使用”意图，具体装备/消耗由 World/Inventory 系统落地

验收口径：

- HUD 上可见 `1-0` 标识
- 按 `1` 可直接装备灵兽石；按 `2-0` 可快速切换/选择灵兽罐

### 2.7 牧场（进入建造模式 + 投放收容罐生成灵兽）

目标：

- 牧场为 Hub 内的固定交互点：靠近“牧场终端”按 `E` 打开“牧场 / 牧场仓库”
- 用户自行搭建牧场围栏（不再由系统自动生成 Fence）
- 牧场仓库可领取 Fence 道具，用于建造模式放置/拆除（仿 MC）

交互协议（投放灵兽）：

- 管理面板列出“背包中的可投放收容罐”（以 `canisterMeta` 为准）
- 选择某个收容罐条目后：
  - 从背包中消耗 1 个对应 `canister_*`
  - 在牧场内生成该收容罐捕获的 `animal_*`，并在围栏内游荡

验收口径：

- 靠近牧场终端出现提示，按 `E` 可打开管理面板
- 背包里有“已捕获信息”的收容罐时，面板能列出并成功投放生成灵兽
- 可从牧场仓库领取 Fence 道具，并能进入建造模式放置/拆除

#### 2.7.1 牧场仓库：Fence 道具领取（上限补齐）

领取道具：

- `Fence_Center`：最多 16 件（可堆叠）；Icon：`img/icons/Fence_Center.jpg`
- `Fence_Corner`：最多 4 件（可堆叠）；Icon：`img/icons/Fence_Corner.jpg`

规则：

- 领取不是“无限发放”，而是“补齐到上限”：例如当前背包里 `Fence_Center=2`，领取后变为 16
- 已达上限时提示“已达上限”
- Fence 道具可进入 `1-0` 快捷栏并可被激活（用于建造模式）

#### 2.7.2 建造/拆卸模式（仿 MC）

进入方式：

- 在快捷栏按数字键激活 `Fence_Center` / `Fence_Corner` 后，自动进入建造模式

操作说明（HUD 必须提示）：

- `T`：切换“建造 / 拆卸”模式
- 鼠标左键：执行当前模式的操作（建造=放置；拆卸=拆除）

表现：

- 建造：显示绿色预览方块，指示即将放置的位置
- 拆卸：显示红色标记方块，指示即将拆除的位置

约束：

- 放置成功后消耗 1 个对应 Fence 道具，并在场景中生成一个**实心方块围栏**（具备碰撞，不可穿过）
- 拆除成功后返还 1 个 Fence 道具（若背包满，则掉落到地面可拾取）

### 2.8 鱼（已移除）

因鱼 FBX 资产在当前渲染链路下存在“仅名字可见、模型不可见”的稳定性问题，本仓库移除鱼系统与相关资源引用，避免影响主流程。

### 2.9 旅行商人（商店 NPC）与地牢解锁

目标：

- Hub 新增商店 NPC：名称“旅行商人”
- 使用模型：`character/Character_rabbit_Gun.gltf`
- 位置固定：`X36.5 Y9.5 Z37.6`
- 行为：站立不动；每 4 秒播放一次 `Wave`，其余时间 `Idle`
- 交互：靠近按 `E` 打开“商店”界面
- 表现：模型缩放为原来的一半，并自动贴地；玩家不可穿模

商店售卖与规则：

- 解锁：地牢“矿山”= 5 金币
- 解锁：地牢“地狱火”= 10 金币
- 未解锁时：传送门选择面板中对应地牢置灰不可选；解锁后可选
- 卖出：点击“卖出”后打开背包；点击背包物品弹窗确认卖出并获得金币
  - 置灰收容罐（exhausted）= 1 Gold
  - 可投掷收容罐：小=1 / 中=2 / 大=3 Gold
  - 工具（`Axe_*`、`Pickaxe_*`）= 3 Gold
  - `crystal_small` 与 `key_*` 不可卖出（按钮置灰）

验收口径：

- 旅行商人可见且循环播放 Idle/Wave
- `E` 交互打开商店
- 购买解锁后，传送门面板中矿山/地狱火从置灰变为可用

### 2.10 鹤嘴镐与挖矿（矿山）

目标：

- 新增可购买道具：鹤嘴镐（模型 `Tools/Pickaxe_Wood.gltf`）
- Icon：`img/icons/pickaxe.jpg`
- 价格：5 金币
- 背包占格：`1x2`（竖放）
- 若背包满：购买后掉落在地上（可拾取）

挖矿交互（矿山）：

- 矿山内矿物（`crystal_small` / `crystal_big`）新增 `E` 交互“挖矿”
- 挖矿过程：
  - 播放主控动画 `Punch`
  - 将鹤嘴镐挂到主控右手（挖矿期间保持手持）
  - 显示挖矿进度条 5 秒；5 秒内主控不能做其他动作
  - 完成后获得 1 个道具 `crystal_small`（Icon `img/icons/crystal_small.jpg`）

验收口径：

- 矿山矿物可交互 `E` 挖矿
- 挖矿 5 秒内有进度反馈且禁用其他动作
- 完成后产出 `crystal_small` 并进入背包（满则掉地）

### 2.11 灵兽补充剂（替代金币恢复）

目标：

- 新增消耗品：灵兽补充剂（itemId 暂定 `pet_potion`）
- Icon：`img/icons/Potion2_Filled.jpg`
- 获取方式：商店兑换（消耗 `3 x crystal_small`）
- 作用：将“战败置灰”的灵兽恢复为可用
- 取消原“消耗 1 金币恢复”的设定，改为消耗灵兽补充剂

使用交互：

- 当尝试恢复灵兽时：
  - 若背包没有补充剂：HUD 文本提示“没有足够的灵兽补充剂”
  - 若背包补充剂数量 ≥ 1：弹窗询问“使用 / 放弃”
    - 使用：触发恢复效果并库存 -1
    - 放弃：关闭弹窗，不消耗

验收口径：

- 不再消耗金币恢复灵兽
- 无补充剂时提示明确
- 有补充剂时弹窗可选择使用或放弃，使用后灵兽恢复且道具数量减少

## 3. 数据设计

### 3.1 道具定义（最小）

| 字段        | 说明                             | 示例           |
| ----------- | -------------------------------- | -------------- |
| itemId      | 背包内 ID（尽量与资源 key 对齐） | `material_gun` |
| resourceKey | three resources key              | `material_gun` |
| type        | 道具类型                         | `weapon`       |
| equipSlot   | 装备槽                           | `right_hand`   |

新增道具（本轮）：

| itemId          | 类型         | 背包占格 | Icon_img                         | 备注                     |
| --------------- | ------------ | -------- | -------------------------------- | ------------------------ |
| `Pickaxe_Wood`  | `tool`       | 1×2      | `img/icons/pickaxe.jpg`          | 商店购买；用于挖矿       |
| `crystal_small` | `material`   | 1×1      | `img/icons/crystal_small.jpg`    | 挖矿产物；也用于兑换     |
| `pet_potion`    | `consumable` | 1×1      | `img/icons/Potion2_Filled.jpg`   | 恢复灵兽；替代金币恢复   |
| `Fence_Center`  | `build`      | 1×1      | `img/icons/Fence_Center.jpg`     | 牧场仓库领取；用于建造   |
| `Fence_Corner`  | `build`      | 1×1      | `img/icons/Fence_Corner.jpg`     | 牧场仓库领取；用于建造   |

### 3.2 NPC 数值表（最小字段）

最小字段集合：

- `maxHp`
- `attackDamage`
- `aggroRange`
- `attackRange`
- `moveSpeed`

初始强度梯度（仅用于本迭代验收）：

- 鸡：最低 `maxHp` 与 `attackDamage`
- 狼：最高 `maxHp` 与 `attackDamage`

### 3.3 数值管理列（NPC/minion/boss/道具/消耗品 + Icon 口径）

本节的目标是把“需要做成可配置表”的列先对齐，避免后续边做边补字段导致反复改 UI/存档/生成逻辑。这里不填具体数值，只定义列。

#### 3.3.0 图标库在哪里（现状）

当前项目的“图标库”实际分两类：

- 头像/缩略图（用于收容罐快捷栏、部分 UI）：放在 `public/img/icons/`，并在 [App.vue](file:///d:/Code/Shan_Hai_Jing/might-magic_mc_new/src/App.vue#L719-L749) 的 `avatarIconSrcForResourceKey()` 里用 `resourceKey -> filename` 做映射
- 钥匙图标：同样来自 `public/img/icons/key.jpg`（目前背包里最稳定可见的一张）

如果你要补齐更多 icon：

- 把图片放到 `public/img/icons/`
- 按需扩展 `avatarIconSrcForResourceKey()` 的映射表，让新 `resourceKey` 能找到对应文件名

图标像素建议的前提：

- 当前背包/仓库网格单元在 UI 上按 `42px` 渲染（会缩放）
- 建议准备“按格子数倍增”的正方形/长方形透明底图，保证缩放后依然清晰
- 默认建议：每 1 格使用 64px（即 1×1 → 64×64）；更大的物品按格子倍数等比放大

| 类型                 | 主键/标识列                        | 数值管理列（建议最小集）                                                                                    | 捕捉/产出列（如适用）                         | 背包格子（w×h）        | Icon_img                        | Icon_px 建议                             |
| -------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------- | ------------------------------- | ---------------------------------------- |
| NPC（可捕捉）        | `npcId` / `resourceKey`            | `maxHp`, `attackDamage`, `moveSpeed`, `aggroRange`, `attackRange`, `windupMs`, `hitRadius`                  | `captureCanisterId`（默认 `canister_small`）  | 捕捉产物：1×2          | `img/icons/canister_small.png`  | 64×128                                   |
| Minion（可捕捉）     | `enemyId` / `type` / `resourceKey` | `maxHp`, `attackDamage`, `moveSpeed`, `aggroRange`, `attackRange`, `windupMs`, `hitRadius`                  | `captureCanisterId`（默认 `canister_medium`） | 捕捉产物：2×2          | `img/icons/canister_medium.png` | 128×128                                  |
| Boss（可捕捉）       | `bossId` / `type` / `resourceKey`  | `maxHp`, `attackDamage`, `moveSpeed`, `aggroRange`, `attackRange`, `windupMs`, `hitRadius`, `phase`（可选） | `captureCanisterId`（默认 `canister_large`）  | 捕捉产物：3×3          | `img/icons/canister_large.png`  | 192×192                                  |
| 其他道具（Item）     | `itemId` / `resourceKey`           | `type`, `stackable`, `maxStack`（可选）, `weight`, `rarity`（可选）                                         | `dropRate` / `lootTableId`（可选）            | 例：`material_gun` 2×4 | `img/icons/{itemId}.png`        | 2×4 → 128×256；1×1 → 64×64；1×2 → 64×128 |
| 消耗品（Consumable） | `itemId` / `resourceKey`           | `stackable`, `maxStack`, `cooldownMs`（可选）, `useEffectId` / `effectValue`                                | `useConsumes`（是否消耗）                     | 建议 1×1 或 1×2        | `img/icons/{itemId}.png`        | 1×1 → 64×64；1×2 → 64×128                |

如果你后续给我一批 icon，我会按这张表的 `Icon_img` 路径约定把它们接进背包/仓库网格渲染，并把现有 SVG 占位替换为图片。

#### 3.3.1 可捕捉目标清单（当前实现穷举）

说明：当前实现里，捕捉产出是“按目标类别分档”的收容罐（Small/Medium/Large），并不区分“抓到哪一种怪就产出哪一种罐”。因此你需要准备 PNG 的重点是 `canister_*`（见 3.3.2），而不是每个 NPC/敌人各自一张“掉落物图标”。

Hub（NPC/动物，`resourceKey`）：

| 类别        | resourceKey      | 现有显示名（代码内 label） | 捕捉产出 itemId  |
| ----------- | ---------------- | -------------------------- | ---------------- |
| NPC（动物） | `animal_pig`     | `矿工鼠`                   | `canister_small` |
| NPC（动物） | `animal_sheep`   | `绵绵球`                   | `canister_small` |
| NPC（动物） | `animal_chicken` | `小鸡`                     | `canister_small` |
| NPC（动物） | `animal_cat`     | `猫猫`                     | `canister_small` |
| NPC（动物） | `animal_wolf`    | `狼`                       | `canister_small` |
| NPC（动物） | `animal_horse`   | `马`                       | `canister_small` |
| NPC（动物） | `animal_dog`     | `狗狗`                     | `canister_small` |

Dungeon（minion/boss 的生成池，`type` → `resourceKey=enemy_{type}`）：

| dungeonType | stage | adds（minion type 列表） | boss type（stage=4） | Icon_img                                       |
| ----------- | ----: | ------------------------ | -------------------- | ---------------------------------------------- |
| plains      |     1 | `tribal`                 |                      | `img/icons/tribal.jpg`                         |
| plains      |     2 | `orc`                    |                      | `img/icons/orc.jpg`                            |
| plains      |     3 | `tribal`, `orc`          |                      | `img/icons/tribal.jpg``img/icons/orc.jpg`      |
| plains      |     4 |                          | `giant`              | `img/icons/giant.jpg`                          |
| snow        |     1 | `yeti`                   |                      | `img/icons/yeti.jpg`                           |
| snow        |     2 | `yeti`                   |                      | `img/icons/yeti.jpg`                           |
| snow        |     3 | `yeti2`                  |                      | `img/icons/yeti2.jpg`                          |
| snow        |     4 |                          | `yeti2`              | `img/icons/yeti2.jpg`                          |
| desert      |     1 | `cactoro`                |                      | `img/icons/cactoro.jpg`                        |
| desert      |     2 | `dino`                   |                      | `img/icons/dino.jpg`                           |
| desert      |     3 | `cactoro`, `dino`        |                      | `img/icons/cactoro.jpg``img/icons/dino.jpg`    |
| desert      |     4 |                          | `dino`               | `img/icons/dino.jpg`                           |
| forest      |     1 | `frog`                   |                      | `img/icons/frog.jpg`                           |
| forest      |     2 | `monkroose`              |                      | `img/icons/monkroose.jpg`                      |
| forest      |     3 | `ninja`, `monkroose`     |                      | `img/icons/ninja.jpg``img/icons/monkroose.jpg` |
| forest      |     4 |                          | `mushroomking`       | `img/icons/mushroomking.jpg`                   |
| mine        |     1 | `skeleton`               |                      | `img/icons/skeleton.jpg`                       |
| mine        |     2 | `orc_skull`              |                      | `img/icons/orc_skull.jpg`                      |
| mine        |     3 | `skeleton_armor`         |                      | `img/icons/skeleton_armor.jpg`                 |
| mine        |     4 |                          | `skeleton_armor`     | `img/icons/skeleton_armor.jpg`                 |
| hellfire    |     1 | `zombie`                 |                      | `img/icons/zombie.jpg`                         |
| hellfire    |     2 | `zombie`                 |                      | `img/icons/zombie.jpg`                         |
| hellfire    |     3 | `zombie`                 |                      | `img/icons/zombie.jpg`                         |
| hellfire    |     4 |                          | `demon`              | `img/icons/demon.jpg`                          |

Dungeon 捕捉产出规则（当前实现）：

- Hub：捕捉任意目标 → `canister_small`
- Dungeon：捕捉 minion → `canister_medium`；捕捉 boss（`isBoss=true`）→ `canister_large`

补充：项目里已加载但当前未加入地牢生成池的敌人模型 `resourceKey`（后续可再决定是否进池）：

- `enemy_demon`
- `enemy_goblin`
- `enemy_hedgehog`
- `enemy_wizard`
- `enemy_zombie`

#### 3.3.2 背包/仓库 itemId 清单

说明：当前 UI 的背包/仓库格子图标路径统一按 `img/icons/{itemId}.png` 或 `img/icons/{itemId}.jpg` 约定。

| itemId            | 类别              | 堆叠规则 | 背包格子（w×h） | Icon_img                        | Icon_px 建议 |
| ----------------- | ----------------- | -------- | --------------- | ------------------------------- | ------------ |
| `coin`            | 货币              | Stack    | 1×1             | `img/icons/coin.jpg`            | 64×64        |
| `stone`           | 材料              | Instance | 1×1             | `img/icons/stone.png`           | 64×64        |
| `fence`           | 任务奖励/材料     | Instance | 1×1             | `img/icons/fence.png`           | 64×64        |
| `crystal_small`   | 地牢矿物          | Instance | 1×1             | `img/icons/crystal_small.jpg`   | 64×64        |
| `crystal_big`     | 地牢矿物          | Instance | 1×1             | `img/icons/crystal_big.jpg`     | 64×64        |
| `material_gun`    | 武器（主手）      | Instance | 1×2             | `img/icons/material_gun.jpg`    | 64×128       |
| `key_plains`      | 钥匙              | Stack    | 1×2             | `img/icons/key_plains.jpg`      | 64×128       |
| `key_snow`        | 钥匙              | Stack    | 1×2             | `img/icons/key_snow.jpg`        | 64×128       |
| `key_desert`      | 钥匙              | Stack    | 1×2             | `img/icons/key_desert.jpg`      | 64×128       |
| `key_forest`      | 钥匙              | Stack    | 1×2             | `img/icons/key_forest.jpg`      | 64×128       |
| `key_forest`      | 钥匙              | Stack    | 1×2             | `img/icons/key_mine.jpg`        | 64×128       |
| `key_forest`      | 钥匙              | Stack    | 1×2             | `img/icons/key_hellfire.jpg`    | 64×128       |
| `canister_small`  | 灵兽罐（小）      | Instance | 1×2             | `img/icons/canister_small.png`  | 64×128       |
| `canister_medium` | 灵兽罐（中）      | Instance | 2×2             | `img/icons/canister_medium.png` | 128×128      |
| `canister_large`  | 灵兽罐（大/Boss） | Instance | 3×3             | `img/icons/canister_large.png`  | 192×192      |
| `Axe_Wood`        | 工具/武器         | Instance | 1×2             | `img/icons/Axe.jpg`             | 64×128       |
| `Axe_Stone`       | 工具/武器         | Instance | 1×2             | `img/icons/Axe.jpg`             | 64×128       |
| `Axe_Gold`        | 工具/武器         | Instance | 1×2             | `img/icons/Axe.jpg`             | 64×128       |
| `Axe_Diamond`     | 工具/武器         | Instance | 1×2             | `img/icons/Axe.jpg`             | 64×128       |
| `Pickaxe_Wood`    | 工具/武器         | Instance | 1×2             | `img/icons/Pickaxe.jpg`         | 64×128       |
| `Pickaxe_Stone`   | 工具/武器         | Instance | 1×2             | `img/icons/Pickaxe.jpg`         | 64×128       |
| `Pickaxe_Gold`    | 工具/武器         | Instance | 1×2             | `img/icons/Pickaxe.jpg`         | 64×128       |
| `Pickaxe_Diamond` | 工具/武器         | Instance | 1×2             | `img/icons/Pickaxe.jpg`         | 64×128       |
| `Shovel_Wood`     | 工具/武器         | Instance | 1×2             | `img/icons/Shovel.jpg`          | 64×128       |
| `Shovel_Stone`    | 工具/武器         | Instance | 1×2             | `img/icons/Shovel.jpg`          | 64×128       |
| `Shovel_Gold`     | 工具/武器         | Instance | 1×2             | `img/icons/Shovel.jpg`          | 64×128       |
| `Shovel_Diamond`  | 工具/武器         | Instance | 1×2             | `img/icons/Shovel.jpg`          | 64×128       |
| `Sword_Wood`      | 工具/武器         | Instance | 1×2             | `img/icons/Sword.jpg`           | 64×128       |
| `Sword_Stone`     | 工具/武器         | Instance | 1×2             | `img/icons/Sword.jpg`           | 64×128       |
| `Sword_Gold`      | 工具/武器         | Instance | 1×2             | `img/icons/Sword.jpg`           | 64×128       |
| `Sword_Diamond`   | 工具/武器         | Instance | 1×2             | `img/icons/Sword.jpg`           | 64×128       |

#### 3.3.3 背包图标（新增：目标头像 icon）

本轮约定：`public/img/icons` 里新增的一批 `.jpg` 作为“头像 icon”，用于和现有道具 icon 叠加显示（两者都保留）。

背包内收容罐图标显示策略（确认版）：

- 底图：仍使用 `img/icons/{itemId}.png`（例如 `canister_small.png`）
- 角标：若收容罐带 `canisterMeta.capturedResourceKey` 且能找到对应头像，则在右上角叠加头像（圆角方或圆形均可）
- 回退：没有 meta 或找不到头像时，只显示底图
- 状态叠加（后续）：若处于“精疲力竭”，在底图上加灰度/暗角，并在角标旁加一个疲惫标记（与弹窗提示一致）

世界内提示策略（状态类）：

- 眩晕：头顶显示“大眩晕”SVG（独立资源），必要时可附带目标头像角标
- 精疲力竭：背包内用角标/灰度表达；世界内不强制显示

现有头像文件（文件名 → 对应目标）：

- `cat.jpg` → `animal_cat`
- `chicken.jpg` → `animal_chicken`
- `dog.jpg` → `animal_dog`
- `horse.jpg` → `animal_horse`
- `pig.jpg` → `animal_pig`
- `sheep.jpg` → `animal_sheep`
- `wolf.jpg` → `animal_wolf`
- `giant.jpg` → `enemy_giant`
- `skeleton.jpg` → `enemy_skeleton`
- `skeleton_armor.jpg` → `enemy_skeleton_armor`
- `yeti2.jpg` → `enemy_yeti2`
- `key.jpg` → 钥匙通用占位（后续可拆到 `key_plains` 等）

## 4. 事件与状态

### 4.1 事件（UI → World）

- `inventory:equip`：{ itemId }
- `input:lock_on`：鼠标中键触发锁定/解除（由 InputManager 广播）
- `combat:toggle_lock`：锁定目标的 Object3D（由 World 广播给相机 Rig）
- `combat:lock` / `combat:lock_clear`：锁定提示与 UI 状态（由 World 广播给 UI/后处理）
- `pet:equip_canister`：{ itemId }（可选：与 `inventory:equip` 合并；本轮规划把 `canister_*` 也视为可装备）
- `pet:throw_aim`：{ enabled }（进入/退出投掷瞄准态，用于显示抛物线）
- `pet:throw`：{ }（右键投掷确认）
- `pet:recall`：{ allyId? }（对跟随灵宠按 E 交互回收）
- `pet:recharge`：{ canisterItemId }（精疲力竭状态下用 coin 充能）

### 4.2 World 状态（最小）

- `equippedItemId`：当前装备道具（现阶段以灵兽石为主，itemId 仍为 `material_gun`）
- `lockedTarget`：当前锁定目标（动物/敌人）
- `laser`：激光线可视对象与命中状态
- `petCarry`：是否处于“抱起待投掷”状态（含当前收容罐与捕捉信息）
- `petTrajectory`：投掷抛物线预览（采样点/落点）
- `petExhausted`：收容罐是否为“精疲力竭”状态（需要 coin 充能）

## 5. 迭代顺序（Implementation Order）

1. 主控换模与动作对齐（确保不崩溃 + 基础移动/战斗输入可用）
2. 背包内新增灵兽石道具 + 装备/卸下 + 持枪 Pose
3. 锁定目标扩展到 Hub 动物与 Dungeon 敌人
4. 激光弹道可视化 + DoT 持续扣血
5. NPC 仇恨与攻击逻辑统一，并接入数值表

## 6. 回归口径

- 流程回归：加载 → Hub → 进地牢 → 出地牢
- 交互回归：B/H 打开背包/仓库；装备/卸下灵兽石；中键锁定/解除；激光伤害与仇恨追击
- 地牢回归：房间可连通到 Boss 与出口；至少 4 杂兵 + 1 Boss；出口标记可见且不被墙体遮挡

## 7. 验收走查清单（快速）

1. Hub 中装备 `material_gun` 后，水晶挂到右手，尺寸正常；主控保持 holding-both Pose（移动时权重降低但不突兀）
2. 中键锁定最近目标：相机进入锁定镜头，目标脚下出现红色圆环，屏幕出现暗角
3. 锁定时目标头顶显示血条；解除锁定时血条隐藏、暗角消失、圆环隐藏
4. 锁定目标死亡：自动解除锁定，不残留锁定视觉

## 8. 搜打撤融合（The Extraction Twist）

### 8.1 核心循环（The Loop）

将“搜打撤”的核心紧张感嵌入现有 Hub ↔ Dungeon 结构中，循环拆解为：

1. 备战（Base）：在 Hub 基地进行生产与整理，积累粮食、收容罐（Canister）、升级材料等
2. 潜入（Infiltration）：通过传送门进入线性地牢或开放地图
3. 决斗（Duel）：发现稀有怪 → 强制锁定（Lock-on）→ 1v1 拼刀将其削弱至可捕捉阈值
4. 捕捉（Capture）：目标虚弱 → 激光牵引（站桩风险）→ 目标转化为实体战利品
5. 撤离（Extraction）：背负战利品（负重惩罚 + 视觉高亮）→ 规避敌人 → 进入传送门结算

关键约束：

- 捕捉不是战斗的结束，而是风险的开始（带负重撤离才是结算点）
- 捕捉过程在代码层面是“Entity → Item → 视觉特效 → 仓库”的状态转换链

### 8.2 捕捉即“处决”（The Tether Mechanic）

捕捉是一个高风险的引导（Channeling）过程，核心变量与状态机如下。

当前实现（对照，便于验收与联调）：

- 捕捉范围：Hub 的 NPC、Dungeon 的 minion、Boss 都可捕捉
- 收容罐分档：NPC → `canister_small`；minion → `canister_medium`；boss → `canister_large`
- 产出位置：Hub 与 Dungeon 捕捉成功后都会在地面生成可拾取的收容罐（Canister）掉落
- 清理规则：Hub 中收容罐被拾取后，被捕捉目标会从场景中移除（避免残留导致后续锁定/交互错乱）

#### 前置条件（Check）

- 目标血量阈值：`TargetHP / TargetMaxHP < 15%`
- 目标硬直状态：`TargetState == Stunned`

#### 输入（Input）

- 玩家按住 `Q` 键进入捕捉引导

#### 引导状态（Channeling）

- Lock：玩家移动为 0；强制面向目标
- Visual：创建 Beam（光束）连接“枪口”与“怪物核心”
- Duration：持续 4.0 秒
- Interrupt：监听玩家受到伤害；一旦玩家掉血，立即中断引导，目标回血 10%

#### 转化（Transformation）

- 引导成功后，地面生成一个收容罐（Canister）模型：
  - 资产：`public/models/Environment/crystal3.glb`
  - 语义：实体战利品（可拾取/可背负/可入仓库）

### 8.3 负重与视觉化（Burden & Visualization）

目标：把负重后“背负战利品”的压力，显式体现在移动/冲刺/可见性上，并用 3D 方式表达，而不是堆更多 2D HUD。

#### 收容罐规格（待你确认）

| CanisterSize | 来源 | 背包占用（Grid） | 负重惩罚            | 视觉挂载（Visuals） |
| ------------ | ---- | ---------------: | ------------------- | ------------------- |
| Small        | 杂兵 |              1x2 | 无                  | 腰带后方            |
| Medium       | 精英 |              2x2 | 移速 -10%           | 背包侧面挂载        |
| Large        | Boss |              3x3 | 移速 -25%（禁冲刺） | 背部高亮挂载        |

本节实现依赖项（当前缺失）：

- 可触发的捕捉产出：地牢内生成 Canister，并能进入背包/仓库
- 背包“占格”模型：否则无法对齐 Small/Medium/Large 的格子语义

当前实现（对照）：

- 捕捉产出：已实装（捕捉成功后在地面生成可拾取的收容罐战利品；拾取时若背包放不下会提示并保持掉落）
- 负重惩罚：已实装（中/大收容罐会影响移速与冲刺）
- 3D 视觉挂载：已实装（方案 A：背部挂载并堆叠显示；当前外观使用 Crystal 模型资源占位）
- 背包占格：已实装（8x6 网格、支持拖拽与旋转，可配置物品尺寸）

下一轮需要补齐的“闭环”差异（你现在感知到的缺失点主要在这里）：

- Canister 目前只区分 Small/Medium/Large 三个道具 ID，没有进一步细分“Boss 专属罐”的外观层差异（可后置）
- 捕捉过程缺少进度 UI（读条/取消提示），失败原因也没有可视化（当前仅提供条件满足时的提示语）

#### 视觉策略（不做结论，列候选实现口径）

- 方案 A：将 Canister 作为 3D 模型挂到玩家骨骼/背部挂点，并允许堆叠显示
- 方案 B：不挂到骨骼，改为玩家头顶“战利品队列”漂浮堆叠（更易读，但更游戏化）

堆叠规则（意图）：

- 若已有 Canister，新 Canister 沿玩家背向（局部 Z）向外偏移，形成“叠罗汉”效果

### 8.4 灵兽出战（跟随 + 护主）

目标：让“收容罐投掷出战”的灵兽更贴近 MMORPG 宠物的默认行为：非战斗时跟随主控；当主控受到威胁时主动参战。

#### 8.4.1 装备与抱起（从背包开始）

目标流程：

路径 A（背包）：

1. 打开背包，点击某个 `canister_*`
2. 点击 **装备**（与 `material_gun` 交互一致）
3. 主控进入“抱起待投掷”状态：HUD 显示“右键投掷”

路径 B（快捷 HUD）：

1. 右下角显示固定 5 格的 **收容罐快捷栏**
2. 直接点击某一格，进入“抱起待投掷”状态（等价于背包 **装备**）
3. 若背包内收容罐超过 5 个，右侧出现 ▶，长按可翻到第 6–10 个（最多携带 10 个）

#### 8.4.2 抛物线预览（投掷瞄准态）

目标：在“抱起待投掷”期间显示抛物线，帮助理解投掷方向与落点，并允许用鼠标视角调整。

- 输入：跟随主控相机方向更新（不锁定到单一敌人）
- 表现：地面落点标记 + 空中点状采样轨迹（优先）或线段（回退）
- 落点规则：遇到墙体/地面时截断，以第一个命中的点作为落点

#### 8.4.3 右键投掷与眩晕（投掷后双方眩晕 3s）

投掷确认：右键触发投掷。

投掷结果：

- 灵宠落地后进入 3 秒眩晕
- 若投掷过程中发生物理碰撞并命中敌人：被命中的敌人也进入 3 秒眩晕

眩晕表现（最小口径）：

- 动画：优先播放 `Stun`/`Dizzy` 类 clip；没有则回退到 `Idle` 并禁用移动与攻击
- 头顶提示：显示一个“大眩晕”SVG（后续可替换成更拟物的 VFX）

#### 8.4.4 E 交互回收（灵宠 → 收容罐）

非战斗跟随的灵宠，靠近后按 E 打开交互选项，提供 **收容**：

- 结果：灵宠从世界中移除，背包增加对应 `canister_*`（保留 `canisterMeta`）

#### 8.4.5 精疲力竭与充能（回罐后需要 coin）

当灵宠“战败回罐并以可拾取形式掉落”后，回到背包的该收容罐进入 **精疲力竭**：

- 行为：点击 **装备** 或点击快捷 HUD 的该格时，弹窗询问是否消耗 `1×coin` 充能
  - **是**：扣除 1 coin，收容罐恢复为可装备/可投掷状态
  - **否**：不变化，关闭弹窗

验收口径：

- 精疲力竭时无法进入“抱起待投掷”（不应允许继续投掷出战）
- 充能成功后，背包角标灰度解除，并恢复可装备/可投掷

#### 8.4.6 传送跟随（跨 Hub/地牢）

规则：玩家传送去其他地牢或返回 Hub 时，已出战/跟随的灵宠会跟随主控一起传送，并保持跟随状态。

## 9. UI/UX：沉浸式设计（Diegetic Interface）

目标：降低“手游感”，减少 2D HUD 占比，让 UI 成为世界的一部分（拟物化/3D 化/贴合角色）。

### 9.1 3D 拟物化状态栏（The Heart Meter）

用一颗真实跳动的心脏代替平面血条。

#### 设计变量（待你确认）

- 资产：`Heart.glb`（你目前提到的“Low Poly 风格”心脏）
- 频率：`BPM = 60 + (100 - CurrentHP) * 2`（此公式是否以 100 为满血上限，需要你确认当前工程 HP 标度）
- 低血量阈值：`HP < 30%` 时切换“破碎/黑暗”贴图，并触发相机抖动

#### 实现口径（Web 对应点，需你确认取舍）

- 渲染容器：在 HUD 内渲染一个独立的 3D 视口（副相机 + 单独 scene），输出到 UI 容器
- 动画驱动：按帧更新时间（等价于 RenderStepped），用正弦缩放/材质切换/抖动控制

### 9.2 网格背包系统（Tetris Inventory）

目标：将“取舍”作为搜打撤的核心体验：当玩家拾取 2x2 的收容罐但背包满时，必须通过移动/旋转/丢弃来腾挪。

#### 数据结构（The Grid Model）

- `GridCols = 8`, `GridRows = 6`
- `Cells[x][y]`：存储 `ItemID | null`
- `Items[itemInstanceId]`：记录物品矩形信息 `{ itemId, w, h, x, y, rot }`

#### 交互逻辑（Interaction）

- Drag：拖拽物品跟随鼠标
- Ghost Preview：网格上显示半透明影子
  - 绿色：`CanFit()` 为 true
  - 红色：`CanFit()` 为 false（越界或重叠）
- Rotate：拖拽时按 `R` 交换宽高（并影响 `CanFit()`）

当前实现（对照）：

- 网格渲染：已实装（B 打开背包后显示 8x6 网格）
- 拖拽与旋转：已实装（拖拽摆放；拖拽中按 R 旋转）
- Ghost Preview：已实装（绿色/红色可放置提示）
- 不规则形状：已实装（网格边角不可用格）
- 物品 SVG/图标：已实装（金币/钥匙/收容罐/灵兽石）
- 布局持久化：已实装（摆放位置会随存档保存与加载）

#### 约束（需你确认）

- 物品是否区分“堆叠数量”（例如 1x1 的材料可叠加）与“不可叠加的实体”（例如 Canister）
- 背包与仓库是否都改为网格，还是仅背包网格、仓库保持列表

### 9.3 先把占格做成“可调的规则”，再谈具体数值（你给的尺寸方案在这里落地）

本节的目标是：让占格不再是“每个道具都 1 格”，而是由一个可扩展的规格表驱动。实现时不需要改 UI 交互（拖拽/旋转/预览/持久化沿用现有），只需要让 World 的 `itemSizes` 覆盖更多道具。

#### 9.3.1 物品分两类：堆叠（Stack）与实例（Instance）

- 堆叠（Stack）：数量叠加，默认在列表区显示 `xN`，网格里只放 1 个“代表格”
  - 例：金币、材料、钥匙（如果你愿意也可以把钥匙做成 Instance）
- 实例（Instance）：每一个都是独立实体，需要占格、能旋转、能丢弃、能作为掉落物
- 例：灵兽石、收容罐、宝箱掉落的剑/镐/斧

推荐：钥匙先做 Stack（体验更顺），等你确认要“钥匙也占空间压力”再切 Instance。

### 9.4 收容罐快捷栏（右下角 5 格）

目标：让投掷出战的选择更接近“即时切换”，减少反复打开背包的频率。

- 固定 5 格：只展示“背包中当前可用”的收容罐
- 翻页：若超过 5 个，显示 ▶，长按滚动查看第 6–10 个（最多 10 个）
- 精疲力竭：该格显示灰度/暗化，点击触发充能弹窗

#### 9.3.2 推荐占格（你的想法泛化后的第一版）

背包基准：`8x6`（带不规则 Mask），允许旋转。

| 类别          | 示例 itemId                                    | 建议占格 (w×h) | 是否允许旋转 | 备注                                                              |
| ------------- | ---------------------------------------------- | -------------: | :----------: | ----------------------------------------------------------------- |
| 货币          | `coin`                                         |            1×1 |      否      | Stack，网格里只放 1 个代表格                                      |
| 钥匙          | `key_plains` 等                                |            1×2 |      是      | 若保持 Stack，则网格代表格 1×2；若改 Instance，则每把钥匙单独占格 |
| 武器（主手）  | `material_gun`                                 |            2×4 |      是      | 你的设想：视觉上更像“长物件”                                      |
| 工具/武器掉落 | `Sword_*` / `Axe_*` / `Pickaxe_*` / `Shovel_*` |            2×4 |      是      | 第一版统一 2×4，后续再区分长短                                    |
| 灵兽罐（小）  | `canister_small`                               |            1×2 |      是      | 作为“轻量战利品”，给背包带来轻压力                                |
| 灵兽罐（中）  | `canister_medium`                              |            2×2 |      是      | 把“抓到一只怪”的空间压力做得更明显                                |
| Boss 罐（大） | `canister_large`                               |            3×3 |      否      | 不允许旋转，减少“摆法花活”带来的学习成本                          |

你后续如果要增加“稀有武器更长/更大”的表达，只需要在这张表里改一行，不需要改 UI。

#### 9.3.3 背包满了怎么办：让规则决定结果

当拾取/捕捉产出一个物品时：

- 若是 Stack：按堆叠规则进入背包（不占新增格，或只占代表格）
- 若是 Instance：必须能在网格里找到可放置位置（允许旋转）才进入背包
- 放不下：掉落在地（或自动入仓库，取决于你想要“搜打撤压力”还是“便捷”）

推荐：地牢内优先掉落在地；Hub 内可配置为自动入仓库（降低挫败感）。

## 10. 迭代版本计划（vNext）

本节仅做“版本切片与验收口径”的拆分，不在此做实现方案定案。若其中任何切片与你的优先级不一致，请你直接调整顺序或删改。

### 10.1 版本切片

#### vNext-A：Extraction 闭环（最小可玩）

- 目标：Hub 备战 → 进地牢 → 决斗削弱 → Q 引导捕捉 → 生成 Canister → 撤离结算（回到 Hub）
- 必须打通的状态链：`Entity(怪物)` → `Captured(Item)` → `WorldDrop(可拾取)` → `Inventory(网格占用)` → `Warehouse/结算`
- 失败/中断路径：引导中受击中断（玩家掉血）→ 捕捉失败 → 目标回血 10% → 可再次进入决斗

#### vNext-B：负重表达（惩罚 + 视觉）

- 目标：背负 Canister 后，移速/冲刺规则生效；Canister 可视化挂载可被清晰识别
- 验收重点：玩家在撤离路上“更难逃”，且队友/旁观者一眼能看出负重状态

#### vNext-C：UI/UX 拟物化升级（先做心脏，再做网格背包）

- 目标：Heart Meter 3D 化（跳动/低血量破碎/抖动）；背包切换为网格拖拽 + 旋转
- 风险点：网格背包的拖拽与数据持久化、与现有背包系统的兼容层

#### vNext-D：灵宠投掷交互 + 背包图标 + 环境视觉替换

- 目标：把灵宠交互更新为“背包装备 → 自动关包 → 抱起 → 抛物线预览 → 右键投掷 → 眩晕”，并补齐回收/充能/随传送等闭环；同时替换地形方块模型与 Hub 树模型
- 交互链路：
  - 收容罐装备：与灵兽石一致的 **装备** 按钮
  - 抛物线预览：抱起状态可见、随视角更新、落点可解释
  - 眩晕：投掷命中后灵宠与命中敌人眩晕 3 秒（头顶眩晕 SVG）
  - 回收：跟随灵宠靠近按 E 收容回罐
  - 精疲力竭：战败回罐后需消耗 `1×coin` 充能才能再次装备投掷
  - 传送跟随：跨地牢/Hub 切换时灵宠随主控传送
- 背包图标：收容罐底图为 `img/icons/{itemId}.png`，右上角叠加 `public/img/icons/*.jpg` 头像（基于 `capturedResourceKey`）
- 环境视觉：
  - Terrain 方块从默认 Box/材质替换为 `public/models/cube` 的 gltf
  - Camazots（Hub）地表植被（草/花）从“贴图交叉面片”替换为 **GLTF 模型实例化渲染**
    - 无碰撞（可穿过）：grass / flower / plant 类
    - 有碰撞（会挡路）：tree / rock / bush / crystal / mineral 类
  - Hub 树模型替换为 `public/models/Environment` 与 `public/models/Environment/with_entity` 的树资源，按区域/群系随机混用（与可见性、性能兼容）

植被资源分组（策划口径）：

- 第一批（单文件 GLTF，部分内嵌贴图）
  - 无碰撞：`Environment/Bush.gltf`、`Flowers_1.gltf`、`Flowers_2.gltf`、`Grass_Big.gltf`、`Grass_Small.gltf`、`Plant_2.gltf`、`Plant_3.gltf`
  - 有碰撞：`Environment/Rock1.gltf`、`Rock2.gltf`、`Tree_1.gltf`、`Tree_2.gltf`、`Tree_3.gltf`、`Tree_4.gltf`、`Tree_Fruit.gltf`、`Bamboo_Small.gltf`、`Bamboo_Mid.gltf`
- 第二批（no_entity：`*.gltf + *.bin + forest_texture.png` 组合）
  - 无碰撞：草类/地被类的变体库（用于丰富地表随机）
- 第三批（with_entity：`*.gltf + *.bin + forest_texture.png` 组合）
  - 有碰撞：灌木/岩石/树等实体库（用于作为阻挡物与空间分割）

碰撞规则（实现口径）：

- grass/flower/plant：仅用于视觉，默认 **不写入任何碰撞体积**
- tree/rock/bush/crystal/mineral：在生成时同步写入“不可见碰撞体积”（以体素方块/简化碰撞为准），保证主控/NPC/敌人/灵兽都能被阻挡

Camazots 随机生成策略（实现口径）：

- 地表草/花：从 `flora` 生成（plantId），渲染层用“模型池 + 权重 + 密度抽样”替换贴图草（必须覆盖第一批 + 第二批）
- 有碰撞的植被/地物：从树生成逻辑的“模型池”混入（Environment Tree/Bamboo + with_entity Bush/Rock），并用 `colliderRadius/colliderHeight` 写入简化体素碰撞（必须覆盖第一批 + 第三批）

建议配比（可调，但先给一个稳定的默认）：

- 无碰撞地表（草/花）：第二批 no_entity 约 40%，第一批 Environment 草/花/Plant 约 60%
- 有碰撞地物（树/竹/灌木/岩石）：第一批 Environment Tree/Bamboo 约 60%，第三批 with_entity Bush/Rock 约 40%

### 10.2 关键待确认（需要你拍板，不在本文代你定）

1. HP 标度：`CurrentHP` 与满血基准是 5/10/100 还是别的？（关系到 BPM 与阈值）
2. 捕捉触发：`TargetState == Stunned` 的“硬直”定义来源（战斗系统里哪个状态能作为判据）
3. Beam 语义：捕捉 Beam 与现有“灵兽石激光 DoT”的 Beam 是否复用同一个渲染对象/管线
4. Canister 资产：`crystal3.glb` 的最终路径与命名是否固定（以及是否需要 Small/Medium/Large 三种外观）
5. 网格背包范围：只改背包，还是背包+仓库一起改；是否允许材料堆叠
