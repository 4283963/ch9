package com.shuttle.rack.scheduler;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.dto.ShuttlePositionUpdateDTO;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import com.shuttle.rack.service.*;
import com.shuttle.rack.websocket.RackWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Random;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "shuttle.simulation.enabled", havingValue = "true", matchIfMissing = true)
public class ShuttleSimulationScheduler {

    private final ShuttleCarService shuttleCarService;
    private final TrackOccupancyService trackOccupancyService;
    private final PowerLineService powerLineService;
    private final RackWebSocketHandler webSocketHandler;
    private final RackConfig rackConfig;
    private final DataInitializer dataInitializer;
    private final Random random = new Random();

    private boolean initialized = false;

    @Scheduled(initialDelay = 1000, fixedDelay = Long.MAX_VALUE)
    public void initializeSystem() {
        if (!initialized) {
            log.info("执行系统初始化...");
            trackOccupancyService.initializeAllTracks();
            powerLineService.initializePowerLines();
            dataInitializer.initializeDemoShuttles();
            initialized = true;
            log.info("系统初始化完成");
        }
    }

    @Scheduled(fixedRateString = "${shuttle.simulation.interval-ms:500}")
    public void simulateShuttleMovement() {
        if (!initialized) return;

        List<ShuttleCar> shuttles = shuttleCarService.findAll();
        for (ShuttleCar shuttle : shuttles) {
            if (shuttle.getStatus() == ShuttleStatus.ERROR
                    || shuttle.getStatus() == ShuttleStatus.CHARGING
                    || shuttle.getStatus() == ShuttleStatus.OFFLINE) {
                continue;
            }

            if (random.nextDouble() < 0.15) {
                continue;
            }

            Direction[] dirs = Direction.values();
            Direction direction = dirs[random.nextInt(4)];

            int newX = shuttle.getPosX();
            int newY = shuttle.getPosY();
            int newLayer = shuttle.getPosLayer();

            switch (direction) {
                case EAST:
                    newX = Math.min(shuttle.getPosX() + 1, rackConfig.getCols() - 1);
                    break;
                case WEST:
                    newX = Math.max(shuttle.getPosX() - 1, 0);
                    break;
                case SOUTH:
                    newY = Math.min(shuttle.getPosY() + 1, rackConfig.getRows() - 1);
                    break;
                case NORTH:
                    newY = Math.max(shuttle.getPosY() - 1, 0);
                    break;
                case UP:
                    newLayer = Math.min(shuttle.getPosLayer() + 1, rackConfig.getLayers() - 1);
                    break;
                case DOWN:
                    newLayer = Math.max(shuttle.getPosLayer() - 1, 0);
                    break;
            }

            boolean isMoving = (newX != shuttle.getPosX())
                    || (newY != shuttle.getPosY())
                    || (newLayer != shuttle.getPosLayer());

            double newBattery = Math.max(0, shuttle.getBatteryLevel() - (isMoving ? 0.05 : 0.01));
            if (newBattery < 5) {
                newBattery = Math.min(100, newBattery + 5);
            }

            boolean powerOk = random.nextDouble() > 0.01;
            double trackOffset = (random.nextDouble() - 0.5) * 4;

            ShuttleStatus status = isMoving ? ShuttleStatus.MOVING : ShuttleStatus.IDLE;
            if (random.nextDouble() < 0.03) {
                status = ShuttleStatus.LOADING;
            }

            ShuttlePositionUpdateDTO update = ShuttlePositionUpdateDTO.builder()
                    .carCode(shuttle.getCarCode())
                    .posX(newX)
                    .posY(newY)
                    .posLayer(newLayer)
                    .direction(direction)
                    .status(status)
                    .batteryLevel(newBattery)
                    .powerSupplyOk(powerOk)
                    .trackAlignmentOffset(trackOffset)
                    .speed(isMoving ? 1.5 + random.nextDouble() * 2.5 : 0.0)
                    .build();

            try {
                ShuttleCar updated = shuttleCarService.updatePosition(update);
                webSocketHandler.broadcastShuttleUpdate(shuttleCarService.toPositionDTO(updated));
            } catch (Exception e) {
                log.debug("穿梭车 {} 移动模拟失败: {}", shuttle.getCarCode(), e.getMessage());
            }
        }

        powerLineService.simulatePowerFluctuations();
    }

    @Scheduled(fixedRate = 3000)
    public void broadcastSystemStatus() {
        if (!initialized) return;
        try {
            webSocketHandler.broadcastSystemStatus();
        } catch (Exception e) {
            log.debug("广播系统状态失败", e);
        }
    }
}
