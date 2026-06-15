package com.shuttle.rack.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.shuttle.rack.dto.ShuttlePositionUpdateDTO;
import com.shuttle.rack.dto.SystemStatusDTO;
import com.shuttle.rack.dto.WebSocketMessageDTO;
import com.shuttle.rack.service.ShuttleCarService;
import com.shuttle.rack.service.SystemStatusService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Component
@RequiredArgsConstructor
public class RackWebSocketHandler extends TextWebSocketHandler {

    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper;
    private final ShuttleCarService shuttleCarService;
    private final SystemStatusService systemStatusService;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        log.info("新WebSocket连接建立: {}, 当前连接数: {}", session.getId(), sessions.size());

        List<ShuttlePositionUpdateDTO> shuttleList = shuttleCarService.findAllPositionDTOs();
        SystemStatusDTO systemStatus = systemStatusService.getSystemStatus();

        sendToSession(session, WebSocketMessageDTO.shuttleList(shuttleList));
        sendToSession(session, WebSocketMessageDTO.systemStatus(systemStatus));

        sendToSession(session, WebSocketMessageDTO.of("CONNECTED",
                "连接成功，会话ID: " + session.getId()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        log.debug("收到客户端消息: {}", payload);

        try {
            var node = objectMapper.readTree(payload);
            String type = node.has("type") ? node.get("type").asText() : "UNKNOWN";

            switch (type) {
                case "PING":
                    sendToSession(session, WebSocketMessageDTO.of("PONG", System.currentTimeMillis()));
                    break;
                case "REQUEST_SHUTTLE_LIST":
                    List<ShuttlePositionUpdateDTO> list = shuttleCarService.findAllPositionDTOs();
                    sendToSession(session, WebSocketMessageDTO.shuttleList(list));
                    break;
                case "REQUEST_SYSTEM_STATUS":
                    SystemStatusDTO status = systemStatusService.getSystemStatus();
                    sendToSession(session, WebSocketMessageDTO.systemStatus(status));
                    break;
                default:
                    log.warn("未知消息类型: {}", type);
            }
        } catch (Exception e) {
            log.error("处理WebSocket消息出错", e);
            sendToSession(session, WebSocketMessageDTO.of("ERROR", e.getMessage()));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        sessions.remove(session);
        log.info("WebSocket连接关闭: {}, 状态: {}, 当前连接数: {}",
                session.getId(), status, sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket传输错误, 会话: {}", session.getId(), exception);
        sessions.remove(session);
    }

    public <T> void broadcast(WebSocketMessageDTO<T> message) {
        if (sessions.isEmpty()) return;

        TextMessage textMessage;
        try {
            textMessage = new TextMessage(objectMapper.writeValueAsString(message));
        } catch (Exception e) {
            log.error("序列化WebSocket消息失败", e);
            return;
        }

        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(textMessage);
                } catch (IOException e) {
                    log.error("发送WebSocket消息失败, 会话: {}", session.getId(), e);
                }
            }
        }
    }

    public void broadcastShuttleUpdate(ShuttlePositionUpdateDTO dto) {
        broadcast(WebSocketMessageDTO.shuttleUpdate(dto));
    }

    public void broadcastSystemStatus() {
        broadcast(WebSocketMessageDTO.systemStatus(systemStatusService.getSystemStatus()));
    }

    private <T> void sendToSession(WebSocketSession session, WebSocketMessageDTO<T> message) {
        if (!session.isOpen()) return;
        try {
            session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
        } catch (Exception e) {
            log.error("发送WebSocket消息到会话 {} 失败", session.getId(), e);
        }
    }

    public int getActiveSessionCount() {
        return sessions.size();
    }
}
