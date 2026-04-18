const path = require('path');

function normalizeBasePath(basePath = '/visitas') {
  let normalized = (basePath || '/visitas').trim();

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/+$|\s+/g, '');

  return normalized || '/visitas';
}

const basePath = normalizeBasePath(process.env.APP_BASE_PATH || '/visitas');

const appConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  basePath,
  frontendDistPath: path.resolve(__dirname, '../../../frontend/dist'),
  jwtSecret: process.env.JWT_SECRET || 'change_this_super_secret_key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  outsystemsVerifyUrl:
    process.env.OUTSYSTEMS_VERIFY_URL ||
    'https://fep-dev.outsystemsenterprise.com/api/rest/general/VerificarPassword',
  s3Storage: {
    setArchivoUrl:
      process.env.S3_SET_ARCHIVO_URL ||
      'https://fcrs-dev.outsystemsenterprise.com/api/rest/s3/SetArchivo',
    getUrlEndpoint:
      process.env.S3_GET_URL_ENDPOINT ||
      'https://fcrs-dev.outsystemsenterprise.com/api/rest/s3/GetUrl',
    defaultTableName:
      process.env.S3_DEFAULT_TABLE_NAME || 'tblEntregaMuestras',
    timeoutMs: Number(process.env.S3_TIMEOUT_MS || 20000)
  },
  frontendOrigin: process.env.FRONTEND_ORIGIN || '',
  personasAuth: {
    tableName: process.env.PERSONAS_TABLE || 'tblPersonas',
    idColumn: process.env.PERSONAS_ID_COLUMN || 'idPersona',
    usernameColumn: process.env.PERSONAS_USERNAME_COLUMN || 'Correo_electronico',
    credentialsColumn: process.env.PERSONAS_CREDENTIALS_COLUMN || 'credenciales',
    countryColumn: process.env.PERSONAS_COUNTRY_COLUMN || 'CodigoPais',
    countryValue: Number(process.env.PERSONAS_COUNTRY_VALUE || 4),
    nameColumn:
      process.env.PERSONAS_NAME_COLUMN ||
      process.env.PERSONAS_USERNAME_COLUMN ||
      'Correo_electronico'
  },
  directory: {
    dbName: process.env.DIRECTORY_DB_NAME || 'dbVisitasMedicas',
    assignmentSourceColumn:
      process.env.DIRECTORY_ASSIGNMENT_SOURCE_COLUMN || 'CodigoVisitador',
    visitadorTable: process.env.DIRECTORY_VISITADOR_TABLE || 'tblVisitador',
    medicosXVisitadorTable:
      process.env.DIRECTORY_MEDICOS_X_VISITADOR_TABLE || 'tblMedicosXVisitador',
    sucursalesXVisitadorTable:
      process.env.DIRECTORY_SUCURSALES_X_VISITADOR_TABLE ||
      'tblSucursalesXVisitador',
    medicoTable: process.env.DIRECTORY_MEDICO_TABLE || 'tblMedico',
    plazaMedicaTable: process.env.DIRECTORY_PLAZA_MEDICA_TABLE || 'tblPlazaMedica',
    hospitalTable:
      process.env.DIRECTORY_HOSPITAL_CLINICA_TABLE || 'tblHospitalClinica',
    especialidadTable: process.env.DIRECTORY_ESPECIALIDAD_TABLE || 'tblEspecialidad',
    especialidadesXMedicoTable:
      process.env.DIRECTORY_ESPECIALIDADES_X_MEDICO_TABLE ||
      'tblEspecialidadesXMedico',
    especialidadesByMedicoTable:
      process.env.DIRECTORY_ESPECIALIDADES_BY_MEDICO_TABLE ||
      process.env.DIRECTORY_ESPECIALIDADES_X_MEDICO_TABLE ||
      'tblEspecialidadesXMedico',
    categoriaTable:
      process.env.DIRECTORY_CATEGORIA_MEDICO_TABLE || 'tblCategoriaMedico',
    geoDivisionL1Table:
      process.env.DIRECTORY_GEO_DIVISION_L1_TABLE || 'tblGeoDivisionL1',
    geoDivisionL2Table:
      process.env.DIRECTORY_GEO_DIVISION_L2_TABLE || 'tblGeoDivisionL2',
    rangoPrecioConsultaTable:
      process.env.DIRECTORY_RANGO_PRECIO_CONSULTA_TABLE || 'tblRangoPrecioConsulta',
    lineasProductoXMedicoTable:
      process.env.DIRECTORY_LINEAS_PRODUCTO_X_MEDICO_TABLE || 'tblLineasProductoXMedico',
    lineaProductoTable:
      process.env.DIRECTORY_LINEA_PRODUCTO_TABLE || 'tblLineaProducto',
    sucursalCatalogDbName:
      process.env.DIRECTORY_SUCURSAL_CATALOG_DB_NAME ||
      process.env.CORP_DB_NAME ||
      'dbpqiygwlvvnhg',
    sucursalCatalogTable:
      process.env.DIRECTORY_SUCURSAL_CATALOG_TABLE || 'tblSucursales',
    sucursalCatalogIdColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_ID_COLUMN || 'Codigo_Sucursal',
    sucursalCatalogNameColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_NAME_COLUMN || 'Nombre_Sucursal',
    sucursalCatalogCodeColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_CODE_COLUMN || 'Codigo_InternoSucursal',
    sucursalCatalogAddressColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_ADDRESS_COLUMN || 'DireccionSucursal',
    sucursalCatalogEmailColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_EMAIL_COLUMN || 'correoSucursal',
    sucursalCatalogActiveColumn:
      process.env.DIRECTORY_SUCURSAL_CATALOG_ACTIVE_COLUMN || 'isActivo',
    sucursalInfoViewTable:
      process.env.DIRECTORY_SUCURSAL_INFO_VIEW_TABLE || 'vstSucursalesInfoXPersonas',
    personasGATable: process.env.DIRECTORY_PERSONAS_GA_TABLE || 'tblPersonasGA',
    personasGFTable: process.env.DIRECTORY_PERSONAS_GF_TABLE || 'tblPersonasGF',
    personasGOTable: process.env.DIRECTORY_PERSONAS_GO_TABLE || 'tblPersonasGO'
  },
  calendar: {
    dbName:
      process.env.CALENDAR_DB_NAME ||
      process.env.DIRECTORY_DB_NAME ||
      'dbVisitasMedicas',
    visitaMedicaTable:
      process.env.CALENDAR_VISITA_MEDICA_TABLE || 'tblVisitaMedica',
    tipoVisitaTable: process.env.CALENDAR_TIPO_VISITA_TABLE || 'tblTipoVisita',
    tipoCanalTable: process.env.CALENDAR_TIPO_CANAL_TABLE || 'tblTipoCanal',
    estadoTable: process.env.CALENDAR_ESTADO_TABLE || 'tblEstado',
    medicoTable:
      process.env.CALENDAR_MEDICO_TABLE ||
      process.env.DIRECTORY_MEDICO_TABLE ||
      'tblMedico',
    sucursalCatalogDbName:
      process.env.CALENDAR_SUCURSAL_DB_NAME ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_DB_NAME ||
      process.env.CORP_DB_NAME ||
      'dbpqiygwlvvnhg',
    sucursalCatalogTable:
      process.env.CALENDAR_SUCURSAL_TABLE ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_TABLE ||
      'tblSucursales',
    sucursalCatalogIdColumn:
      process.env.CALENDAR_SUCURSAL_ID_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_ID_COLUMN ||
      'Codigo_Sucursal',
    sucursalCatalogNameColumn:
      process.env.CALENDAR_SUCURSAL_NAME_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_NAME_COLUMN ||
      'Nombre_Sucursal',
    sucursalCatalogCodeColumn:
      process.env.CALENDAR_SUCURSAL_CODE_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_CODE_COLUMN ||
      'Codigo_InternoSucursal',
    sucursalCatalogActiveColumn:
      process.env.CALENDAR_SUCURSAL_ACTIVE_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_ACTIVE_COLUMN ||
      'isActivo',
    motivoCancelacionTable:
      process.env.CALENDAR_MOTIVO_CANCELACION_TABLE ||
      'tblMotivoCancelacion',
    defaultProgrammedStatusCode: Number(
      process.env.CALENDAR_DEFAULT_PROGRAMMED_STATUS_CODE || 1
    ),
    defaultCountryCode: Number(process.env.CALENDAR_DEFAULT_COUNTRY_CODE || 4)
  },
  home: {
    dbName:
      process.env.HOME_DB_NAME ||
      process.env.DIRECTORY_DB_NAME ||
      'dbVisitasMedicas',
    cycleTable: process.env.HOME_CYCLE_TABLE || 'tblCicloVisita',
    visitaMedicaTable:
      process.env.HOME_VISITA_MEDICA_TABLE || 'tblVisitaMedica',
    medicoTable: process.env.HOME_MEDICO_TABLE || 'tblMedico',
    medicosXVisitadorTable:
      process.env.HOME_MEDICOS_X_VISITADOR_TABLE || 'tblMedicosXVisitador'
  },
  multimedia: {
    dbName:
      process.env.MULTIMEDIA_DB_NAME ||
      process.env.DIRECTORY_DB_NAME ||
      process.env.CALENDAR_DB_NAME ||
      process.env.HOME_DB_NAME ||
      process.env.CORP_DB_NAME ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_DB_NAME ||
      'dbVisitasMedicas',
    multimediaTable:
      process.env.MULTIMEDIA_TABLE || 'tblMultimedia',
    tipoMultimediaTable:
      process.env.MULTIMEDIA_TIPO_TABLE || 'tblTipoMultimedia',
    portadaTable:
      process.env.MULTIMEDIA_PORTADA_TABLE || 'BinarioPortadaMultimedia',
    multimediaIdColumn:
      process.env.MULTIMEDIA_ID_COLUMN || 'CodigoMultimedia',
    multimediaNameColumn:
      process.env.MULTIMEDIA_NAME_COLUMN || 'NombreMultimedia',
    multimediaDescriptionColumn:
      process.env.MULTIMEDIA_DESCRIPTION_COLUMN || 'Descripcion',
    multimediaFileNameColumn:
      process.env.MULTIMEDIA_FILE_NAME_COLUMN || 'NombreArchivo',
    multimediaTypeColumn:
      process.env.MULTIMEDIA_TYPE_COLUMN || 'CodigoTipoMultimedia',
    multimediaIsActiveColumn:
      process.env.MULTIMEDIA_IS_ACTIVE_COLUMN || 'IsActive',
    multimediaS3KeyColumn:
      process.env.MULTIMEDIA_S3KEY_COLUMN || 'S3KeyArchivo',
    multimediaMimeTypeColumn:
      process.env.MULTIMEDIA_MIME_TYPE_COLUMN || 'MimeType',
    multimediaUrlColumn:
      process.env.MULTIMEDIA_URL_COLUMN || 'UrlArchivo',
    tipoMultimediaIdColumn:
      process.env.MULTIMEDIA_TIPO_ID_COLUMN || 'CodigoTipoMultimedia',
    tipoMultimediaNameColumn:
      process.env.MULTIMEDIA_TIPO_NAME_COLUMN || 'TipoMultimedia',
    tipoMultimediaIsActiveColumn:
      process.env.MULTIMEDIA_TIPO_IS_ACTIVE_COLUMN || 'IsActive',
    portadaMultimediaIdColumn:
      process.env.MULTIMEDIA_PORTADA_MEDIA_ID_COLUMN || 'CodigoMultimedia',
    portadaS3KeyColumn:
      process.env.MULTIMEDIA_PORTADA_S3KEY_COLUMN || 'S3KeyPortada',
    portadaIsActiveColumn:
      process.env.MULTIMEDIA_PORTADA_IS_ACTIVE_COLUMN || 'IsActive',
    defaultSearchLimit: Number(process.env.MULTIMEDIA_DEFAULT_LIMIT || 200)
  },
  visitExecution: {
    dbName:
      process.env.VISIT_EXECUTION_DB_NAME ||
      process.env.DIRECTORY_DB_NAME ||
      'dbVisitasMedicas',
    visitaMedicaTable:
      process.env.VISIT_EXECUTION_VISITA_MEDICA_TABLE ||
      process.env.CALENDAR_VISITA_MEDICA_TABLE ||
      'tblVisitaMedica',
    estadoTable:
      process.env.VISIT_EXECUTION_ESTADO_TABLE ||
      process.env.CALENDAR_ESTADO_TABLE ||
      'tblEstado',
    medicoTable:
      process.env.VISIT_EXECUTION_MEDICO_TABLE ||
      process.env.CALENDAR_MEDICO_TABLE ||
      process.env.DIRECTORY_MEDICO_TABLE ||
      'tblMedico',
    parrillaTable:
      process.env.VISIT_EXECUTION_PARRILLA_TABLE || 'tblParrilla',
    familiaProductoTable:
      process.env.VISIT_EXECUTION_FAMILIA_PRODUCTO_TABLE || 'tblFamiliaProducto',
    familiaProductoNameColumn:
      process.env.VISIT_EXECUTION_FAMILIA_PRODUCTO_NAME_COLUMN ||
      'NombreFamiliaProdructo',
    familiasXParrillaTable:
      process.env.VISIT_EXECUTION_FAMILIAS_X_PARRILLA_TABLE ||
      'tblFamiliasXParrilla',
    productoTable:
      process.env.VISIT_EXECUTION_PRODUCTO_TABLE || 'tblProducto',
    productosXFamiliaTable:
      process.env.VISIT_EXECUTION_PRODUCTOS_X_FAMILIA_TABLE ||
      'tblProductosXFamilia',
    nombresProductoXPaisTable:
      process.env.VISIT_EXECUTION_NOMBRES_PRODUCTO_X_PAIS_TABLE ||
      'tblNombresProductoXPais',
    favoritosTable:
      process.env.VISIT_EXECUTION_FAVORITOS_TABLE ||
      'tblProductosFavoritosXMedico',
    entregaMuestrasTable:
      process.env.VISIT_EXECUTION_ENTREGA_MUESTRAS_TABLE ||
      'tblEntregaMuestras',
    productosXEntregaMuestrasTable:
      process.env.VISIT_EXECUTION_PRODUCTOS_X_ENTREGA_MUESTRAS_TABLE ||
      'tblProductosXEntregaMuestras',
    binarioOrdenMuestraFirmasTable:
      process.env.VISIT_EXECUTION_BINARIO_ORDEN_MUESTRA_FIRMAS_TABLE ||
      'BinarioOrdenMuestraFirmas',
    ordenMuestraTable:
      process.env.VISIT_EXECUTION_ORDEN_MUESTRA_TABLE ||
      'tblOrdenMuestra',
    ordenMuestraDetalleTable:
      process.env.VISIT_EXECUTION_ORDEN_MUESTRA_DETALLE_TABLE ||
      'tblOrdenMuestraDetalle',
    sampleProductTypeCode: Number(
      process.env.VISIT_EXECUTION_SAMPLE_PRODUCT_TYPE_CODE || 1
    ),
    sampleOutputTypeCode: Number(
      process.env.VISIT_EXECUTION_SAMPLE_OUTPUT_TYPE_CODE || 2
    ),
    sampleOrderDefaultStatus: Number(
      process.env.VISIT_EXECUTION_SAMPLE_ORDER_DEFAULT_STATUS || 1
    ),
    countryCode: Number(
      process.env.VISIT_EXECUTION_COUNTRY_CODE ||
        process.env.CALENDAR_DEFAULT_COUNTRY_CODE ||
        4
    ),
    favoriteCountryCode:
      process.env.VISIT_EXECUTION_FAVORITE_COUNTRY_CODE || 'HN',
    completedStatusCode: Number(
      process.env.VISIT_EXECUTION_COMPLETED_STATUS_CODE || 5
    ),
    timezone:
      process.env.VISIT_EXECUTION_TIMEZONE || 'America/Tegucigalpa',
    sucursalCatalogDbName:
      process.env.VISIT_EXECUTION_SUCURSAL_DB_NAME ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_DB_NAME ||
      process.env.CORP_DB_NAME ||
      'dbpqiygwlvvnhg',
    sucursalCatalogTable:
      process.env.VISIT_EXECUTION_SUCURSAL_TABLE ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_TABLE ||
      'tblSucursales',
    sucursalCatalogIdColumn:
      process.env.VISIT_EXECUTION_SUCURSAL_ID_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_ID_COLUMN ||
      'Codigo_Sucursal',
    sucursalCatalogNameColumn:
      process.env.VISIT_EXECUTION_SUCURSAL_NAME_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_NAME_COLUMN ||
      'Nombre_Sucursal',
    sucursalCatalogAddressColumn:
      process.env.VISIT_EXECUTION_SUCURSAL_ADDRESS_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_ADDRESS_COLUMN ||
      'DireccionSucursal',
    sucursalCatalogActiveColumn:
      process.env.VISIT_EXECUTION_SUCURSAL_ACTIVE_COLUMN ||
      process.env.DIRECTORY_SUCURSAL_CATALOG_ACTIVE_COLUMN ||
      'isActivo'
  }
};

module.exports = {
  appConfig,
  normalizeBasePath
};
