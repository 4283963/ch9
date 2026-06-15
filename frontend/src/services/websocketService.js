import { useRackStore } from '@/store/rackStore'

class WebSocketService {
  constructor() {
    this.ws = null
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.url = null
    this.manualClose = false
    this.reconnectDelay = 3000
    this.maxReconnectDelay = 30000
    this.store = null
  }

  init(wsUrl) {
    this.store = useRackStore()
    this.url = wsUrl || this.buildDefaultUrl()
    this.connect()
  }

  buildDefaultUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${proto}//${host}/ws/rack`
  }

  connect() {
    this.manualClose = false
    this.clearTimers()

    try {
      this.ws = new WebSocket(this.url)
    } catch (e) {
      console.error('[WS] 创建连接失败:', e)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[WS] 连接已建立:', this.url)
      if (this.store) this.store.setWsConnected(true)
      this.startHeartbeat()
      this.reconnectDelay = 3000
    }

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }

    this.ws.onerror = (error) => {
      console.error('[WS] 连接错误:', error)
    }

    this.ws.onclose = (event) => {
      console.warn('[WS] 连接关闭, code:', event.code, 'reason:', event.reason)
      if (this.store) this.store.setWsConnected(false)
      this.clearTimers()
      if (!this.manualClose) {
        this.scheduleReconnect()
      }
    }
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data)
      const { type, payload } = msg

      if (!this.store) return

      switch (type) {
        case 'CONNECTED':
          console.log('[WS] 服务端确认连接:', payload)
          break

        case 'SHUTTLE_LIST':
          if (Array.isArray(payload)) {
            this.store.setShuttleList(payload)
          }
          break

        case 'SHUTTLE_UPDATE':
          if (payload && payload.carCode) {
            this.store.addOrUpdateShuttle(payload)
          }
          break

        case 'SYSTEM_STATUS':
          this.store.setSystemStatus(payload)
          break

        case 'TRACK_FAULT':
          console.warn('[WS] 收到轨道故障告警:', payload)
          this.store.addTrackFault(payload)
          break

        case 'PONG':
          break

        case 'ERROR':
          console.error('[WS] 服务端错误:', payload)
          break

        default:
          console.debug('[WS] 未知消息类型:', type, payload)
      }
    } catch (e) {
      console.error('[WS] 解析消息失败:', e, 'raw:', data)
    }
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ type, payload, timestamp: Date.now() })
      this.ws.send(msg)
      return true
    }
    return false
  }

  requestShuttleList() {
    return this.send('REQUEST_SHUTTLE_LIST')
  }

  requestSystemStatus() {
    return this.send('REQUEST_SYSTEM_STATUS')
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('PING')
      }
    }, 15000)
  }

  scheduleReconnect() {
    if (this.manualClose) return
    if (this.reconnectTimer) return

    if (this.store) this.store.incrementReconnectCount()

    console.log(`[WS] ${this.reconnectDelay / 1000}s 后尝试重连...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)

    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay)
  }

  clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  close() {
    this.manualClose = true
    this.clearTimers()
    if (this.ws) {
      this.ws.close(1000, 'Client closing')
      this.ws = null
    }
    if (this.store) this.store.setWsConnected(false)
  }

  reconnect() {
    this.close()
    this.manualClose = false
    this.reconnectDelay = 3000
    setTimeout(() => this.connect(), 500)
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

const instance = new WebSocketService()

export function useWebSocket() {
  return instance
}

export default instance
