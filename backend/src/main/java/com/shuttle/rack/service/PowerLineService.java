package com.shuttle.rack.service;

import com.shuttle.rack.config.RackConfig;
import com.shuttle.rack.entity.PowerLine;
import com.shuttle.rack.repository.PowerLineRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class PowerLineService {

    private final PowerLineRepository powerLineRepository;
    private final RackConfig rackConfig;
    private final Random random = new Random();

    public List<PowerLine> findAll() {
        return powerLineRepository.findAll();
    }

    public Optional<PowerLine> findByLineCode(String lineCode) {
        return powerLineRepository.findByLineCode(lineCode);
    }

    public List<PowerLine> findByLayer(Integer layer) {
        return powerLineRepository.findByPosLayer(layer);
    }

    public List<PowerLine> findFaultyLines() {
        return powerLineRepository.findFaultyPowerLines();
    }

    public List<PowerLine> findOverheatingLines() {
        return powerLineRepository.findOverheatingLines();
    }

    public Long countFaultyLines() {
        return (long) findFaultyLines().size();
    }

    @Transactional
    public void initializePowerLines() {
        log.info("初始化各层滑触线供电系统...");
        String[] axes = {"X_AXIS", "Y_AXIS"};
        for (int layer = 0; layer < rackConfig.getLayers(); layer++) {
            for (String axis : axes) {
                String code = String.format("L%d-%s", layer, axis);
                if (powerLineRepository.findByLineCode(code).isEmpty()) {
                    PowerLine line = PowerLine.builder()
                            .lineCode(code)
                            .posLayer(layer)
                            .trackAxis(axis)
                            .voltage(48.0)
                            .currentAmp(0.0)
                            .powerOn(true)
                            .contactResistance(0.05 + random.nextDouble() * 0.1)
                            .wearLevel(random.nextDouble() * 10)
                            .temperature(25.0 + random.nextDouble() * 5)
                            .build();
                    powerLineRepository.save(line);
                }
            }
        }
        log.info("滑触线系统初始化完成");
    }

    @Transactional
    public void simulatePowerFluctuations() {
        List<PowerLine> lines = powerLineRepository.findAll();
        for (PowerLine line : lines) {
            double loadFactor = 0.3 + random.nextDouble() * 0.7;
            line.setVoltage(47.5 + random.nextDouble() * 1.5);
            line.setCurrentAmp(5.0 * loadFactor + random.nextDouble() * 3);
            line.setTemperature(25.0 + loadFactor * 20 + random.nextDouble() * 5);
            line.setContactResistance(0.05 + random.nextDouble() * 0.15);
            if (random.nextDouble() < 0.005) {
                line.setPowerOn(false);
                log.warn("滑触线 {} 发生断电故障", line.getLineCode());
            }
            powerLineRepository.save(line);
        }
    }

    @Transactional
    public PowerLine updateStatus(String lineCode, boolean powerOn, Double voltage, Double currentAmp) {
        PowerLine line = powerLineRepository.findByLineCode(lineCode)
                .orElseThrow(() -> new IllegalArgumentException("滑触线不存在: " + lineCode));
        line.setPowerOn(powerOn);
        if (voltage != null) line.setVoltage(voltage);
        if (currentAmp != null) line.setCurrentAmp(currentAmp);
        return powerLineRepository.save(line);
    }
}
