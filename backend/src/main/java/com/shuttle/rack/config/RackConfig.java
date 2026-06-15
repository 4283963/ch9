package com.shuttle.rack.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Data
@Configuration
@ConfigurationProperties(prefix = "shuttle.rack")
public class RackConfig {

    private Integer rows = 5;

    private Integer cols = 8;

    private Integer layers = 3;

    public int getTotalTracks() {
        return rows * cols * layers;
    }

    public boolean isValidPosition(int x, int y, int layer) {
        return x >= 0 && x < cols && y >= 0 && y < rows && layer >= 0 && layer < layers;
    }
}
