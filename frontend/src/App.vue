<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
            <path d="M3 7h18v10H3z" stroke="#409eff" stroke-width="2" stroke-linejoin="round"/>
            <path d="M7 3v4M17 3v4M7 21v-4M17 21v-4" stroke="#409eff" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="12" r="2" fill="#00d4ff"/>
          </svg>
        </div>
        <div class="header-titles">
          <h1 class="app-title">四向穿梭车货架数字孪生系统</h1>
          <div class="app-subtitle">
            SHUTTLE RACK DIGITAL TWIN · 轨道微调 & 滑触线供电同步监控
          </div>
        </div>
      </div>

      <div class="header-center">
        <div class="stat-row">
          <div class="mini-stat" v-for="s in topStats" :key="s.label">
            <span class="mini-value" :style="{color: s.color}">{{ s.value }}</span>
            <span class="mini-label">{{ s.label }}</span>
          </div>
        </div>
      </div>

      <div class="header-right">
        <div class="ws-status" :class="{ connected: store.wsConnected }">
          <span class="ws-dot"></span>
          <span class="ws-text">{{ store.wsConnected ? '实时连接中' : '连接断开' }}</span>
        </div>
        <div class="current-time">
          <div class="time-value">{{ currentTimeStr }}</div>
          <div class="time-date">{{ currentDateStr }}</div>
        </div>
        <button class="btn reset-cam" @click="resetCamera">重置视角</button>
        <button class="btn test-fault" @click="simulateTrackFault">
          🧪 模拟轨道故障
        </button>
      </div>
    </header>

    <main class="main-content">
      <aside class="left-panel panel">
        <div class="panel-header">
          <span>系统总览</span>
        </div>
        <div class="panel-body">
          <div class="system-stats">
            <div class="stat-card" v-for="s in systemStats" :key="s.label">
              <div class="stat-label">{{ s.label }}</div>
              <div class="stat-value" :style="{color: s.color}">{{ s.value }}</div>
            </div>
          </div>

          <div class="section-title">货架分层状态</div>
          <div class="layer-list">
            <div class="layer-item" v-for="layer in layerStatuses" :key="layer.layer">
              <div class="layer-head">
                <span class="layer-name">第 {{ layer.layer + 1 }} 层</span>
                <span class="layer-count">{{ layer.shuttleCount }} 台</span>
              </div>
              <div class="layer-bar-bg">
                <div class="layer-bar"
                     :style="{width: (layer.occupiedCount / maxTracksPerLayer * 100) + '%'}"></div>
              </div>
              <div class="layer-tags">
                <span class="tag tag-info">占用 {{ layer.occupiedCount }}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="center-section">
        <RackScene ref="sceneRef"
                   @shuttle-click="onShuttleClick" />
      </section>

      <aside class="right-panel panel">
        <div class="panel-header">
          <span>穿梭车列表</span>
          <span class="shuttle-count">{{ store.shuttleList.length }} 台</span>
        </div>
        <div class="panel-body shuttle-list-body">
          <div class="shuttle-item slide-in"
               v-for="shuttle in store.shuttleList"
               :key="shuttle.carCode"
               :class="{ selected: store.selectedShuttle === shuttle.carCode }"
               @click="selectShuttle(shuttle.carCode)">
            <div class="shuttle-head">
              <div class="shuttle-icon" :style="{background: getShuttleColor(shuttle.carCode)}">
                {{ (shuttle.carCode || 'S').slice(-2) }}
              </div>
              <div class="shuttle-name-group">
                <div class="shuttle-code">{{ shuttle.carCode }}</div>
                <div class="shuttle-pos">
                  坐标({{ shuttle.posX }}, {{ shuttle.posY }}, L{{ shuttle.posLayer + 1 }})
                </div>
              </div>
              <span class="tag" :class="statusTagClass(shuttle.status)">
                {{ statusText(shuttle.status) }}
              </span>
            </div>

            <div class="shuttle-stats-row">
              <div class="shuttle-stat">
                <span class="ico battery"></span>
                <span :class="{danger: (shuttle.batteryLevel ?? 100) < 20}">
                  {{ (shuttle.batteryLevel ?? 100).toFixed(1) }}%
                </span>
              </div>
              <div class="shuttle-stat">
                <span class="ico power"
                      :style="{background: shuttle.powerSupplyOk === false ? '#f56c6c' : '#67c23a'}"></span>
                <span :class="{'danger-text': shuttle.powerSupplyOk === false}">
                  {{ shuttle.powerSupplyOk === false ? '供电异常' : '滑触正常' }}
                </span>
              </div>
              <div class="shuttle-stat">
                <span class="ico speed"></span>
                <span>{{ (shuttle.speed ?? 0).toFixed(1) }} m/s</span>
              </div>
            </div>

            <div class="battery-bar">
              <div class="battery-fill"
                   :style="{width: (shuttle.batteryLevel ?? 100) + '%',
                            background: batteryColor(shuttle.batteryLevel)}"></div>
            </div>
          </div>
        </div>
      </aside>
    </main>

    <footer class="app-footer">
      <div class="footer-left">
        <div class="fault-tracks-section" v-if="store.trackFaultList.length > 0">
          <div class="fault-header">
            <span class="fault-title">⚠️ 故障轨道列表</span>
            <span class="tag tag-danger">{{ store.trackFaultList.length }} 段</span>
          </div>
          <div class="fault-track-list">
            <div class="fault-track-card slide-in"
                 v-for="fault in store.trackFaultList"
                 :key="fault.faultKey"
                 @click="focusOnFaultTrack(fault)">
              <div class="fault-track-header">
                <span class="fault-track-coord">
                  轨道 ({{ fault.trackX }}, {{ fault.trackY }}, {{ fault.trackLayer + 1 }}层)
                </span>
                <span class="tag tag-warning">{{ fault.faultType }}</span>
              </div>
              <div class="fault-track-info">
                <span class="fault-shuttle">🚗 {{ fault.shuttleCode }}</span>
                <span class="fault-battery">
                  电量: {{ fault.batteryBefore?.toFixed(1) }}% → {{ fault.batteryDuring?.toFixed(1) }}%
                </span>
              </div>
              <div class="fault-track-desc">{{ fault.description }}</div>
              <div class="fault-track-time">
                {{ formatTime(fault.reportedAt) }}
              </div>
            </div>
          </div>
        </div>

        <div class="alert-list" v-if="alerts.length > 0">
          <div class="alert-item slide-in"
               v-for="(alert, idx) in alerts"
               :key="idx"
               :class="'alert-' + alert.level">
            <span class="alert-level">[{{ alert.level.toUpperCase() }}]</span>
            <span class="alert-text">{{ alert.text }}</span>
          </div>
        </div>
        <div v-else class="no-alerts">
          <span class="tag tag-success">系统运行正常</span>
          <span class="no-alert-text">暂无告警信息</span>
        </div>
      </div>

      <div class="footer-right panel power-panel">
        <div class="power-header">
          <span class="power-title">滑触线供电状态</span>
          <span class="tag tag-info">{{ powerLines.length }} 条回路</span>
        </div>
        <div class="power-grid">
          <div class="power-item" v-for="line in powerLines" :key="line.lineCode">
            <div class="power-head">
              <span class="power-code">{{ line.lineCode }}</span>
              <span class="tag" :class="line.powerOn ? 'tag-success' : 'tag-danger'">
                {{ line.powerOn ? 'ON' : 'OFF' }}
              </span>
            </div>
            <div class="power-readings">
              <div class="power-reading">
                <span class="pr-label">电压</span>
                <span class="pr-value">{{ (line.voltage ?? 0).toFixed(1) }}V</span>
              </div>
              <div class="power-reading">
                <span class="pr-label">电流</span>
                <span class="pr-value">{{ (line.currentAmp ?? 0).toFixed(2) }}A</span>
              </div>
              <div class="power-reading">
                <span class="pr-label">温度</span>
                <span class="pr-value"
                      :class="{'danger-text': (line.temperature ?? 0) > 55}">
                  {{ (line.temperature ?? 25).toFixed(1) }}℃
                </span>
              </div>
            </div>
            <div class="temp-bar">
              <div class="temp-fill"
                   :style="{width: Math.min(100, (line.temperature ?? 25) / 80 * 100) + '%',
                            background: tempColor(line.temperature)}"></div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import RackScene from '@/components/RackScene.vue'
