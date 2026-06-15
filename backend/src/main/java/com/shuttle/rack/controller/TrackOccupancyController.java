package com.shuttle.rack.controller;

import com.shuttle.rack.entity.TrackOccupancy;
import com.shuttle.rack.service.TrackOccupancyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/tracks")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TrackOccupancyController {

    private final TrackOccupancyService trackOccupancyService;

    @GetMapping
    public ResponseEntity<List<TrackOccupancy>> getAllTracks() {
        return ResponseEntity.ok(trackOccupancyService.findAll());
    }

    @GetMapping("/layer/{layer}")
    public ResponseEntity<List<TrackOccupancy>> getTracksByLayer(@PathVariable Integer layer) {
        return ResponseEntity.ok(trackOccupancyService.findByLayer(layer));
    }

    @GetMapping("/position")
    public ResponseEntity<TrackOccupancy> getTrackByPosition(
            @RequestParam Integer x,
            @RequestParam Integer y,
            @RequestParam Integer layer) {
        return trackOccupancyService.findByPosition(x, y, layer)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/check")
    public ResponseEntity<Map<String, Object>> checkOccupied(
            @RequestParam Integer x,
            @RequestParam Integer y,
            @RequestParam Integer layer) {
        boolean occupied = trackOccupancyService.isOccupied(x, y, layer);
        return ResponseEntity.ok(Map.of("occupied", occupied, "x", x, "y", y, "layer", layer));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getTrackStats() {
        return ResponseEntity.ok(Map.of(
                "occupied", trackOccupancyService.countOccupied(),
                "cargoSlots", trackOccupancyService.countCargoSlots()
        ));
    }

    @PostMapping("/initialize")
    public ResponseEntity<Map<String, Object>> initializeTracks() {
        trackOccupancyService.initializeAllTracks();
        return ResponseEntity.ok(Map.of("success", true, "message", "轨道矩阵初始化完成"));
    }

    @PutMapping("/cargo")
    public ResponseEntity<Map<String, Object>> setCargoStatus(
            @RequestParam Integer x,
            @RequestParam Integer y,
            @RequestParam Integer layer,
            @RequestParam Boolean hasCargo) {
        try {
            trackOccupancyService.setCargoStatus(x, y, layer, hasCargo);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", e.getMessage()));
        }
    }
}
