package com.shuttle.rack.repository;

import com.shuttle.rack.entity.PowerLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PowerLineRepository extends JpaRepository<PowerLine, Long> {

    Optional<PowerLine> findByLineCode(String lineCode);

    List<PowerLine> findByPosLayer(Integer posLayer);

    List<PowerLine> findByPowerOn(Boolean powerOn);

    @Query("SELECT p FROM PowerLine p WHERE p.powerOn = false")
    List<PowerLine> findFaultyPowerLines();

    @Query("SELECT p FROM PowerLine p WHERE p.temperature > 60")
    List<PowerLine> findOverheatingLines();
}
