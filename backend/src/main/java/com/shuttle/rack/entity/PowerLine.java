package com.shuttle.rack.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "power_line")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PowerLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "line_code", unique = true, length = 32)
    private String lineCode;

    @Column(name = "pos_layer", nullable = false)
    private Integer posLayer;

    @Column(name = "track_axis", length = 8)
    private String trackAxis;

    @Column(name = "voltage")
    private Double voltage = 48.0;

    @Column(name = "current_amp")
    private Double currentAmp = 0.0;

    @Column(name = "power_on", nullable = false)
    private Boolean powerOn = true;

    @Column(name = "contact_resistance")
    private Double contactResistance = 0.0;

    @Column(name = "wear_level")
    private Double wearLevel = 0.0;

    @Column(name = "temperature")
    private Double temperature = 25.0;

    @Column(name = "last_maintenance_at")
    private LocalDateTime lastMaintenanceAt;

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
