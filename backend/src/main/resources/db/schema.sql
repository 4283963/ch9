-- =====================================================
-- 四向穿梭车轨道微调与滑触线供电状态同步系统 - 数据库脚本
-- Database: MySQL 8.0+
-- =====================================================

CREATE DATABASE IF NOT EXISTS shuttle_rack
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE shuttle_rack;

-- -----------------------------------------------------
-- 穿梭车表
-- -----------------------------------------------------
DROP TABLE IF EXISTS shuttle_car;
CREATE TABLE shuttle_car (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    car_code            VARCHAR(32)  NOT NULL COMMENT '车号唯一标识',
    car_name            VARCHAR(64)  DEFAULT NULL COMMENT '车名',
    pos_x               INT          NOT NULL DEFAULT 0 COMMENT 'X坐标',
    pos_y               INT          NOT NULL DEFAULT 0 COMMENT 'Y坐标',
    pos_layer           INT          NOT NULL DEFAULT 0 COMMENT '层号',
    direction           VARCHAR(16)  DEFAULT NULL COMMENT '行驶方向 NORTH/SOUTH/EAST/WEST/UP/DOWN',
    status              VARCHAR(16)  NOT NULL DEFAULT 'IDLE' COMMENT '状态 IDLE/MOVING/LOADING/UNLOADING/CHARGING/ERROR/OFFLINE',
    battery_level       DOUBLE       NOT NULL DEFAULT 100.0 COMMENT '剩余电量百分比',
    power_supply_ok     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '滑触线供电是否正常',
    track_alignment_offset DOUBLE    DEFAULT 0 COMMENT '轨道微调偏移量(mm)',
    current_task_id     VARCHAR(64)  DEFAULT NULL COMMENT '当前任务ID',
    current_load_weight DOUBLE       DEFAULT 0 COMMENT '当前载重(kg)',
    max_load_weight     DOUBLE       DEFAULT 1000 COMMENT '最大载重(kg)',
    speed               DOUBLE       DEFAULT 0 COMMENT '当前速度(m/s)',
    total_mileage       DOUBLE       DEFAULT 0 COMMENT '累计里程',
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_car_code (car_code),
    KEY idx_status (status),
    KEY idx_layer (pos_layer),
    KEY idx_battery (battery_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='穿梭车主数据';

-- -----------------------------------------------------
-- 轨道占用表
-- -----------------------------------------------------
DROP TABLE IF EXISTS track_occupancy;
CREATE TABLE track_occupancy (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pos_x               INT NOT NULL,
    pos_y               INT NOT NULL,
    pos_layer           INT NOT NULL,
    occupied            TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被占用',
    shuttle_car_id      BIGINT UNSIGNED DEFAULT NULL COMMENT '占用的穿梭车ID',
    car_code            VARCHAR(32) DEFAULT NULL COMMENT '占用车号(冗余)',
    occupied_at         DATETIME DEFAULT NULL COMMENT '占用开始时间',
    has_cargo           TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否有货物',
    is_vertical_lift    TINYINT(1) DEFAULT 0 COMMENT '是否为垂直升降机位',
    is_charging_station TINYINT(1) DEFAULT 0 COMMENT '是否为充电站',
    track_condition_note VARCHAR(255) DEFAULT NULL COMMENT '轨道状态备注',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_pos (pos_x, pos_y, pos_layer),
    KEY idx_occupied (occupied),
    KEY idx_shuttle (shuttle_car_id),
    KEY idx_layer (pos_layer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='轨道节点占用状态';

-- -----------------------------------------------------
-- 滑触线供电回路表
-- -----------------------------------------------------
DROP TABLE IF EXISTS power_line;
CREATE TABLE power_line (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    line_code           VARCHAR(32) UNIQUE NOT NULL COMMENT '回路编号 L0-X_AXIS, L1-Y_AXIS',
    pos_layer           INT NOT NULL COMMENT '所属层号',
    track_axis          VARCHAR(8)  DEFAULT NULL COMMENT '轨道轴向 X_AXIS/Y_AXIS',
    voltage             DOUBLE      DEFAULT 48 COMMENT '当前电压(V)',
    current_amp         DOUBLE      DEFAULT 0 COMMENT '当前电流(A)',
    power_on            TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '是否通电',
    contact_resistance  DOUBLE      DEFAULT 0 COMMENT '接触电阻',
    wear_level          DOUBLE      DEFAULT 0 COMMENT '磨损程度 0-100%',
    temperature         DOUBLE      DEFAULT 25 COMMENT '温度(℃)',
    last_maintenance_at DATETIME    DEFAULT NULL COMMENT '上次维护时间',
    created_at          DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_line_code (line_code),
    KEY idx_layer (pos_layer),
    KEY idx_power_on (power_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='滑触线供电回路状态';

-- -----------------------------------------------------
-- 初始化示例穿梭车数据
-- -----------------------------------------------------
INSERT INTO shuttle_car (car_code, car_name, pos_x, pos_y, pos_layer, direction, status, battery_level, power_supply_ok) VALUES
('SH-001', '阿尔法一号', 0, 0, 0, 'EAST',  'IDLE',   92.5, 1),
('SH-002', '贝塔二号',   3, 2, 0, 'NORTH', 'MOVING', 78.3, 1),
('SH-003', '伽马三号',   7, 0, 0, 'SOUTH', 'IDLE',   85.0, 1),
('SH-004', '德尔塔四号', 1, 1, 1, 'WEST',  'LOADING',65.2, 1),
('SH-005', '艾普西龙五号',5, 3, 1, 'EAST', 'MOVING', 45.8, 0),
('SH-006', '泽塔六号',   0, 4, 2, 'EAST',  'CHARGING',12.5, 1),
('SH-007', '伊塔七号',   4, 2, 2, 'NORTH', 'MOVING', 88.1, 1),
('SH-008', '西塔八号',   6, 1, 2, 'SOUTH', 'IDLE',   73.6, 1);

-- -----------------------------------------------------
-- 初始化轨道数据 (5 rows x 8 cols x 3 layers = 120)
-- -----------------------------------------------------
DELIMITER //
DROP PROCEDURE IF EXISTS init_tracks //
CREATE PROCEDURE init_tracks()
BEGIN
    DECLARE l, y, x INT;
    SET l = 0;
    WHILE l < 3 DO
        SET y = 0;
        WHILE y < 5 DO
            SET x = 0;
            WHILE x < 8 DO
                INSERT INTO track_occupancy (pos_x, pos_y, pos_layer, occupied, has_cargo, is_charging_station, is_vertical_lift)
                VALUES (x, y, l, 0,
                    IF(RAND() < 0.3 AND NOT(x=0 AND y=0), 1, 0),
                    IF(x=0 AND y=0, 1, 0),
                    IF(x=7 AND y=4, 1, 0));
                SET x = x + 1;
            END WHILE;
            SET y = y + 1;
        END WHILE;
        SET l = l + 1;
    END WHILE;
END //
DELIMITER ;
CALL init_tracks();
DROP PROCEDURE init_tracks;

-- -----------------------------------------------------
-- 初始化滑触线回路
-- -----------------------------------------------------
INSERT INTO power_line (line_code, pos_layer, track_axis, voltage, current_amp, power_on, temperature, wear_level) VALUES
('L0-X_AXIS', 0, 'X_AXIS', 48.3, 6.2, 1, 32.5, 12.0),
('L0-Y_AXIS', 0, 'Y_AXIS', 47.9, 5.8, 1, 30.1, 8.5),
('L1-X_AXIS', 1, 'X_AXIS', 48.1, 7.5, 1, 35.8, 18.3),
('L1-Y_AXIS', 1, 'Y_AXIS', 47.8, 4.9, 1, 33.4, 15.0),
('L2-X_AXIS', 2, 'X_AXIS', 48.0, 5.1, 1, 29.6, 6.7),
('L2-Y_AXIS', 2, 'Y_AXIS', 48.2, 6.4, 1, 31.2, 10.5);
