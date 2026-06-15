package com.shuttle.rack.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrackFaultDTO {

    private Integer trackX;

    private Integer trackY;

    private Integer trackLayer;

    private String shuttleCode;

    private String shuttleName;

    private String faultType;

    private String severity;

    private Double batteryBefore;

    private Double batteryDuring;

    private Double batteryAfter;

    private LocalDateTime detectedAt;

    private String description;
}
