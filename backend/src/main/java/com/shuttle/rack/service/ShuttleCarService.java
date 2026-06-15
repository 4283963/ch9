package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.dto.ShuttlePositionUpdateDTO;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import com.shuttle.rack.repository.ShuttleCarRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShuttleCarService {

    private final ShuttleCarRepository shuttleCarRepository;
    private final TrackOccupancyService trackOccupancyService;
    private final RackConfig rackConfig;

    public List<ShuttleCar> findAll() {
        return shuttleCarRepository.findAll();
    }

    public Optional<ShuttleCar> findById(Long id) {
        return shuttleCarRepository.findById(id);
    }

    public Optional<ShuttleCar> findByCarCode(String carCode) {
        return shuttleCarRepository.findByCarCode(carCode);
    }

    public List<ShuttleCar> findByStatus(ShuttleStatus status) {
        return shuttleCarRepository.findByStatus(status);
    }

    public List<ShuttlePositionUpdateDTO> findAllPositionDTOs() {
        return shuttleCarRepository.findAll().stream()
                .map(this::toPositionDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public ShuttleCar create(ShuttleCar car) {
        if (shuttleCarRepository.findByCarCode(car.getCarCode()).isPresent()) {
            throw new IllegalArgumentException("车号已存在: " + car.getCarCode());
        }
        if (!rackConfig.isValidPosition(car.getPosX(), car.getPosY(), car.getPosLayer())) {
            throw new IllegalArgumentException("位置超出货架范围");
        }
        ShuttleCar saved = shuttleCarRepository.save(car);
        trackOccupancyService.occupyPosition(
                car.getPosX(), car.getPosY(), car.getPosLayer(),
                saved.getId(), saved.getCarCode());
        return saved;
    }

    @Transactional
    public ShuttleCar updatePosition(ShuttlePositionUpdateDTO dto) {
        ShuttleCar car = shuttleCarRepository.findByCarCode(dto.getCarCode())
                .orElseThrow(() -> new IllegalArgumentException("穿梭车不存在: " + dto.getCarCode()));

        if (dto.getPosX() != null && dto.getPosY() != null && dto.getPosLayer() != null) {
            if (!rackConfig.isValidPosition(dto.getPosX(), dto.getPosY(), dto.getPosLayer())) {
                throw new IllegalArgumentException("位置超出货架范围");
            }
            if (trackOccupancyService.isOccupiedByOther(
                    dto.getPosX(), dto.getPosY(), dto.getPosLayer(), car.getId())) {
                log.warn("目标位置已被占用: ({}, {}, {})", dto.getPosX(), dto.getPosY(), dto.getPosLayer());
            } else {
                trackOccupancyService.releasePosition(car.getPosX(), car.getPosY(), car.getPosLayer());
                car.setPosX(dto.getPosX());
                car.setPosY(dto.getPosY());
                car.setPosLayer(dto.getPosLayer());
                trackOccupancyService.occupyPosition(
                        dto.getPosX(), dto.getPosY(), dto.getPosLayer(), car.getId(), car.getCarCode());
                car.setTotalMileage(car.getTotalMileage() + 1.0);
            }
        }

        if (dto.getDirection() != null) car.setDirection(dto.getDirection());
        if (dto.getStatus() != null) car.setStatus(dto.getStatus());
        if (dto.getBatteryLevel() != null) car.setBatteryLevel(dto.getBatteryLevel());
        if (dto.getPowerSupplyOk() != null) car.setPowerSupplyOk(dto.getPowerSupplyOk());
        if (dto.getTrackAlignmentOffset() != null) car.setTrackAlignmentOffset(dto.getTrackAlignmentOffset());
        if (dto.getSpeed() != null) car.setSpeed(dto.getSpeed());

        return shuttleCarRepository.save(car);
    }

    @Transactional
    public void delete(Long id) {
        ShuttleCar car = shuttleCarRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("穿梭车不存在"));
        trackOccupancyService.releasePosition(car.getPosX(), car.getPosY(), car.getPosLayer());
        shuttleCarRepository.deleteById(id);
    }

    public ShuttlePositionUpdateDTO toPositionDTO(ShuttleCar car) {
        return ShuttlePositionUpdateDTO.builder()
                .carCode(car.getCarCode())
                .posX(car.getPosX())
                .posY(car.getPosY())
                .posLayer(car.getPosLayer())
                .direction(car.getDirection())
                .status(car.getStatus())
                .batteryLevel(car.getBatteryLevel())
                .powerSupplyOk(car.getPowerSupplyOk())
                .trackAlignmentOffset(car.getTrackAlignmentOffset())
                .speed(car.getSpeed())
                .timestamp(car.getUpdatedAt())
                .build();
    }

    public List<ShuttleCar> findLowBatteryShuttles() {
        return shuttleCarRepository.findLowBatteryShuttles();
    }

    public List<ShuttleCar> findShuttlesWithPowerIssue() {
        return shuttleCarRepository.findShuttlesWithPowerIssue();
    }

    public Long countMovingShuttles() {
        return shuttleCarRepository.countMovingShuttles();
    }
}
