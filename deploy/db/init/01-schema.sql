-- Esquema inicial de Faro.
-- MySQL ejecuta los archivos de /docker-entrypoint-initdb.d solo la primera
-- vez, cuando el volumen está vacío. La base `faro` y su usuario los crea la
-- propia imagen a partir de MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD_FILE.
SET NAMES utf8mb4;
USE faro;

CREATE TABLE IF NOT EXISTS signals (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  message    VARCHAR(255) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Señal de bienvenida: el mensaje de la guía original del laboratorio.
INSERT INTO signals (message)
VALUES ('¡Felicidades! La conexión completa desde el Frontend hasta la Base de Datos funciona correctamente.');
