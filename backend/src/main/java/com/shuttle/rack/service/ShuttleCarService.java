package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.dto.ShuttlePositionUpdateDTO;
import com.shuttle.rack.dto.TrackFaultDTO;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import com.shuttle.rack.repository.ShuttleCarRepository;
import com.shuttle.rack.websocket.RackWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
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
    private final RackWebSocketHandler webSocketHandler;

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
        if (dto.getTrackAlignmentOffset() != null) car.setTrackAlignmentOffset(dto.getTrackAlignmentOffset());
        if (dto.getSpeed() != null) car.setSpeed(dto.getSpeed());
        if (dto.getPowerSupplyOk() != null) car.setPowerSupplyOk(dto.getPowerSupplyOk());

        if (dto.getBatteryLevel() != null) {
            detectAndProcessBatteryDip(car, dto.getBatteryLevel());
        }

        return shuttleCarRepository.save(car);
    }

    @Transactional
    public void detectAndProcessBatteryDip(ShuttleCar car, Double newBattery) {
        LocalDateTime now = LocalDateTime.now();
        Double oldBattery = car.getLastBatteryLevel();

        if (!car.getBatteryDipDetected() &&
            oldBattery != null &&
            oldBattery > 20.0 &&
            newBattery < 5.0) {

            car.setBatteryDipDetected(true);
            car.setBatteryDipStartTime(now);
            car.setBatteryDipX(car.getPosX());
            car.setBatteryDipY(car.getPosY());
            car.setBatteryDipLayer(car.getPosLayer());
            log.warn("穿梭车 [{}] 检测到电量骤跌: {}% → {}%, 位置: ({},{},{})",
                    car.getCarCode(), oldBattery, newBattery,
                    car.getPosX(), car.getPosY(), car.getPosLayer());
        }

        if (car.getBatteryDipDetected() &&
            car.getBatteryDipStartTime() != null &&
            newBattery > 15.0 &&
            Duration.between(car.getBatteryDipStartTime(), now).getSeconds() <= 2) {

            TrackFaultDTO fault = TrackFaultDTO.builder()
                    .trackX(car.getBatteryDipX())
                    .trackY(car.getBatteryDipY())
                    .trackLayer(car.getBatteryDipLayer())
                    .shuttleCode(car.getCarCode())
                    .shuttleName(car.getCarName())
                    .faultType("POWER_DIP")
                    .severity("WARNING")
                    .batteryBefore(oldBattery)
                    .batteryDuring(newBattery)
                    .batteryAfter(newBattery)
                    .detectedAt(now)
                    .description(String.format("滑触线接触不良: 电量在%d秒内从%.1f%%骤跌至%.1f%%后恢复",
                            Duration.between(car.getBatteryDipStartTime(), now).getSeconds() + 1,
                            oldBattery, car.getBatteryLevel()))
                    .build();

            webSocketHandler.broadcastTrackFault(fault);

            car.setBatteryDipDetected(false);
            car.setBatteryDipStartTime(null);
            car.setBatteryDipX(null);
            car.setBatteryDipY(null);
            car.setBatteryDipLayer(null);
        }

        if (car.getBatteryDipDetected() &&
            car.getBatteryDipStartTime() != null &&
            Duration.between(car.getBatteryDipStartTime(), now).getSeconds() > 3) {
            car.setBatteryDipDetected(false);
            car.setBatteryDipStartTime(null);
            car.setBatteryDipX(null);
            car.setBatteryDipY(null);
            car.setBatteryDipLayer(null);
            log.debug("穿梭车 [{}] 电量下跌超时未恢复, 重置检测状态", car.getCarCode());
        }

        car.setLastBatteryLevel(newBattery);
        car.setLastBatteryUpdateTime(now);
        car.setBatteryLevel(newBattery);
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
