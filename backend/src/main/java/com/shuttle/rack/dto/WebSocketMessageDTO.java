package com.shuttle.rack.dto;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WebSocketMessageDTO<T> {

    private String type;

    private T payload;

    private LocalDateTime timestamp;

    public static <T> WebSocketMessageDTO<T> of(String type, T payload) {
        return WebSocketMessageDTO.<T>builder()
                .type(type)
                .payload(payload)
                .timestamp(LocalDateTime.now())
                .build();
    }

    public static WebSocketMessageDTO<List<ShuttlePositionUpdateDTO>> shuttleList(
            List<ShuttlePositionUpdateDTO> shuttles) {
        return of("SHUTTLE_LIST", shuttles);
    }

    public static WebSocketMessageDTO<ShuttlePositionUpdateDTO> shuttleUpdate(
            ShuttlePositionUpdateDTO shuttle) {
        return of("SHUTTLE_UPDATE", shuttle);
    }

    public static WebSocketMessageDTO<SystemStatusDTO> systemStatus(SystemStatusDTO status) {
        return of("SYSTEM_STATUS", status);
    }
}
