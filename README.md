# 四向穿梭车轨道微调与滑触线供电状态同步系统

> 为制造厂密集型多层料盘货架开发的 **数字孪生监控系统**
> 
> 后端：**Java Spring Boot 3.2 + MySQL / H2 + WebSocket**
> 前端：**Vue 3 + Babylon.js (WebGL) 3D 数字孪生大屏**

---

## 一、项目架构

```
┌─────────────────────────────────────────────────────────────┐
│                    前端数字孪生大屏 (5173)                   │
│  ┌───────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │ 系统总览  │   │  Babylon.js 3D   │   │ 穿梭车列表    │  │
│  │(统计卡片) │   │  货架矩阵渲染    │   │ (状态/电量)   │  │
│  └───────────┘   │  穿梭车轨迹动画  │   └────────────────┘  │
│        │         └──────────────────┘            │          │
│        │  Pinia Store (响应式状态)                │          │
│        └────────────────────┬─────────────────────┘          │
│                             │  WebSocket / REST              │
└─────────────────────────────┼───────────────────────────────┘
                              │ /api/ws/rack
┌─────────────────────────────┼───────────────────────────────┐
│              后端服务 (8080)  │ (Spring Boot 3 + JPA)        │
│   ┌─────────────────────────▼───────────────────────────┐   │
│   │              WebSocketHandler (广播)                 │   │
│   │  SHUTTLE_UPDATE / SHUTTLE_LIST / SYSTEM_STATUS      │   │
│   └─────────────────────────┬───────────────────────────┘   │
│                             │                               │
│   ┌─────────────────────────▼───────────────────────────┐   │
│   │   ShuttleCarService  │  TrackOccupancyService       │   │
│   │   穿梭车坐标/电量     │  轨道占用表/防冲突           │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │   PowerLineService   │  SystemStatusService         │   │
│   │   滑触线电压/温度     │  汇总统计/分层状态           │   │
│   └─────────────────────────┬───────────────────────────┘   │
│                             │  定时调度器                   │
│   ┌─────────────────────────▼───────────────────────────┐   │
│   │     ShuttleSimulationScheduler (500ms间隔模拟)       │   │
│   │     自动生成穿梭车移动数据 + 滑触线波动数据          │   │
│   └─────────────────────────┬───────────────────────────┘   │
│                             │ JPA/Hibernate                 │
└─────────────────────────────┼───────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   MySQL 8.0 / H2   │
                    │  shuttle_rack DB   │
                    └────────────────────┘
```

---

## 二、目录结构

```
ch9/
├── backend/                                    # Spring Boot 后端
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/shuttle/rack/
│       │   ├── ShuttleRackApplication.java        # 启动类
│       │   ├── config/
│       │   │   ├── RackConfig.java                # 货架尺寸配置
│       │   │   └── WebSocketConfig.java           # WebSocket 注册
│       │   ├── controller/
│       │   │   ├── ShuttleCarController.java      # 穿梭车CRUD API
│       │   │   ├── TrackOccupancyController.java  # 轨道占用 API
│       │   │   ├── PowerLineController.java       # 滑触线 API
│       │   │   └── SystemStatusController.java    # 系统状态 API
│       │   ├── dto/
│       │   │   ├── ShuttlePositionUpdateDTO.java  # 坐标/状态更新DTO
│       │   │   ├── SystemStatusDTO.java           # 系统状态DTO
│       │   │   └── WebSocketMessageDTO.java       # WS消息包装
│       │   ├── entity/
│       │   │   ├── enums/
│       │   │   │   ├── Direction.java             # 方向枚举
│       │   │   │   └── ShuttleStatus.java         # 状态枚举
│       │   │   ├── ShuttleCar.java                # 穿梭车实体
│       │   │   ├── TrackOccupancy.java            # 轨道占用实体
│       │   │   └── PowerLine.java                 # 滑触线实体
│       │   ├── repository/                        # JPA Repository
│       │   ├── scheduler/
│       │   │   └── ShuttleSimulationScheduler.java# 模拟调度器
│       │   ├── service/
│       │   │   ├── ShuttleCarService.java
│       │   │   ├── TrackOccupancyService.java
│       │   │   ├── PowerLineService.java
│       │   │   ├── SystemStatusService.java
│       │   │   └── DataInitializer.java           # Demo数据初始化
│       │   └── websocket/
│       │       └── RackWebSocketHandler.java      # WS处理器+广播
│       └── resources/
│           ├── application.yml                     # 默认配置(MySQL)
│           ├── application-dev.yml                 # 开发配置(H2内存库)
│           └── db/schema.sql                        # MySQL建表脚本
│
└── frontend/                                   # Vue3 + Babylon.js 前端
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js                                 # Vue入口
        ├── App.vue                                 # 主页面(大屏布局)
        ├── styles/global.scss                      # 全局样式
        ├── store/rackStore.js                      # Pinia状态管理
        ├── services/
        │   └── websocketService.js                 # WS客户端(重连+心跳)
        ├── components/
        │   └── RackScene.vue                       # 3D场景组件
        └── engine/
            └── RackSceneEngine.js                  # Babylon.js引擎
                                                    # (货架/轨道/小车渲染)
```