import { useRackStore } from '@/store/rackStore'
import { useWebSocket } from '@/services/websocketService'

const store = useRackStore()
const sceneRef = ref(null)
const ws = useWebSocket()
const currentTimeStr = ref('')
const currentDateStr = ref('')
const powerLines = ref([])

let clockTimer = null
let fetchTimer = null

const topStats = computed(() => [
  { label: '穿梭车总数', value: store.totalShuttles, color: '#409eff' },
  { label: '运行中', value: store.movingShuttles, color: '#67c23a' },
  { label: '空闲', value: store.idleShuttles, color: '#909399' },
  { label: '低电量', value: store.lowBatteryShuttles.length, color: '#e6a23c' },
  { label: '供电告警', value: store.powerIssueShuttles.length, color: '#f56c6c' },
  { label: '轨道故障', value: store.trackFaultCount, color: '#ff7b00' }
])

const systemStats = computed(() => {
  const s = store.systemStatus || {}
  return [
    { label: '货架矩阵', value: `${s.rackCols || 0}×${s.rackRows || 0}×${s.rackLayers || 0}`, color: '#8ec5ff' },
    { label: '轨道总数', value: s.totalTracks || 0, color: '#b3e19d' },
    { label: '占用轨道', value: s.occupiedTracks || 0, color: '#ffd78a' },
    { label: '货物位', value: s.cargoSlots || 0, color: '#e6a23c' },
    { label: '滑触线故障', value: s.faultyPowerLines || 0, color: '#f56c6c' },
    { label: '重连次数', value: store.wsReconnectCount, color: store.wsConnected ? '#67c23a' : '#f56c6c' }
  ]
})

