# Might & Magic: 3rd_MC 技术开发行动纲领 (Technical Action Plan)

> **目标**: 将 Project Plan 中的高层规划转化为可执行的低层代码任务清单。
> **原则**: 每一个 Task 对应一个具体的 Git Commit。

---

## 🟢 Phase 1: 世界基建 (World Infrastructure)

此阶段核心在于建立高性能的“数据驱动”地形系统，为后续扩展打下基础。

### 1.1 噪声工具库 (Noise Library)
- **文件**: `src/js/tools/noise.js`
- **任务**:
    - [ ] 移植/实现 `Perlin` 噪声算法 (基于 `perm` 数组查表)。
    - [ ] 实现 `FBM (Fractal Brownian Motion)` 函数。
        - **输入**: `x, y, z, octaves, persistence, lacunarity`
        - **输出**: `float (-1.0 ~ 1.0)`
- **验收**: 调用 `fbm(0,0)` 返回稳定数值；不同坐标返回平滑过渡数值。

### 1.2 地形数据管理器 (Terrain Data Manager)
- **文件**: `src/js/world/terrain-data-manager.js`
- **类**: `TerrainDataManager` (Singleton or Instance in Experience)
- **任务**:
    - [ ] **初始化**: 接收 `seed`, `size` (100), `resolution` (1) 参数。
    - [ ] **数据生成**: `generateMapData()`
        - 遍历 `x: -50~50`, `z: -50~50`。
        - 计算 `height = fbm(x * scale, z * scale)`.
        - 映射颜色:
            - `height < -0.2`: `0x22aadd` (Water)
            - `-0.2 < h < 0`: `0xddeebb` (Sand)
            - `0 < h < 0.8`: `0x55aa55` (Grass)
            - `h > 0.8`: `0xffffff` (Snow)
        - 存储为 `Float32Array` 或对象数组 `[{x,y,z,color}, ...]`.
- **验收**: `console.log` 打印出的数据结构符合预期，包含坐标与颜色信息。

### 1.3 实例化地形渲染 (Instanced Terrain Renderer)
- **文件**: `src/js/world/terrain.js`
- **任务**:
    - [ ] **废弃旧逻辑**: 移除原有的 `Mesh` + `ShaderMaterial` 平面方案。
    - [ ] **创建 InstancedMesh**:
        - `geometry`: `BoxGeometry(1, 1, 1)` (或根据高度拉伸 y).
        - `material`: `MeshStandardMaterial` (支持光照).
        - `count`: `100 * 100`.
    - [ ] **设置矩阵与颜色**:
        - 遍历 `TerrainDataManager` 的数据。
        - `dummy.position.set(x, height/2, z)`
        - `dummy.scale.set(1, height, 1)` (如果做成柱状) 或 `(1, 1, 1)` (阶梯状)。
        - `mesh.setMatrixAt(i, dummy.matrix)`
        - `mesh.setColorAt(i, new THREE.Color(color))`
    - [ ] **优化**: 水面单独处理（平面或另一层 InstancedMesh）。
- **验收**: 场景中出现 100x100 的彩色方块地形，帧率稳定 60fps。

### 1.4 小地图组件 (MiniMap Component)
- **文件**: `src/components/MiniMap.vue`
- **任务**:
    - [ ] **Canvas 绘制**:
        - 获取 `TerrainDataManager` 数据。
        - 遍历数据，在 Canvas 上 `ctx.fillStyle = color`, `ctx.fillRect(x, z, 1, 1)`.
    - [ ] **玩家标记**:
        - 监听 `mitt` 事件 `player:move`。
        - 在 Canvas 中心或对应坐标绘制红色箭头/圆点。
- **验收**: 左上角显示像素风格地形图，玩家移动时标记同步移动。

---

## 🟡 Phase 2: Hub 交互与传送 (Hub & Portals)

### 2.1 玩家控制器 (Player Controller)
- **文件**: `src/js/world/player.js`
- **任务**:
    - [ ] **模型加载**: 加载 `steve.glb` 或替代模型。
    - [ ] **物理碰撞**:
        - 简单方案：读取 `TerrainDataManager` 中当前 (x, z) 的高度 `h`。
        - `player.y = Math.max(player.y, h + playerHeight)`.
    - [ ] **移动逻辑**: WASD 控制方向与速度。

### 2.2 传送门系统 (Portal System)
- **文件**: `src/js/world/portal.js`
- **任务**:
    - [ ] **几何体**: `PlaneGeometry` 作为入口。
    - [ ] **Shader**: 移植 Shadertoy 漩涡效果到 `PortalMaterial`。
    - [ ] **触发检测**:
        - 在 `update()` 中检测 `player.position` 与 `portal.position` 距离。
        - `dist < 1.5` 触发传送事件。

### 2.3 世界切换管理器 (World Switching)
- **文件**: `src/js/experience.js`
- **任务**:
    - [ ] `switchWorld(worldId)`:
        - `this.world.destroy()` (清理当前场景资源).
        - `this.resources.load(worldId_assets)`.
        - `this.world = new DungeonWorld()` (或其他子类).
- **验收**: 走进传送门 -> 屏幕黑屏/Loading -> 加载进入新场景。

---

## 🔴 Phase 3: 战斗核心 (Combat Core)

### 3.1 锁定系统 (Lock-on System)
- **文件**: `src/js/utils/input.js`, `src/js/camera/camera-rig.js`
- **任务**:
    - [ ] **射线检测**: 屏幕中心射线检测敌人 Tag。
    - [ ] **输入绑定**: 中键 (Middle Mouse) 触发锁定。
    - [ ] **相机行为**:
        - 状态机新增 `LOCKED` 状态。
        - `camera.lookAt` 平滑插值指向 `(player + enemy) / 2`.
    - [ ] **视觉反馈**: 屏幕四周 Vignette (暗角) Shader 强度增加。

### 3.2 战斗状态机 (Combat FSM)
- **文件**: `src/js/world/player.js`
- **状态**:
    - `IDLE`: 待机
    - `ATTACK_L`: 左键轻击 (播放动画 A/B/C)
    - `ATTACK_H`: 右键重击 (播放蓄力动画)
    - `BLOCK`: 按住 C 防御
    - `HIT`: 受击硬直
    - `DEAD`: 死亡
- **判定**:
    - 攻击帧触发时，检测前方扇形区域内的敌人。

---

## 🔵 Phase 4: UI 与 商业化 (UI & Polish)

### 4.1 HUD 系统
- **文件**: `src/js/world/ui/heart.js`, `src/js/world/ui/stamina.js`
- **任务**:
    - [ ] **3D 血条**: 实例化 3-5 个心形模型，挂载在相机前方或屏幕空间。
    - [ ] **破碎效果**: 扣血时替换模型或播放破碎动画。

### 4.2 交互弹窗
- **文件**: `src/components/StoryModal.vue`
- **任务**:
    - [ ] 接收 `title`, `content`, `image` props。
    - [ ] 出现时暂停 `Experience.time`。

---

## ⚠️ 开发注意事项

1. **Git 规范**:
   - `feat: implement noise generator`
   - `fix: adjust portal trigger radius`
   - **严禁提交**: `node_modules`, `dist`, `.DS_Store`.

2. **性能红线**:
   - DrawCalls < 100 (大量使用 InstancedMesh).
   - 纹理尺寸控制在 1024x1024 以内。

3. **资源管理**:
   - 所有 glb/texture 必须在 `src/js/sources.js` 注册。
