package com.shuttle.rack.controller;

import com.shuttle.rack.dto.ShuttlePositionUpdateDTO;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import com.shuttle.rack.service.ShuttleCarService;
import com.shuttle.rack.websocket.RackWebSocketHandler;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/shuttles")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class ShuttleCarController {

    private final ShuttleCarService shuttleCarService;
    private final RackWebSocketHandler webSocketHandler;

    @GetMapping
    public ResponseEntity<List<ShuttleCar>> getAllShuttles() {
        return ResponseEntity.ok(shuttleCarService.findAll());
    }

    @GetMapping("/positions")
    public ResponseEntity<List<ShuttlePositionUpdateDTO>> getAllPositions() {
        return ResponseEntity.ok(shuttleCarService.findAllPositionDTOs());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ShuttleCar> getShuttleById(@PathVariable Long id) {
        return shuttleCarService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/code/{carCode}")
    public ResponseEntity<ShuttleCar> getShuttleByCode(@PathVariable String carCode) {
        return shuttleCarService.findByCarCode(carCode)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<ShuttleCar>> getShuttlesByStatus(@PathVariable ShuttleStatus status) {
        return ResponseEntity.ok(shuttleCarService.findByStatus(status));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createShuttle(@Valid @RequestBody ShuttleCar car) {
        Map<String, Object> result = new HashMap<>();
        try {
            ShuttleCar created = shuttleCarService.create(car);
            webSocketHandler.broadcastSystemStatus();
            result.put("success", true);
            result.put("data", created);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }

    @PutMapping("/position")
    public ResponseEntity<Map<String, Object>> updatePosition(@Valid @RequestBody ShuttlePositionUpdateDTO dto) {
        Map<String, Object> result = new HashMap<>();
        try {
            ShuttleCar updated = shuttleCarService.updatePosition(dto);
            ShuttlePositionUpdateDTO positionDTO = shuttleCarService.toPositionDTO(updated);
            webSocketHandler.broadcastShuttleUpdate(positionDTO);
            webSocketHandler.broadcastSystemStatus();
            result.put("success", true);
            result.put("data", positionDTO);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @PathVariable Long id,
            @RequestParam ShuttleStatus status) {
        Map<String, Object> result = new HashMap<>();
        return shuttleCarService.findById(id)
                .map(car -> {
                    car.setStatus(status);
                    ShuttleCar updated = shuttleCarService.updatePosition(
                            ShuttlePositionUpdateDTO.builder()
                                    .carCode(car.getCarCode())
                                    .status(status)
                                    .build());
                    webSocketHandler.broadcastShuttleUpdate(shuttleCarService.toPositionDTO(updated));
                    result.put("success", true);
                    result.put("data", updated);
                    return ResponseEntity.ok(result);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteShuttle(@PathVariable Long id) {
        Map<String, Object> result = new HashMap<>();
        try {
            shuttleCarService.delete(id);
            webSocketHandler.broadcastSystemStatus();
            result.put("success", true);
            result.put("message", "穿梭车已删除");
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(result);
        }
    }

    @GetMapping("/alerts/low-battery")
    public ResponseEntity<List<ShuttleCar>> getLowBatteryShuttles() {
        return ResponseEntity.ok(shuttleCarService.findLowBatteryShuttles());
    }

    @GetMapping("/alerts/power-issue")
    public ResponseEntity<List<ShuttleCar>> getPowerIssueShuttles() {
        return ResponseEntity.ok(shuttleCarService.findShuttlesWithPowerIssue());
    }
}
