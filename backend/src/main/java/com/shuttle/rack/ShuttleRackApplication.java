package com.shuttle.rack;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ShuttleRackApplication {

    public static void main(String[] args) {
        SpringApplication.run(ShuttleRackApplication.class, args);
    }
}
