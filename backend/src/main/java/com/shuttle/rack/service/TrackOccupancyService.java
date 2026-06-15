package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.entity.TrackOccupancy;
import com.shuttle.rack.repository.TrackOccupancyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TrackOccupancyService {

    private final TrackOccupancyRepository trackOccupancyRepository;
    private final RackConfig rackConfig;

    public List<TrackOccupancy> findAll() {
        return trackOccupancyRepository.findAll();
    }

    public List<TrackOccupancy> findByLayer(Integer layer) {
        return trackOccupancyRepository.findByPosLayer(layer);
    }

    public Optional<TrackOccupancy> findByPosition(Integer x, Integer y, Integer layer) {
        return trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer);
    }

    public boolean isOccupied(Integer x, Integer y, Integer layer) {
        return trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer)
                .map(TrackOccupancy::getOccupied)
                .orElse(false);
    }

    public boolean isOccupiedByOther(Integer x, Integer y, Integer layer, Long shuttleId) {
        return trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer)
                .map(t -> t.getOccupied() && t.getShuttleCarId() != null && !t.getShuttleCarId().equals(shuttleId))
                .orElse(false);
    }

    @Transactional
    public TrackOccupancy occupyPosition(Integer x, Integer y, Integer layer, Long shuttleId, String carCode) {
        if (!rackConfig.isValidPosition(x, y, layer)) {
            throw new IllegalArgumentException("位置超出货架范围");
        }
        TrackOccupancy track = trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer)
                .orElseGet(() -> TrackOccupancy.builder()
                        .posX(x).posY(y).posLayer(layer)
                        .occupied(false).hasCargo(false)
                        .build());

        track.setOccupied(true);
        track.setShuttleCarId(shuttleId);
        track.setCarCode(carCode);
        track.setOccupiedAt(LocalDateTime.now());

        return trackOccupancyRepository.save(track);
    }

    @Transactional
    public TrackOccupancy releasePosition(Integer x, Integer y, Integer layer) {
        TrackOccupancy track = trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer)
                .orElse(null);
        if (track == null) return null;

        track.setOccupied(false);
        track.setShuttleCarId(null);
        track.setCarCode(null);
        track.setOccupiedAt(null);

        return trackOccupancyRepository.save(track);
    }

    @Transactional
    public void setCargoStatus(Integer x, Integer y, Integer layer, boolean hasCargo) {
        TrackOccupancy track = trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer)
                .orElseThrow(() -> new IllegalArgumentException("轨道位置不存在"));
        track.setHasCargo(hasCargo);
        trackOccupancyRepository.save(track);
    }

    @Transactional
    public void initializeAllTracks() {
        log.info("初始化货架轨道矩阵: {}x{}x{}", rackConfig.getRows(), rackConfig.getCols(), rackConfig.getLayers());
        for (int layer = 0; layer < rackConfig.getLayers(); layer++) {
            for (int y = 0; y < rackConfig.getRows(); y++) {
                for (int x = 0; x < rackConfig.getCols(); x++) {
                    if (trackOccupancyRepository.findByPosXAndPosYAndPosLayer(x, y, layer).isEmpty()) {
                        boolean isCharging = (x == 0 && y == 0);
                        boolean isVerticalLift = (x == rackConfig.getCols() - 1 && y == rackConfig.getRows() - 1);
                        boolean hasCargo = Math.random() < 0.3 && !isCharging && !isVerticalLift;

                        TrackOccupancy track = TrackOccupancy.builder()
                                .posX(x).posY(y).posLayer(layer)
                                .occupied(false)
                                .hasCargo(hasCargo)
                                .isChargingStation(isCharging)
                                .isVerticalLift(isVerticalLift)
                                .build();
                        trackOccupancyRepository.save(track);
                    }
                }
            }
        }
        log.info("轨道矩阵初始化完成，共 {} 个轨道节点", rackConfig.getTotalTracks());
    }

    public Long countOccupied() {
        return (long) trackOccupancyRepository.findByOccupied(true).size();
    }

    public Long countOccupiedByLayer(Integer layer) {
        return trackOccupancyRepository.countOccupiedByLayer(layer);
    }

    public Long countCargoSlots() {
        return trackOccupancyRepository.countCargoSlots();
    }
}