---

## 三、核心特性

### 3.1 后端核心能力

| 模块 | 能力说明 |
|------|---------|
| **穿梭车管理** | 维护多台穿梭车的三维坐标 (x, y, layer)、电量、速度、载重、滑触线供电状态、轨道微调偏移量 |
| **轨道占用表** | 以 (x, y, layer) 为唯一键的轨道占用矩阵，防碰撞冲突检测，充电站/升降机特殊标记 |
| **滑触线监控** | 每层 X/Y 双轴滑触线回路的电压、电流、温度、接触电阻、磨损度实时监控 |
| **WebSocket广播** | 500ms 粒度实时推送 SHUTTLE_UPDATE、SYSTEM_STATUS 消息给所有前端大屏 |
| **REST API** | 完整的穿梭车 CRUD、轨道查询、滑触线管理、系统配置接口 |
| **模拟调度器** | 开箱即用的 Demo 模拟器：自动生成8台穿梭车随机移动轨迹 + 滑触线波动数据 |

### 3.2 前端3D数字孪生

| 特性 | 说明 |
|------|------|
| **货架矩阵** | Babylon.js 程序化生成 5×8×3 多层货架 + 金属立柱横梁 + 货物箱随机渲染 |
| **穿梭车模型** | PBR金属车身 + 轮子/天线/传感器/LED灯，8色循环分配，状态LED实时变色 |
| **轨道系统** | X/Y双向交叉金属滑轨 + 金色滑触线供电母线(带辉光特效) |
| **轨迹动画** | 坐标更新驱动贝塞尔缓动动画，精准还原搬运路径；方向控制车身旋转 |
| **交互操作** | ArcRotateCamera 环绕视角、点击穿梭车聚焦、充电站/升降机高亮 |
| **后处理特效** | Bloom辉光 + FXAA抗锯齿 + 指数阴影贴图 + GlowLayer发光层 |
| **UI信息面板** | 系统总览卡片、分层占用条、穿梭车列表、告警区、滑触线参数矩阵 |

---

## 四、快速启动

### 前置环境

| 依赖 | 版本要求 |
|------|---------|
| JDK | 17+ |
| Maven | 3.8+ |
| Node.js | 18+ |
| MySQL | 8.0+ (可选，默认H2内存库) |

### 4.1 启动后端 (Spring Boot)

```bash
cd backend

# 方式1：使用默认开发配置(H2内存库，无需MySQL)
mvn spring-boot:run

# 方式2：使用MySQL (需要先执行 schema.sql)
# 修改 application.yml 数据库账号密码，然后：
mvn spring-boot:run -Dspring-boot.run.profiles=prod
```

后端启动后：
- REST API 根路径：`http://localhost:8080/api/`
- WebSocket 端点：`ws://localhost:8080/api/ws/rack`
- H2 Console (dev)：`http://localhost:8080/api/h2-console`

### 4.2 启动前端 (Vue 3)

```bash
cd frontend

# 安装依赖
npm install
# 或
pnpm install

# 启动开发服务器
npm run dev
```

访问 `http://localhost:5173` 即可看到数字孪生大屏。

> Vite 已配置代理：
> - `/api/*` → `http://localhost:8080` (REST API)
> - `/ws/*`  → `ws://localhost:8080` (WebSocket)

