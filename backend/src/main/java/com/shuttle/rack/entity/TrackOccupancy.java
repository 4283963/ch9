package com.shuttle.rack.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "track_occupancy",
    uniqueConstraints = @UniqueConstraint(columnNames = {"pos_x", "pos_y", "pos_layer"}))
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrackOccupancy {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "pos_x", nullable = false)
    private Integer posX;

    @Column(name = "pos_y", nullable = false)
    private Integer posY;

    @Column(name = "pos_layer", nullable = false)
    private Integer posLayer;

    @Column(name = "occupied", nullable = false)
    private Boolean occupied = false;

    @Column(name = "shuttle_car_id")
    private Long shuttleCarId;

    @Column(name = "car_code", length = 32)
    private String carCode;

    @Column(name = "occupied_at")
    private LocalDateTime occupiedAt;

    @Column(name = "has_cargo", nullable = false)
    private Boolean hasCargo = false;

    @Column(name = "is_vertical_lift")
    private Boolean isVerticalLift = false;

    @Column(name = "is_charging_station")
    private Boolean isChargingStation = false;

    @Column(name = "track_condition_note", length = 255)
    private String trackConditionNote;

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
