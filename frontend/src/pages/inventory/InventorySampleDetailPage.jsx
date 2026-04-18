import { ArrowLeftOutlined, FileSearchOutlined } from '@ant-design/icons';
import { Col, Empty, Row, Tabs, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppCard, AppInput, AppSelect, AppTable } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { directoryService } from '../../services/directoryService';
import { inventoryService } from '../../services/inventoryService';
import { formatApiError } from '../../utils/formatApiError';
import { sanitizeDisplayText } from '../../utils/sanitizeDisplayText';

const TAB_ENTRADAS = 'entradas';
const TAB_SALIDAS = 'salidas';

function normalizeDateValue(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return text.slice(0, 10);
}

function buildMovementFilters({ tab, fechaEntrega, codigoMedico }) {
  const payload = {
    tab
  };
  const date = normalizeDateValue(fechaEntrega);

  if (tab === TAB_ENTRADAS && date) {
    payload.fechaInicio = date;
    payload.fechaFinal = date;
  }

  if (tab === TAB_SALIDAS && Number(codigoMedico) > 0) {
    payload.codigoMedico = Number(codigoMedico);
  }

  return payload;
}

function formatDateLabel(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '-';
  }

  return text.slice(0, 10);
}

function formatTimeLabel(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '-';
  }

  return text.length >= 5 ? text.slice(0, 5) : text;
}

function formatCellText(value) {
  const text = String(value || '').trim();
  return text || '-';
}

function formatCommentText(value) {
  return sanitizeDisplayText(value, '-');
}

function isRouteNotFoundError(error) {
  const status = Number(error?.response?.status || 0);
  const text = String(error?.response?.data?.message || '').toLowerCase();

  return status === 404 && text.includes('route not found');
}

function buildSummaryMovementRows(inventoryItem = {}, tab = TAB_ENTRADAS) {
  const entradas = Number(inventoryItem?.entradas || 0);
  const salidas = Number(inventoryItem?.salidas || 0);

  if (tab === TAB_ENTRADAS) {
    return entradas > 0
      ? [
          {
            codigoEntrega: `RES-${tab.toUpperCase()}`,
            codigoProducto: Number(inventoryItem?.codigoProducto || 0),
            cantidad: entradas,
            fechaEntregado: '',
            horaEntregado: '',
            codigoTipoEntrega: 1,
            tipoEntrega: 'Resumen de inventario',
            nombreMedico: '',
            personaEntrega: '',
            personaRecibe: '',
            nombreSucursal: '',
            tipoVisita: '',
            comentarios: 'Total acumulado de entradas'
          }
        ]
      : [];
  }

  return salidas > 0
    ? [
        {
          codigoEntrega: `RES-${tab.toUpperCase()}`,
          codigoProducto: Number(inventoryItem?.codigoProducto || 0),
          cantidad: salidas,
          fechaEntregado: '',
          horaEntregado: '',
          codigoTipoEntrega: 2,
          tipoEntrega: 'Resumen de inventario',
          nombreMedico: '',
          personaEntrega: '',
          personaRecibe: '',
          nombreSucursal: '',
          tipoVisita: '',
          comentarios: 'Total acumulado de salidas'
        }
      ]
    : [];
}

function mapDoctorOptions(doctors = []) {
  return (doctors || []).map((doctor) => {
    const codigoMedico = Number(doctor?.codigoMedico || 0);
    const nombreMedico = String(doctor?.nombreMedico || '').trim();

    return {
      value: codigoMedico,
      codigoMedico,
      nombreMedico,
      label: nombreMedico || `Médico ${codigoMedico}`
    };
  });
}