---

## 五、API 速查

### 5.1 穿梭车接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/shuttles` | 查询全部穿梭车 |
| GET | `/api/shuttles/{id}` | 按ID查询 |
| GET | `/api/shuttles/code/{carCode}` | 按车号查询 |
| GET | `/api/shuttles/positions` | 获取所有车的坐标DTO |
| GET | `/api/shuttles/status/{status}` | 按状态查询 |
| POST | `/api/shuttles` | 新增穿梭车 |
| PUT | `/api/shuttles/position` | 更新坐标+状态 (触发WS广播) |
| PUT | `/api/shuttles/{id}/status` | 仅更新状态 |
| DELETE | `/api/shuttles/{id}` | 删除穿梭车 |
| GET | `/api/shuttles/alerts/low-battery` | 低电量告警列表 |
| GET | `/api/shuttles/alerts/power-issue` | 滑触线供电异常列表 |

### 5.2 轨道/滑触线接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tracks` | 全部轨道节点 |
| GET | `/api/tracks/layer/{layer}` | 按层查询轨道 |
| GET | `/api/tracks/position?x=&y=&layer=` | 单节点查询 |
| GET | `/api/tracks/stats` | 占用/货物统计 |
| GET | `/api/powerlines` | 全部滑触线回路 |
| GET | `/api/powerlines/stats` | 供电统计 |
| GET | `/api/powerlines/faulty` | 故障滑触线 |

### 5.3 系统接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/system/status` | 完整系统状态(前端首次拉取) |
| GET | `/api/system/config` | 货架尺寸/WS端点配置 |
| GET | `/api/system/ws/sessions` | 当前WS连接数 |
| POST | `/api/system/ws/broadcast/status` | 手动触发WS状态广播 |

### 5.4 WebSocket 消息格式

**Client → Server**
```json
{ "type": "PING",                        "timestamp": 1718496000000 }
{ "type": "REQUEST_SHUTTLE_LIST",        "payload": {} }
{ "type": "REQUEST_SYSTEM_STATUS",       "payload": {} }
```

**Server → Client**
```json
// 连接成功
{ "type": "CONNECTED",     "payload": "连接成功，会话ID: xxx", "timestamp": "..." }

// 全量穿梭车列表(刚连上时)
{ "type": "SHUTTLE_LIST",  "payload": [{ "carCode":"SH-001", "posX":0, "posY":0, ... }], ... }

// 单台穿梭车增量更新 (每500ms广播)
{ "type": "SHUTTLE_UPDATE",
  "payload": {
    "carCode": "SH-002", "posX": 3, "posY": 2, "posLayer": 0,
    "direction": "EAST", "status": "MOVING",
    "batteryLevel": 78.3, "powerSupplyOk": true,
    "trackAlignmentOffset": 0.42, "speed": 2.15
  }, "timestamp": "2024-06-15T10:30:00" }

// 系统状态统计 (每3s广播)
{ "type": "SYSTEM_STATUS", "payload": { "totalShuttles": 8, ... }, ... }
```

---

## 六、状态枚举说明

| ShuttleStatus | 含义 | LED颜色 |
|---------------|------|---------|
| IDLE | 空闲 | 🟢 绿 |
| MOVING | 行驶中 | 🔵 蓝 |
| LOADING / UNLOADING | 装卸货 | 🟡 黄 |
| CHARGING | 充电中 | 🔷 青 |
| ERROR | 故障 | 🔴 红 |
| OFFLINE | 离线 | ⚪ 灰 |

---

## 七、生产部署建议

1. **数据源切换**：将 `application.yml` 的 `spring.profiles.active` 改为 `prod`，配置真实 MySQL 连接
2. **关闭模拟**：`shuttle.simulation.enabled: false`，由真实穿梭车硬件/PLC通过 MQTT → 后端 → WebSocket 推送坐标
3. **集群部署**：使用 Redis Pub/Sub 或 STOMP 替代单实例广播，实现多后端节点间的状态同步
4. **安全加固**：WS 加 Token 鉴权、接口加 Spring Security、跨域白名单限制
5. **持久化**：坐标变化写入 InfluxDB / TDengine 时序库，供后续轨迹回放与分析

---

© 2026 制造厂智慧物流项目组
