package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.entity.ShuttleCar;
import com.shuttle.rack.entity.enums.Direction;
import com.shuttle.rack.entity.enums.ShuttleStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataInitializer {

    private final ShuttleCarService shuttleCarService;
    private final RackConfig rackConfig;

    @Transactional
    public void initializeDemoShuttles() {
        if (!shuttleCarService.findAll().isEmpty()) {
            return;
        }

        log.info("初始化演示穿梭车数据...");

        String[][] carConfigs = {
                {"SH-001", "阿尔法一号", "0", "0", "0"},
                {"SH-002", "贝塔二号", "3", "2", "0"},
                {"SH-003", "伽马三号", "7", "0", "0"},
                {"SH-004", "德尔塔四号", "1", "1", "1"},
                {"SH-005", "艾普西龙五号", "5", "3", "1"},
                {"SH-006", "泽塔六号", "0", "4", "2"},
                {"SH-007", "伊塔七号", "4", "2", "2"},
                {"SH-008", "西塔八号", "6", "1", "2"},
        };

        Direction[] directions = Direction.values();
        int idx = 0;

        for (String[] cfg : carConfigs) {
            int x = Integer.parseInt(cfg[2]);
            int y = Integer.parseInt(cfg[3]);
            int layer = Integer.parseInt(cfg[4]);
            x = Math.min(x, rackConfig.getCols() - 1);
            y = Math.min(y, rackConfig.getRows() - 1);
            layer = Math.min(layer, rackConfig.getLayers() - 1);

            ShuttleCar car = ShuttleCar.builder()
                    .carCode(cfg[0])
                    .carName(cfg[1])
                    .posX(x)
                    .posY(y)
                    .posLayer(layer)
                    .direction(directions[idx % 4])
                    .status(ShuttleStatus.IDLE)
                    .batteryLevel(80 + Math.random() * 20)
                    .powerSupplyOk(true)
                    .trackAlignmentOffset(0.0)
                    .speed(0.0)
                    .totalMileage(Math.random() * 100)
                    .maxLoadWeight(1000.0)
                    .currentLoadWeight(Math.random() < 0.4 ? Math.random() * 800 : 0.0)
                    .build();

            try {
                shuttleCarService.create(car);
                log.info("创建穿梭车: {} ({}) 位置: ({}, {}, {})",
                        car.getCarName(), car.getCarCode(), x, y, layer);
            } catch (Exception e) {
                log.error("创建穿梭车 {} 失败: {}", cfg[0], e.getMessage());
            }
            idx++;
        }

        log.info("演示穿梭车初始化完成，共 {} 辆", carConfigs.length);
    }
}