export function InventorySampleDetailPage() {
  const { codigoProducto } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_ENTRADAS);
  const [detailBootstrap, setDetailBootstrap] = useState(null);
  const [movementItems, setMovementItems] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [isLegacySummaryMode, setIsLegacySummaryMode] = useState(false);
  const [filters, setFilters] = useState({
    fechaEntrega: '',
    codigoMedico: undefined
  });
  const movementRequestIdRef = useRef(0);

  const productFromState = location.state?.inventoryItem || null;

  const normalizedCodigoProducto = useMemo(() => {
    const fromParams = Number(codigoProducto || 0);

    if (Number.isFinite(fromParams) && fromParams > 0) {
      return Math.trunc(fromParams);
    }

    const fromState = Number(productFromState?.codigoProducto || 0);

    if (Number.isFinite(fromState) && fromState > 0) {
      return Math.trunc(fromState);
    }

    return 0;
  }, [codigoProducto, productFromState?.codigoProducto]);

  const debouncedFechaEntrega = useDebouncedValue(filters.fechaEntrega, 260);
  const debouncedCodigoMedico = useDebouncedValue(filters.codigoMedico, 180);

  const movementQuery = useMemo(
    () =>
      buildMovementFilters({
        tab: activeTab,
        fechaEntrega: debouncedFechaEntrega,
        codigoMedico: debouncedCodigoMedico
      }),
    [activeTab, debouncedFechaEntrega, debouncedCodigoMedico]
  );

  const currentProduct = useMemo(() => {
    const bootstrapProduct = detailBootstrap?.producto || {};
    const fallbackCode = Number(normalizedCodigoProducto || 0);

    return {
      codigoProducto: fallbackCode,
      nombreProducto:
        String(bootstrapProduct.nombreProducto || '').trim() ||
        String(productFromState?.nombreProducto || '').trim() ||
        `Producto ${fallbackCode}`,
      sku:
        String(bootstrapProduct.sku || '').trim() ||
        String(productFromState?.sku || '').trim(),
      disponible: Number(
        bootstrapProduct.disponible ?? productFromState?.disponible ?? 0
      )
    };
  }, [
    detailBootstrap?.producto,
    normalizedCodigoProducto,
    productFromState?.disponible,
    productFromState?.nombreProducto,
    productFromState?.sku
  ]);

  const movementColumns = useMemo(
    () => [
      {
        title: 'Entrega',
        dataIndex: 'codigoEntrega',
        width: 100,
        align: 'center'
      },
      {
        title: 'Fecha',
        dataIndex: 'fechaEntregado',
        width: 115,
        align: 'center',
        render: (value) => formatDateLabel(value)
      },
      {
        title: 'Hora',
        dataIndex: 'horaEntregado',
        width: 90,
        align: 'center',
        render: (value) => formatTimeLabel(value)
      },
      {
        title: 'Cantidad',
        dataIndex: 'cantidad',
        width: 90,
        align: 'center'
      },
      {
        title: 'Tipo Entrega',
        dataIndex: 'tipoEntrega',
        width: 250,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Médico',
        dataIndex: 'nombreMedico',
        width: 230,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Entrega Por',
        dataIndex: 'personaEntrega',
        width: 190,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Recibe',
        dataIndex: 'personaRecibe',
        width: 190,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Sucursal',
        dataIndex: 'nombreSucursal',
        width: 180,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Tipo Visita',
        dataIndex: 'tipoVisita',
        width: 120,
        align: 'center',
        render: (value) => formatCellText(value)
      },
      {
        title: 'Comentarios',
        dataIndex: 'comentarios',
        width: 220,
        align: 'center',
        render: (value) => formatCommentText(value)
      }
    ],
    []
  );

  const loadBootstrap = async () => {
    if (!normalizedCodigoProducto) {
      setLoadingBootstrap(false);
      setDetailBootstrap(null);
      return;
    }

    setLoadingBootstrap(true);

    try {
      const response = await inventoryService.getProductDetailBootstrap(
        normalizedCodigoProducto
      );
      setIsLegacySummaryMode(false);
      setDetailBootstrap(response || null);
      setDoctorOptions(response?.filtros?.medicos || []);
    } catch (error) {
      if (isRouteNotFoundError(error)) {
        setIsLegacySummaryMode(true);

        try {
          const doctorsResponse = await directoryService.getDoctors();
          setDoctorOptions(mapDoctorOptions(doctorsResponse?.medicos || []));
        } catch {
          setDoctorOptions([]);
        }
      } else {
        messageApi.error(formatApiError(error));
        setDoctorOptions([]);
      }

      setDetailBootstrap(null);
    } finally {
      setLoadingBootstrap(false);
    }
  };

  const loadMovements = async (queryFilters = {}) => {
    if (!normalizedCodigoProducto) {
      setMovementItems([]);
      return;
    }

    const requestId = movementRequestIdRef.current + 1;
    movementRequestIdRef.current = requestId;
    setLoadingMovements(true);

    try {
      const response = await inventoryService.getProductMovements(
        normalizedCodigoProducto,
        queryFilters
      );
      setIsLegacySummaryMode(false);

      if (requestId !== movementRequestIdRef.current) {
        return;
      }

      setMovementItems(response?.items || []);
    } catch (error) {
      if (requestId === movementRequestIdRef.current) {
        if (isRouteNotFoundError(error)) {
          setIsLegacySummaryMode(true);

          try {
            const summaryResponse = await inventoryService.getMyInventory({
              codigoProducto: normalizedCodigoProducto
            });
            const summaryItem =
              (summaryResponse?.items || []).find(
                (item) =>
                  Number(item?.codigoProducto || 0) === normalizedCodigoProducto
              ) || null;
            const summaryRows = buildSummaryMovementRows(summaryItem, activeTab);

            if (
              activeTab === TAB_SALIDAS &&
              Number(queryFilters?.codigoMedico || 0) > 0
            ) {
              setMovementItems([]);
            } else {
              setMovementItems(summaryRows);
            }
          } catch (summaryError) {
            setMovementItems([]);
            messageApi.error(formatApiError(summaryError));
          }
        } else {
          messageApi.error(formatApiError(error));
        }
      }
    } finally {
      if (requestId === movementRequestIdRef.current) {
        setLoadingMovements(false);
      }
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [normalizedCodigoProducto]);

  useEffect(() => {
    if (!normalizedCodigoProducto) {
      return;
    }

    loadMovements(movementQuery);
  }, [normalizedCodigoProducto, movementQuery]);

  const renderTabContent = () => {
    const showFechaEntregaFilter = activeTab === TAB_ENTRADAS;
    const showMedicoFilter = activeTab === TAB_SALIDAS;

    return (
      <div className="inventory-detail-tab-content">
        <AppCard className="inventory-detail-filters-card">
          <Row gutter={[12, 12]}>
            {showFechaEntregaFilter ? (
              <Col xs={24} md={8}>
                <Typography.Text className="inventory-filter-label">
                  Fecha Entrega
                </Typography.Text>
                <AppInput
                  type="date"
                  value={filters.fechaEntrega}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      fechaEntrega: normalizeDateValue(event.target.value)
                    }))
                  }
                />
              </Col>
            ) : null}

            {showMedicoFilter ? (
              <Col xs={24} md={8}>
                <Typography.Text className="inventory-filter-label">
                  Médico
                </Typography.Text>
                <AppSelect
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Seleccionar..."
                  options={doctorOptions}
                  value={filters.codigoMedico}
                  notFoundContent="Sin médicos disponibles"
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      codigoMedico: value || undefined
                    }))
                  }
                />
              </Col>
            ) : null}
          </Row>
        </AppCard>

        <AppCard className="inventory-grid-card">
          {loadingMovements ? (
            <div className="inventory-placeholder">Cargando movimientos...</div>
          ) : movementItems.length === 0 ? (
            <Empty description="Sin resultados para los filtros seleccionados." />
          ) : (
            <AppTable
              rowKey={(record, index) =>
                `${record.codigoEntrega}-${record.codigoProducto}-${record.cantidad}-${index}`
              }
              className="inventory-table-friendly inventory-detail-table"
              columns={movementColumns}
              dataSource={movementItems}
              pagination={{
                pageSize: 12,
                showSizeChanger: false
              }}
            />
          )}
        </AppCard>
      </div>
    );
  };

  return (
    <div className="page-wrap inventory-detail-page">
      {contextHolder}

      <div className="inventory-header">
        <button
          type="button"
          className="inventory-back-link"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftOutlined />
          Regresar
        </button>
      </div>

      <AppCard className="inventory-detail-summary-card" loading={loadingBootstrap}>
        <div className="inventory-detail-title-wrap">
          <FileSearchOutlined className="inventory-detail-title-icon" />
          <Typography.Title level={4} className="inventory-tab-title">
            Detalle de muestras
          </Typography.Title>
        </div>

        <Row gutter={[12, 10]}>
          <Col xs={24} md={6}>
            <Typography.Text className="inventory-filter-label">Código Producto</Typography.Text>
            <div className="inventory-detail-value">{currentProduct.codigoProducto || '-'}</div>
          </Col>

          <Col xs={24} md={10}>
            <Typography.Text className="inventory-filter-label">Producto</Typography.Text>
            <div className="inventory-detail-value">{formatCellText(currentProduct.nombreProducto)}</div>
          </Col>

          <Col xs={24} md={4}>
            <Typography.Text className="inventory-filter-label">SKU</Typography.Text>
            <div className="inventory-detail-value">{formatCellText(currentProduct.sku)}</div>
          </Col>

          <Col xs={24} md={4}>
            <Typography.Text className="inventory-filter-label">Disponible</Typography.Text>
            <div className="inventory-detail-value inventory-detail-available">
              {Number(currentProduct.disponible || 0)}
            </div>
          </Col>
        </Row>
      </AppCard>

      <AppCard className="inventory-tabs-card">
        <Tabs
          className="inventory-tabs"
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);

            if (key === TAB_ENTRADAS) {
              setFilters((current) => ({
                ...current,
                codigoMedico: undefined
              }));
            } else {
              setFilters((current) => ({
                ...current,
                fechaEntrega: ''
              }));
            }
          }}
          items={[
            {
              key: TAB_ENTRADAS,
              label: 'Entradas',
              children: renderTabContent()
            },
            {
              key: TAB_SALIDAS,
              label: 'Salidas',
              children: renderTabContent()
            }
          ]}
        />
      </AppCard>
    </div>
  );
}
