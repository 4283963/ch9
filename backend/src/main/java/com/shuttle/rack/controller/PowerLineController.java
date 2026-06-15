package com.shuttle.rack.controller;

import com.shuttle.rack.entity.PowerLine;
import com.shuttle.rack.service.PowerLineService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/powerlines")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class PowerLineController {

    private final PowerLineService powerLineService;

    @GetMapping
    public ResponseEntity<List<PowerLine>> getAllPowerLines() {
        return ResponseEntity.ok(powerLineService.findAll());
    }

    @GetMapping("/{lineCode}")
    public ResponseEntity<PowerLine> getPowerLine(@PathVariable String lineCode) {
        return powerLineService.findByLineCode(lineCode)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/layer/{layer}")
    public ResponseEntity<List<PowerLine>> getByLayer(@PathVariable Integer layer) {
        return ResponseEntity.ok(powerLineService.findByLayer(layer));
    }

    @GetMapping("/faulty")
    public ResponseEntity<List<PowerLine>> getFaultyLines() {
        return ResponseEntity.ok(powerLineService.findFaultyLines());
    }

    @GetMapping("/overheating")
    public ResponseEntity<List<PowerLine>> getOverheatingLines() {
        return ResponseEntity.ok(powerLineService.findOverheatingLines());
    }

    @PostMapping("/initialize")
    public ResponseEntity<Map<String, Object>> initialize() {
        powerLineService.initializePowerLines();
        return ResponseEntity.ok(Map.of("success", true, "message", "滑触线初始化完成"));
    }

    @PutMapping("/{lineCode}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @PathVariable String lineCode,
            @RequestParam(required = true) boolean powerOn,
            @RequestParam(required = false) Double voltage,
            @RequestParam(required = false) Double currentAmp) {
        try {
            PowerLine updated = powerLineService.updateStatus(lineCode, powerOn, voltage, currentAmp);
            return ResponseEntity.ok(Map.of("success", true, "data", updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        long faulty = powerLineService.countFaultyLines();
        long total = powerLineService.findAll().size();
        return ResponseEntity.ok(Map.of(
                "total", total,
                "faulty", faulty,
                "normal", total - faulty
        ));
    }
}
