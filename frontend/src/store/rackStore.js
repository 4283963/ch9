import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useRackStore = defineStore('rack', () => {
  const rackConfig = ref({
    rows: 5,
    cols: 8,
    layers: 3
  })

  const shuttles = ref(new Map())
  const systemStatus = ref(null)
  const powerLines = ref([])
  const tracks = ref(new Map())
  const trackFaults = ref(new Map())
  const wsConnected = ref(false)
  const wsReconnectCount = ref(0)
  const lastUpdateTime = ref(null)
  const selectedShuttle = ref(null)

  const shuttleList = computed(() => Array.from(shuttles.value.values()))

  const totalShuttles = computed(() => shuttles.value.size)

  const movingShuttles = computed(() =>
    shuttleList.value.filter(s => s.status === 'MOVING').length
  )

  const idleShuttles = computed(() =>
    shuttleList.value.filter(s => s.status === 'IDLE').length
  )

  const lowBatteryShuttles = computed(() =>
    shuttleList.value.filter(s => (s.batteryLevel ?? 100) < 20)
  )

  const powerIssueShuttles = computed(() =>
    shuttleList.value.filter(s => s.powerSupplyOk === false)
  )

  const trackFaultList = computed(() => Array.from(trackFaults.value.values()))

  const trackFaultCount = computed(() => trackFaults.value.size)

  function setRackConfig(config) {
    rackConfig.value = { ...rackConfig.value, ...config }
  }

  function addOrUpdateShuttle(shuttleData) {
    if (!shuttleData || !shuttleData.carCode) return
    const existing = shuttles.value.get(shuttleData.carCode)
    shuttles.value.set(shuttleData.carCode, { ...existing, ...shuttleData })
    lastUpdateTime.value = Date.now()
  }

  function setShuttleList(list) {
    shuttles.value.clear()
    list.forEach(s => addOrUpdateShuttle(s))
  }

  function removeShuttle(carCode) {
    shuttles.value.delete(carCode)
  }

  function setSystemStatus(status) {
    systemStatus.value = status
    if (status && status.rackRows) {
      rackConfig.value = {
        rows: status.rackRows,
        cols: status.rackCols,
        layers: status.rackLayers
      }
    }
  }

  function setPowerLines(lines) {
    powerLines.value = lines
  }

  function setTracks(trackList) {
    tracks.value.clear()
    trackList.forEach(t => {
      const key = `${t.posLayer}-${t.posY}-${t.posX}`
      tracks.value.set(key, t)
    })
  }

  function selectShuttle(carCode) {
    selectedShuttle.value = carCode || null
  }

  function addTrackFault(fault) {
    if (!fault || fault.trackX == null) return
    const key = `${fault.trackLayer}-${fault.trackY}-${fault.trackX}`
    trackFaults.value.set(key, {
      ...fault,
      faultKey: key,
      reportedAt: fault.detectedAt || new Date().toISOString()
    })
    lastUpdateTime.value = Date.now()
  }

  function clearTrackFault(key) {
    trackFaults.value.delete(key)
  }

  function clearAllTrackFaults() {
    trackFaults.value.clear()
  }

  function setWsConnected(connected) {
    wsConnected.value = connected
  }

  function incrementReconnectCount() {
    wsReconnectCount.value++
  }

  function resetAll() {
    shuttles.value.clear()
    systemStatus.value = null
    powerLines.value = []
    tracks.value.clear()
    trackFaults.value.clear()
    selectedShuttle.value = null
  }

  return {
    rackConfig,
    shuttles,
    systemStatus,
    powerLines,
    tracks,
    trackFaults,
    wsConnected,
    wsReconnectCount,
    lastUpdateTime,
    selectedShuttle,
    shuttleList,
    totalShuttles,
    movingShuttles,
    idleShuttles,
    lowBatteryShuttles,
    powerIssueShuttles,
    trackFaultList,
    trackFaultCount,
    setRackConfig,
    addOrUpdateShuttle,
    setShuttleList,
    removeShuttle,
    setSystemStatus,
    setPowerLines,
    setTracks,
    selectShuttle,
    addTrackFault,
    clearTrackFault,
    clearAllTrackFaults,
    setWsConnected,
    incrementReconnectCount,
    resetAll
  }
})
