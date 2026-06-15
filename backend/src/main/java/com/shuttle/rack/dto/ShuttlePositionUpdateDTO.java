package com.shuttle.rack.dto;

import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShuttlePositionUpdateDTO {

    private String carCode;

    private Integer posX;

    private Integer posY;

    private Integer posLayer;

    private Direction direction;

    private ShuttleStatus status;

    private Double batteryLevel;

    private Boolean powerSupplyOk;

    private Double trackAlignmentOffset;

    private Double speed;

    private LocalDateTime timestamp;
}