const layerStatuses = computed(() => (store.systemStatus?.layers || []))
const maxTracksPerLayer = computed(() => {
  const s = store.systemStatus
  return (s?.rackRows || 5) * (s?.rackCols || 8)
})

const alerts = computed(() => {
  const list = []
  store.trackFaultList.forEach(f => {
    list.push({
      level: 'danger',
      text: `轨道故障 (${f.trackX},${f.trackY},${f.trackLayer}层): ${f.description || '滑触线接触不良'} [${f.shuttleCode}]`
    })
  })
  store.lowBatteryShuttles.forEach(s => {
    list.push({ level: 'warning', text: `穿梭车 ${s.carCode} 电量低: ${(s.batteryLevel||0).toFixed(1)}%` })
  })
  store.powerIssueShuttles.forEach(s => {
    list.push({ level: 'danger', text: `穿梭车 ${s.carCode} 滑触线供电异常` })
  })
  powerLines.value.forEach(l => {
    if (!l.powerOn) list.push({ level: 'danger', text: `滑触线 ${l.lineCode} 断电故障` })
    if ((l.temperature || 0) > 60) list.push({ level: 'warning', text: `滑触线 ${l.lineCode} 温度过高: ${l.temperature.toFixed(1)}℃` })
  })
  return list.slice(0, 8)
})

const shuttleColorMap = {}
const palette = ['#00d4ff', '#ff6b9d', '#7cff6b', '#ffd166', '#c77dff', '#ff9a3c', '#48cae4', '#f72585']
function getShuttleColor(code) {
  if (!shuttleColorMap[code]) {
    const idx = Object.keys(shuttleColorMap).length % palette.length
    shuttleColorMap[code] = palette[idx]
  }
  return shuttleColorMap[code]
}

function statusText(s) {
  return { IDLE: '空闲', MOVING: '运行', LOADING: '装货', UNLOADING: '卸货', CHARGING: '充电', ERROR: '故障', OFFLINE: '离线' }[s] || s
}
function statusTagClass(s) {
  return { IDLE: 'tag-info', MOVING: 'tag-success', LOADING: 'tag-warning', UNLOADING: 'tag-warning',
    CHARGING: 'tag-info', ERROR: 'tag-danger', OFFLINE: 'tag-danger' }[s] || 'tag-info'
}
function batteryColor(v) {
  v = v ?? 100
  if (v < 20) return '#f56c6c'
  if (v < 50) return '#e6a23c'
  return '#67c23a'
}
function tempColor(v) {
  v = v ?? 25
  if (v > 60) return '#f56c6c'
  if (v > 45) return '#e6a23c'
  return '#67c23a'
}
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
function focusOnFaultTrack(fault) {
  if (sceneRef.value && fault) {
    const pos = sceneRef.value.getTrackWorldPosition(fault.trackX, fault.trackY, fault.trackLayer)
    if (pos) {
      sceneRef.value.focusOnPosition(pos)
    }
  }
}

