package com.shuttle.rack.repository;

import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ShuttleCarRepository extends JpaRepository<ShuttleCar, Long> {

    Optional<ShuttleCar> findByCarCode(String carCode);

    List<ShuttleCar> findByStatus(ShuttleStatus status);

    List<ShuttleCar> findByPosLayer(Integer posLayer);

    @Query("SELECT s FROM ShuttleCar s WHERE s.powerSupplyOk = false")
    List<ShuttleCar> findShuttlesWithPowerIssue();

    @Query("SELECT s FROM ShuttleCar s WHERE s.batteryLevel < 20")
    List<ShuttleCar> findLowBatteryShuttles();

    @Query("SELECT COUNT(s) FROM ShuttleCar s WHERE s.status = 'MOVING'")
    Long countMovingShuttles();
}
