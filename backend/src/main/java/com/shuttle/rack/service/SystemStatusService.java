package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.dto.SystemStatusDTO;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SystemStatusService {

    private final ShuttleCarService shuttleCarService;
    private final TrackOccupancyService trackOccupancyService;
    private final PowerLineService powerLineService;
    private final RackConfig rackConfig;

    public SystemStatusDTO getSystemStatus() {
        List<ShuttleCar> allShuttles = shuttleCarService.findAll();
        long idleCount = allShuttles.stream()
                .filter(s -> s.getStatus() == ShuttleStatus.IDLE)
                .count();

        List<SystemStatusDTO.RackLayerStatus> layerStatuses = new ArrayList<>();
        for (int layer = 0; layer < rackConfig.getLayers(); layer++) {
            final int l = layer;
            long shuttleInLayer = allShuttles.stream()
                    .filter(s -> s.getPosLayer() == l)
                    .count();
            layerStatuses.add(SystemStatusDTO.RackLayerStatus.builder()
                    .layer(layer)
                    .occupiedCount(trackOccupancyService.countOccupiedByLayer(layer))
                    .shuttleCount(shuttleInLayer)
                    .build());
        }

        return SystemStatusDTO.builder()
                .totalShuttles(allShuttles.size())
                .movingShuttles(shuttleCarService.countMovingShuttles())
                .idleShuttles(idleCount)
                .lowBatteryShuttles((long) shuttleCarService.findLowBatteryShuttles().size())
                .powerIssueShuttles((long) shuttleCarService.findShuttlesWithPowerIssue().size())
                .rackRows(rackConfig.getRows())
                .rackCols(rackConfig.getCols())
                .rackLayers(rackConfig.getLayers())
                .occupiedTracks(trackOccupancyService.countOccupied())
                .totalTracks((long) rackConfig.getTotalTracks())
                .cargoSlots(trackOccupancyService.countCargoSlots())
                .faultyPowerLines(powerLineService.countFaultyLines())
                .layers(layerStatuses)
                .build();
    }
}