function simulateTrackFault() {
  const x = Math.floor(Math.random() * 8)
  const y = Math.floor(Math.random() * 5)
  const layer = Math.floor(Math.random() * 3)
  const before = 85 + Math.random() * 10
  const during = 2 + Math.random() * 2
  const fault = {
    trackX: x,
    trackY: y,
    trackLayer: layer,
    shuttleCode: 'SH-' + (100 + Math.floor(Math.random() * 4)),
    shuttleName: '穿梭车-测试',
    faultType: 'POWER_DIP',
    severity: 'WARNING',
    batteryBefore: before,
    batteryDuring: during,
    batteryAfter: before - 0.5,
    reportedAt: Date.now(),
    description: `滑触线接触不良: 电量在${1 + Math.floor(Math.random() * 2)}秒内从${before.toFixed(1)}%骤跌至${during.toFixed(1)}%后恢复`
  }
  store.addTrackFault(fault)
}

function selectShuttle(code) {
  store.selectShuttle(code)
  sceneRef.value?.focusOnShuttle(code)
}
function onShuttleClick(code) {
  store.selectShuttle(code)
}
function resetCamera() {
  sceneRef.value?.resetCamera()
}

function updateClock() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  currentTimeStr.value = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  currentDateStr.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} 星期${'日一二三四五六'[d.getDay()]}`
}

async function fetchInitialData() {
  try {
    const [shuttlesRes, statusRes, powerRes, tracksRes] = await Promise.all([
      fetch('/api/shuttles/positions').then(r => r.ok ? r.json() : []),
      fetch('/api/system/status').then(r => r.ok ? r.json() : null),
      fetch('/api/powerlines').then(r => r.ok ? r.json() : []),
      fetch('/api/tracks').then(r => r.ok ? r.json() : [])
    ])
    if (Array.isArray(shuttlesRes)) store.setShuttleList(shuttlesRes)
    if (statusRes) store.setSystemStatus(statusRes)
    if (Array.isArray(powerRes)) powerLines.value = powerRes
    if (Array.isArray(tracksRes)) store.setTracks(tracksRes)
  } catch (e) {
    console.warn('拉取初始数据失败:', e)
  }
}

async function fetchPowerLines() {
  try {
    const res = await fetch('/api/powerlines')
    if (res.ok) powerLines.value = await res.json()
  } catch {}
}

onMounted(async () => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)

  await fetchInitialData()

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.host}/api/ws/rack`
  ws.init(wsUrl)

  fetchTimer = setInterval(fetchPowerLines, 3000)
})

onUnmounted(() => {
  clockTimer && clearInterval(clockTimer)
  fetchTimer && clearInterval(fetchTimer)
  ws.close()
})
</script>

<style scoped lang="scss">
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at top, #121a2e 0%, #0a0e1a 60%, #060913 100%);
}

.app-header {
  height: 72px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(20,30,55,0.95) 0%, rgba(15,20,40,0.8) 100%);
  border-bottom: 1px solid rgba(64, 158, 255, 0.2);
  backdrop-filter: blur(10px);
  position: relative;
  z-index: 10;

  &::before {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, #409eff 20%, #00d4ff 50%, #409eff 80%, transparent 100%);
    opacity: 0.6;
  }
}

.header-left { display: flex; align-items: center; gap: 14px; min-width: 380px; }

.logo-icon {
  width: 48px; height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(64,158,255,0.15), rgba(0,212,255,0.1));
  border: 1px solid rgba(64,158,255,0.3);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px rgba(64,158,255,0.2);
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(90deg, #e6f2ff, #8ec5ff, #00d4ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 2px;
}
.app-subtitle {
  font-size: 10px;
  color: #6c7a95;
  letter-spacing: 1.5px;
  margin-top: 2px;
}

.header-center { flex: 1; display: flex; justify-content: center; }

.stat-row { display: flex; gap: 28px; }
.mini-stat {
  display: flex; flex-direction: column; align-items: center;
  padding: 4px 18px;
  border-left: 1px solid rgba(64,158,255,0.15);
  border-right: 1px solid rgba(64,158,255,0.15);
}
.mini-value {
  font-size: 26px; font-weight: 700;
  font-family: 'Consolas', monospace;
  line-height: 1;
  text-shadow: 0 0 12px currentColor;
}
.mini-label {
  font-size: 11px; color: #7a8aa0; margin-top: 4px; letter-spacing: 1px;
}

.header-right { display: flex; align-items: center; gap: 16px; min-width: 340px; justify-content: flex-end; }

