package com.shuttle.rack.repository;

import com.shuttle.rack.entity.TrackOccupancy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrackOccupancyRepository extends JpaRepository<TrackOccupancy, Long> {

    Optional<TrackOccupancy> findByPosXAndPosYAndPosLayer(Integer posX, Integer posY, Integer posLayer);

    List<TrackOccupancy> findByPosLayer(Integer posLayer);

    List<TrackOccupancy> findByOccupied(Boolean occupied);

    @Query("SELECT t FROM TrackOccupancy t WHERE t.shuttleCarId = :shuttleCarId AND t.occupied = true")
    List<TrackOccupancy> findOccupiedByShuttleCarId(Long shuttleCarId);

    @Query("SELECT COUNT(t) FROM TrackOccupancy t WHERE t.occupied = true AND t.posLayer = :layer")
    Long countOccupiedByLayer(Integer layer);

    @Query("SELECT COUNT(t) FROM TrackOccupancy t WHERE t.hasCargo = true")
    Long countCargoSlots();
}
