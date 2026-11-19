CREATE DATABASE IF NOT EXISTS aquasentry
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aquasentry;

CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ts BIGINT NOT NULL,
  sensor VARCHAR(32) NOT NULL,
  value DOUBLE NOT NULL,
  unit VARCHAR(16) NOT NULL DEFAULT '',
  stage ENUM('intake', 'outlet') NOT NULL DEFAULT 'intake',
  mode ENUM('normal', 'abnormal') NOT NULL DEFAULT 'normal',
  status VARCHAR(16) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_sensor_readings_ts (ts),
  INDEX idx_sensor_readings_sensor_ts (sensor, ts),
  INDEX idx_sensor_readings_stage_ts (stage, ts)
) ENGINE=InnoDB;