.ws-status {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 20px;
  background: rgba(245,108,108,0.1);
  border: 1px solid rgba(245,108,108,0.3);
  font-size: 12px; color: #f56c6c;
  &.connected {
    background: rgba(103,194,58,0.1);
    border-color: rgba(103,194,58,0.3);
    color: #67c23a;
    .ws-dot { background: #67c23a; box-shadow: 0 0 10px #67c23a; animation: pulse 1.5s infinite; }
  }
}
.ws-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #f56c6c;
}

.current-time { text-align: right; }
.time-value {
  font-size: 20px; font-weight: 600;
  font-family: 'Consolas', monospace;
  color: #8ec5ff;
  letter-spacing: 1px;
}
.time-date { font-size: 11px; color: #6c7a95; margin-top: 2px; }

.reset-cam {
  padding: 8px 14px;
  border: 1px solid rgba(64,158,255,0.4);
  background: linear-gradient(135deg, rgba(64,158,255,0.15), rgba(0,212,255,0.1));
  color: #8ec5ff;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { background: rgba(64,158,255,0.25); }
}
.test-fault {
  padding: 8px 14px;
  border: 1px solid rgba(255, 123, 0, 0.5);
  background: linear-gradient(135deg, rgba(255, 123, 0, 0.15), rgba(255, 80, 0, 0.1));
  color: #ff9a3c;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
  &:hover {
    background: rgba(255, 123, 0, 0.28);
    box-shadow: 0 0 12px rgba(255, 123, 0, 0.3);
  }
  &:active { transform: scale(0.96); }
}

.main-content {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.left-panel, .right-panel {
  display: flex; flex-direction: column;
  overflow: hidden;
}

.section-title {
  font-size: 12px; font-weight: 600;
  color: #8ec5ff; margin: 14px 0 10px;
  letter-spacing: 1px;
  padding-left: 8px;
  border-left: 2px solid #409eff;
}

.system-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.layer-list { display: flex; flex-direction: column; gap: 10px; }
.layer-item {
  padding: 10px 12px;
  background: rgba(64,158,255,0.04);
  border: 1px solid rgba(64,158,255,0.12);
  border-radius: 6px;
}
.layer-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.layer-name { font-size: 13px; font-weight: 600; color: #cfe2ff; }
.layer-count { font-size: 11px; color: #8ec5ff; }

.layer-bar-bg {
  height: 5px;
  background: rgba(64,158,255,0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}
.layer-bar {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #00d4ff);
  border-radius: 3px;
  transition: width 0.3s;
  box-shadow: 0 0 8px rgba(0,212,255,0.5);
}
.layer-tags { display: flex; gap: 6px; }

.center-section {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  border: 1px solid rgba(64, 158, 255, 0.2);
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
}

.shuttle-list-body {
  flex: 1;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 10px;
}

.shuttle-count {
  font-size: 11px; color: #8ec5ff;
  padding: 2px 10px;
  background: rgba(64,158,255,0.1);
  border-radius: 10px;
}

.shuttle-item {
  padding: 10px 12px;
  background: rgba(64,158,255,0.04);
  border: 1px solid rgba(64,158,255,0.12);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(64,158,255,0.08);
    border-color: rgba(64,158,255,0.3);
    transform: translateX(2px);
  }

  &.selected {
    background: rgba(64,158,255,0.15);
    border-color: rgba(0,212,255,0.6);
    box-shadow: 0 0 16px rgba(0,212,255,0.15), inset 0 0 12px rgba(0,212,255,0.08);
  }
}

.shuttle-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.shuttle-icon {
  width: 36px; height: 36px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
}
.shuttle-name-group { flex: 1; min-width: 0; }
.shuttle-code {
  font-size: 13px; font-weight: 600; color: #e4e7f0;
  font-family: 'Consolas', monospace;
}
.shuttle-pos {
  font-size: 10px; color: #7a8aa0; margin-top: 2px;
  font-family: 'Consolas', monospace;
}

.shuttle-stats-row {
  display: flex; justify-content: space-between; margin-bottom: 8px;
}
.shuttle-stat {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #a8b5cc;
  font-family: 'Consolas', monospace;
  .danger, .danger-text { color: #f56c6c; }
}
.ico {
  width: 10px; height: 10px; border-radius: 50%;
  display: inline-block;
  &.battery { background: #67c23a; }
  &.power { background: #67c23a; }
  &.speed { background: #409eff; }
}

.battery-bar {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.battery-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s;
  box-shadow: 0 0 6px currentColor;
}

.app-footer {
  height: 180px;
  padding: 0 12px 12px;
  display: grid;
  grid-template-columns: 1fr 520px;
  gap: 12px;
}

.footer-left {
  padding: 12px 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(20, 30, 50, 0.9), rgba(15, 20, 40, 0.85));
  border: 1px solid rgba(64, 158, 255, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fault-tracks-section {
  animation: slideIn 0.4s ease-out;
}
.fault-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.fault-title {
  font-size: 13px; font-weight: 600;
  color: #ff9a3c;
  text-shadow: 0 0 8px rgba(255, 123, 0, 0.4);
}
.fault-track-list {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 123, 0, 0.3) transparent;
}
.fault-track-list::-webkit-scrollbar {
  height: 4px;
}
.fault-track-list::-webkit-scrollbar-track {
  background: transparent;
}
.fault-track-list::-webkit-scrollbar-thumb {
  background: rgba(255, 123, 0, 0.3);
  border-radius: 2px;
}
.fault-track-card {
  flex: 0 0 280px;
  padding: 10px 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(255, 123, 0, 0.12), rgba(255, 80, 0, 0.08));
  border: 1px solid rgba(255, 123, 0, 0.4);
  box-shadow: 0 0 12px rgba(255, 123, 0, 0.15);
  cursor: pointer;
  transition: all 0.25s;
  animation: cardPulse 2s infinite ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(255, 123, 0, 0.3);
    border-color: rgba(255, 150, 0, 0.7);
  }
}
.fault-track-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.fault-track-coord {
  font-size: 12px; font-weight: 600;
  color: #ffd78a;
  font-family: 'Consolas', monospace;
}
.fault-track-info {
  display: flex; justify-content: space-between;
  margin-bottom: 6px;
  font-size: 11px;
  color: #b8c5d6;
  font-family: 'Consolas', monospace;
}
.fault-shuttle { color: #00d4ff; }
.fault-battery { color: #f5a1a1; }
.fault-track-desc {
  font-size: 11px;
  color: #a8b5cc;
  line-height: 1.4;
  margin-bottom: 6px;
}
.fault-track-time {
  font-size: 10px;
  color: #7a8aa0;
  text-align: right;
  font-family: 'Consolas', monospace;
}
@keyframes cardPulse {
  0%, 100% { box-shadow: 0 0 12px rgba(255, 123, 0, 0.15); }
  50% { box-shadow: 0 0 20px rgba(255, 123, 0, 0.35); }
}

.alert-list { display: flex; flex-direction: column; gap: 6px; }
.alert-item {
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 12px;
  display: flex; align-items: center; gap: 10px;
  animation: slideIn 0.3s ease-out;

  &.alert-warning {
    background: rgba(230,162,60,0.08);
    border-left: 3px solid #e6a23c;
    color: #ffd78a;
  }
  &.alert-danger {
    background: rgba(245,108,108,0.08);
    border-left: 3px solid #f56c6c;
    color: #f5a1a1;
    animation: pulse 1.5s infinite;
  }
}
.alert-level {
  font-family: 'Consolas', monospace;
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 1px;
}
.alert-text { flex: 1; }

.no-alerts {
  height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
}
.no-alert-text { font-size: 13px; color: #7a8aa0; }

.power-panel { padding: 0; overflow: hidden; }
.power-header {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(64,158,255,0.15);
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; font-weight: 600; color: #8ec5ff;
}
.power-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 10px;
  overflow: auto;
}
.power-item {
  padding: 8px 10px;
  background: rgba(64,158,255,0.04);
  border: 1px solid rgba(64,158,255,0.12);
  border-radius: 6px;
}
.power-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px;
}
.power-code {
  font-size: 11px; font-weight: 600;
  color: #cfe2ff;
  font-family: 'Consolas', monospace;
}
.power-readings {
  display: flex; justify-content: space-between;
  margin-bottom: 6px;
}
.power-reading {
  display: flex; flex-direction: column;
  align-items: center;
}
.pr-label { font-size: 9px; color: #6c7a95; }
.pr-value {
  font-size: 12px; font-weight: 600;
  color: #b8c9e4;
  font-family: 'Consolas', monospace;
  &.danger-text { color: #f56c6c; }
}
.temp-bar {
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.temp-fill {
  height: 100%;
  border-radius: 2px;
  transition: all 0.3s;
}
</style>
