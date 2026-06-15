package com.shuttle.rack.dto;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SystemStatusDTO {

    private Integer totalShuttles;

    private Long movingShuttles;

    private Long idleShuttles;

    private Long lowBatteryShuttles;

    private Long powerIssueShuttles;

    private Integer rackRows;

    private Integer rackCols;

    private Integer rackLayers;

    private Long occupiedTracks;

    private Long totalTracks;

    private Long cargoSlots;

    private Long faultyPowerLines;

    private List<RackLayerStatus> layers;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RackLayerStatus {
        private Integer layer;
        private Long occupiedCount;
        private Long shuttleCount;
    }
}
