package com.shuttle.rack.entity;

import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "shuttle_car")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShuttleCar {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "car_code", nullable = false, unique = true, length = 32)
    private String carCode;

    @Column(name = "car_name", length = 64)
    private String carName;

    @Column(name = "pos_x", nullable = false)
    private Integer posX = 0;

    @Column(name = "pos_y", nullable = false)
    private Integer posY = 0;

    @Column(name = "pos_layer", nullable = false)
    private Integer posLayer = 0;

    @Enumerated(EnumType.STRING)
    @Column(name = "direction", length = 16)
    private Direction direction;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private ShuttleStatus status = ShuttleStatus.IDLE;

    @Column(name = "battery_level", nullable = false)
    private Double batteryLevel = 100.0;

    @Column(name = "power_supply_ok", nullable = false)
    private Boolean powerSupplyOk = true;

    @Column(name = "track_alignment_offset")
    private Double trackAlignmentOffset = 0.0;

    @Column(name = "current_task_id", length = 64)
    private String currentTaskId;

    @Column(name = "current_load_weight")
    private Double currentLoadWeight = 0.0;

    @Column(name = "max_load_weight")
    private Double maxLoadWeight = 1000.0;

    @Column(name = "speed")
    private Double speed = 0.0;

    @Column(name = "total_mileage")
    private Double totalMileage = 0.0;

    @Column(name = "last_battery_level")
    private Double lastBatteryLevel = 100.0;

    @Column(name = "last_battery_update_time")
    private LocalDateTime lastBatteryUpdateTime;

    @Column(name = "battery_dip_detected")
    private Boolean batteryDipDetected = false;

    @Column(name = "battery_dip_start_time")
    private LocalDateTime batteryDipStartTime;

    @Column(name = "battery_dip_x")
    private Integer batteryDipX;

    @Column(name = "battery_dip_y")
    private Integer batteryDipY;

    @Column(name = "battery_dip_layer")
    private Integer batteryDipLayer;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
