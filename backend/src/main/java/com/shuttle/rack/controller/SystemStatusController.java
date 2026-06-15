package com.shuttle.rack.controller;

import com.shuttle.rack.dto.SystemStatusDTO;
import com.shuttle.rack.service.SystemStatusService;
import com.shuttle.rack.websocket.RackWebSocketHandler;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/system")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class SystemStatusController {

    private final SystemStatusService systemStatusService;
    private final RackWebSocketHandler webSocketHandler;

    @GetMapping("/status")
    public ResponseEntity<SystemStatusDTO> getSystemStatus() {
        return ResponseEntity.ok(systemStatusService.getSystemStatus());
    }

    @GetMapping("/ws/sessions")
    public ResponseEntity<Map<String, Object>> getWebSocketSessions() {
        return ResponseEntity.ok(Map.of(
                "activeSessions", webSocketHandler.getActiveSessionCount()
        ));
    }

    @PostMapping("/ws/broadcast/status")
    public ResponseEntity<Map<String, Object>> triggerStatusBroadcast() {
        webSocketHandler.broadcastSystemStatus();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "系统状态广播已触发",
                "activeSessions", webSocketHandler.getActiveSessionCount()
        ));
    }

    @GetMapping("/config")
    public ResponseEntity<Map<String, Object>> getSystemConfig() {
        SystemStatusDTO status = systemStatusService.getSystemStatus();
        return ResponseEntity.ok(Map.of(
                "rack", Map.of(
                        "rows", status.getRackRows(),
                        "cols", status.getRackCols(),
                        "layers", status.getRackLayers(),
                        "totalTracks", status.getTotalTracks()
                ),
                "websocket", Map.of(
                        "endpoint", "/ws/rack",
                        "activeSessions", webSocketHandler.getActiveSessionCount()
                )
        ));
    }
}
