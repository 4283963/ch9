<template>
  <div class="rack-scene-container">
    <canvas ref="canvasRef" class="scene-canvas"></canvas>

    <div class="scene-overlay" v-if="!loaded">
      <div class="loading-spinner">
        <div class="spinner-ring"></div>
        <div class="loading-text">正在加载 3D 场景...</div>
      </div>
    </div>

    <div class="scene-controls">
      <div class="control-group">
        <div class="control-label">操作提示</div>
        <div class="control-tips">
          <span>🖱️ 左键拖动：旋转视角</span>
          <span>🖱️ 滚轮：缩放</span>
          <span>🖱️ 右键拖动：平移</span>
          <span>🖱️ 点击小车：聚焦</span>
        </div>
      </div>
    </div>

    <div class="scene-legend">
      <div class="legend-title">图例</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="legend-dot" style="background:#67c23a"></span>
          <span>空闲</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#409eff"></span>
          <span>运行</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#e6a23c"></span>
          <span>装/卸货</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:#f56c6c"></span>
          <span>故障</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:radial-gradient(#67c23a,#008844);box-shadow:0 0 10px #67c23a"></span>
          <span>充电站</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot" style="background:repeating-linear-gradient(45deg,#00c5ff33,#00c5ff33 4px,#00c5ff11 4px,#00c5ff11 8px)"></span>
          <span>升降机</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineExpose } from 'vue'
import { RackSceneEngine } from '@/engine/RackSceneEngine'

const emit = defineEmits(['shuttle-click'])

const canvasRef = ref(null)
const loaded = ref(false)
let engine = null

onMounted(async () => {
  await new Promise(r => setTimeout(r, 100))
  engine = new RackSceneEngine(canvasRef.value)

  engine.onShuttleClick = (code) => {
    emit('shuttle-click', code)
  }

  await engine.init()
  loaded.value = true
})

onUnmounted(() => {
  if (engine) {
    engine.dispose()
    engine = null
  }
})

function focusOnShuttle(code) {
  engine?.focusOnShuttle(code)
}
function resetCamera() {
  engine?.resetCamera()
}

defineExpose({
  focusOnShuttle,
  resetCamera
})
</script>

<style scoped lang="scss">
.rack-scene-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
}

.scene-canvas {
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
}

.scene-overlay {
  position: absolute;
  inset: 0;
  background: rgba(5, 10, 20, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.spinner-ring {
  width: 60px;
  height: 60px;
  border: 3px solid rgba(64, 158, 255, 0.2);
  border-top-color: #00d4ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #8ec5ff;
  letter-spacing: 2px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.scene-controls {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  background: linear-gradient(135deg, rgba(20, 30, 50, 0.8), rgba(15, 20, 40, 0.75));
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.control-label {
  font-size: 11px;
  font-weight: 600;
  color: #8ec5ff;
  margin-bottom: 6px;
  letter-spacing: 1px;
}

.control-tips {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.control-tips span {
  font-size: 11px;
  color: #9eabc4;
}

.scene-legend {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 10;
  background: linear-gradient(135deg, rgba(20, 30, 50, 0.8), rgba(15, 20, 40, 0.75));
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.legend-title {
  font-size: 11px;
  font-weight: 600;
  color: #8ec5ff;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  max-width: 360px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #b8c9e4;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
</style>
