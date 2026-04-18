CREATE TABLE IF NOT EXISTS tblOrdenMuestra (
  CodigoOrdenMuestra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  CodigoVisitaMedica BIGINT UNSIGNED NOT NULL,
  CodigoMedico BIGINT UNSIGNED NULL,
  CodigoVisitador BIGINT UNSIGNED NULL,
  CodigoUsuarioVisitador BIGINT UNSIGNED NULL,
  CodigoPais INT UNSIGNED NOT NULL,
  FechaCreacion DATE NOT NULL,
  HoraCreacion TIME NOT NULL,
  CodigoUsuarioCreacion BIGINT UNSIGNED NOT NULL,
  Firma LONGBLOB NOT NULL,
  Estado INT UNSIGNED NOT NULL DEFAULT 1,
  IsActivo TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (CodigoOrdenMuestra),
  UNIQUE KEY uq_tblOrdenMuestra_visita (CodigoVisitaMedica),
  KEY idx_tblOrdenMuestra_visitador (CodigoVisitador),
  KEY idx_tblOrdenMuestra_fecha (FechaCreacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tblOrdenMuestraDetalle (
  CodigoDetalleOrdenMuestra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  CodigoOrdenMuestra BIGINT UNSIGNED NOT NULL,
  CodigoProducto BIGINT UNSIGNED NOT NULL,
  CantidadEntregada INT UNSIGNED NOT NULL,
  CodigoPais INT UNSIGNED NULL,
  FechaCreacion DATE NULL,
  HoraCreacion TIME NULL,
  CodigoUsuarioCreacion BIGINT UNSIGNED NULL,
  IsActivo TINYINT(1) NOT NULL DEFAULT 1,
  CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (CodigoDetalleOrdenMuestra),
  KEY idx_tblOrdenMuestraDetalle_orden (CodigoOrdenMuestra),
  KEY idx_tblOrdenMuestraDetalle_producto (CodigoProducto),
  CONSTRAINT fk_tblOrdenMuestraDetalle_orden
    FOREIGN KEY (CodigoOrdenMuestra) REFERENCES tblOrdenMuestra(CodigoOrdenMuestra)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
