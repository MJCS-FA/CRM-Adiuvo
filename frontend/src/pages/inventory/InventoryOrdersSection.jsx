import { DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import { Col, Empty, Row, Tabs, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppButton, AppCard, AppInput, AppModal, AppSelect, AppTable } from '../../components/ui';
import { SampleOrderGeneratorPanel } from '../../components/inventory/SampleOrderGeneratorPanel';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { calendarService } from '../../services/calendarService';
import { inventoryService } from '../../services/inventoryService';
import { formatApiError } from '../../utils/formatApiError';

const TAB_ENTRADAS = 'entradas';
const TAB_SALIDAS = 'salidas';

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(monthKey, offset) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return getCurrentMonthKey();
  }

  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + Number(offset || 0));

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getVisitSortTimestamp(visit = {}) {
  const dateText = String(visit.fechaProgramada || '').slice(0, 10);
  const timeText = String(visit.horaProgramada || '').slice(0, 8) || '00:00:00';
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    ? dateText
    : '1970-01-01';
  const safeTime = /^\d{2}:\d{2}(:\d{2})?$/.test(timeText)
    ? (timeText.length === 5 ? `${timeText}:00` : timeText)
    : '00:00:00';

  return Date.parse(`${safeDate}T${safeTime}`) || 0;
}

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function normalizeDateValue(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return text.slice(0, 10);
}

function formatDateCell(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 10) : '-';
}

function formatTextCell(value) {
  const text = String(value || '').trim();
  return text || '-';
}

function buildOrderFilters({
  tab,
  fechaInicio,
  fechaFinal,
  codigoProducto,
  tipoProducto,
  buscar
}) {
  const payload = {
    tab
  };

  const normalizedFechaInicio = normalizeDateValue(fechaInicio);
  const normalizedFechaFinal = normalizeDateValue(fechaFinal);
  const normalizedProducto = Number(codigoProducto || 0);
  const normalizedTipo = Number(tipoProducto || 0);
  const search = String(buscar || '').trim();

  if (normalizedFechaInicio && normalizedFechaFinal) {
    payload.fechaInicio = normalizedFechaInicio;
    payload.fechaFinal = normalizedFechaFinal;
  }

  if (normalizedProducto > 0) {
    payload.codigoProducto = normalizedProducto;
  }

  if (normalizedTipo > 0) {
    payload.tipoProducto = normalizedTipo;
  }

  if (search) {
    payload.buscar = search;
  }

  return payload;
}

export function InventoryOrdersSection() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_ENTRADAS);
  const [orderItems, setOrderItems] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [isReadyForQueries, setIsReadyForQueries] = useState(false);
  const [filters, setFilters] = useState({
    fechaInicio: getTodayDateKey(),
    fechaFinal: getTodayDateKey(),
    codigoProducto: undefined,
    tipoProducto: undefined,
    buscar: ''
  });
  const [expandedSalidaRows, setExpandedSalidaRows] = useState([]);
  const [salidaDetailByEntrega, setSalidaDetailByEntrega] = useState({});
  const [showDoctorPickerModal, setShowDoctorPickerModal] = useState(false);
  const [loadingDoctorOptions, setLoadingDoctorOptions] = useState(false);
  const [resolvingDoctorVisit, setResolvingDoctorVisit] = useState(false);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(undefined);
  const [generateVisitId, setGenerateVisitId] = useState(null);
  const ordersRequestIdRef = useRef(0);

  const debouncedFechaInicio = useDebouncedValue(filters.fechaInicio, 220);
  const debouncedFechaFinal = useDebouncedValue(filters.fechaFinal, 220);
  const debouncedCodigoProducto = useDebouncedValue(filters.codigoProducto, 180);
  const debouncedTipoProducto = useDebouncedValue(filters.tipoProducto, 180);
  const debouncedBuscar = useDebouncedValue(filters.buscar, 260);

  const normalizedFilters = useMemo(
    () =>
      buildOrderFilters({
        tab: activeTab,
        fechaInicio: debouncedFechaInicio,
        fechaFinal: debouncedFechaFinal,
        codigoProducto: debouncedCodigoProducto,
        tipoProducto: debouncedTipoProducto,
        buscar: debouncedBuscar
      }),
    [
      activeTab,
      debouncedFechaInicio,
      debouncedFechaFinal,
      debouncedCodigoProducto,
      debouncedTipoProducto,
      debouncedBuscar
    ]
  );

  const entradaColumns = useMemo(
    () => [
      {
        title: 'Código Entrega',
        dataIndex: 'codigoEntrega',
        width: 130,
        align: 'center'
      },
      {
        title: 'Fecha Entrega',
        dataIndex: 'fechaEntrega',
        width: 130,
        align: 'center',
        render: (value) => formatDateCell(value)
      },
      {
        title: 'Tipo Producto',
        dataIndex: 'tipoProducto',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Visitador',
        dataIndex: 'nombreVisitador',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Cantidad Entregada',
        dataIndex: 'cantidadEntregada',
        width: 170,
        align: 'center'
      },
      {
        title: 'Código Solicitud',
        dataIndex: 'codigoSolicitud',
        width: 150,
        align: 'center',
        render: (value) =>
          value === null || value === undefined || value === ''
            ? '-'
            : Number(value)
      }
    ],
    []
  );

  const salidaColumns = useMemo(
    () => [
      {
        title: 'Código Entrega',
        dataIndex: 'codigoEntrega',
        width: 130,
        align: 'center'
      },
      {
        title: 'Fecha Entrega',
        dataIndex: 'fechaEntrega',
        width: 130,
        align: 'center',
        render: (value) => formatDateCell(value)
      },
      {
        title: 'Tipo Producto',
        dataIndex: 'tipoProducto',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Nombre Persona',
        dataIndex: 'nombrePersona',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Cantidad Entregada',
        dataIndex: 'cantidadEntregada',
        width: 170,
        align: 'center'
      },
      {
        title: 'Detalle',
        dataIndex: 'detalle',
        width: 120,
        align: 'center',
        render: (_, record) => {
          const codigoEntrega = Number(record.codigoEntrega || 0);
          const expanded = expandedSalidaRows.includes(codigoEntrega);

          return (
            <button
              type="button"
              className="inventory-orders-detail-link"
              onClick={() => {
                if (!codigoEntrega) {
                  return;
                }

                if (expanded) {
                  setExpandedSalidaRows((current) =>
                    current.filter((item) => item !== codigoEntrega)
                  );
                  return;
                }

                setExpandedSalidaRows((current) => [...current, codigoEntrega]);
                loadSalidaDetail(codigoEntrega);
              }}
            >
              {expanded ? <UpOutlined /> : <DownOutlined />}
              Detalle
            </button>
          );
        }
      }
    ],
    [expandedSalidaRows, salidaDetailByEntrega]
  );

  const salidaDetailColumns = useMemo(
    () => [
      {
        title: 'Código',
        dataIndex: 'codigoProducto',
        width: 120,
        align: 'center'
      },
      {
        title: 'Producto',
        dataIndex: 'producto',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Cantidad Entregada',
        dataIndex: 'cantidadEntregada',
        width: 180,
        align: 'center'
      }
    ],
    []
  );

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);

    try {
      const response = await inventoryService.getOrdersBootstrap();
      setProductOptions(response?.filtros?.productos || []);
      setTypeOptions(response?.filtros?.tiposProducto || []);
      setIsReadyForQueries(true);
    } catch (error) {
      messageApi.error(formatApiError(error));
      setIsReadyForQueries(false);
    } finally {
      setLoadingBootstrap(false);
    }
  };

  const loadOrders = async (queryFilters = {}) => {
    const requestId = ordersRequestIdRef.current + 1;
    ordersRequestIdRef.current = requestId;
    setLoadingOrders(true);

    try {
      const response = await inventoryService.getOrders(queryFilters);

      if (requestId !== ordersRequestIdRef.current) {
        return;
      }

      setOrderItems(response?.items || []);
      setExpandedSalidaRows([]);
      setSalidaDetailByEntrega({});
    } catch (error) {
      if (requestId === ordersRequestIdRef.current) {
        messageApi.error(formatApiError(error));
      }
    } finally {
      if (requestId === ordersRequestIdRef.current) {
        setLoadingOrders(false);
      }
    }
  };

  const loadDoctorOptions = async () => {
    setLoadingDoctorOptions(true);

    try {
      const response = await calendarService.getAssignedDoctors();
      const options = Array.isArray(response?.items) ? response.items : [];
      setDoctorOptions(options);
      setSelectedDoctorId((current) =>
        current && options.some((option) => Number(option.value) === Number(current))
          ? current
          : options[0]?.value
      );
    } catch (error) {
      messageApi.error(formatApiError(error));
      setDoctorOptions([]);
      setSelectedDoctorId(undefined);
    } finally {
      setLoadingDoctorOptions(false);
    }
  };

  const resolveVisitIdByDoctor = async (codigoMedico) => {
    const baseMonth = getCurrentMonthKey();
    const monthCandidates = [...new Set([0, -1, 1, -2, 2].map((offset) => addMonths(baseMonth, offset)))];
    const monthResponses = await Promise.all(
      monthCandidates.map((month) => calendarService.getMonthVisits(month).catch(() => null))
    );
    const visits = monthResponses
      .flatMap((response) => (Array.isArray(response?.visits) ? response.visits : []))
      .filter((visit) => {
        const visitId = Number(visit.codigoVisitaMedica || 0);
        const doctorId = Number(visit.codigoMedico || 0);
        const tipoVisita = Number(visit.codigoTipoVisita || 0);
        return visitId > 0 && doctorId === Number(codigoMedico) && tipoVisita !== 2;
      })
      .sort((left, right) => {
        const diff = getVisitSortTimestamp(right) - getVisitSortTimestamp(left);

        if (diff !== 0) {
          return diff;
        }

        return Number(right.codigoVisitaMedica || 0) - Number(left.codigoVisitaMedica || 0);
      });

    return Number(visits[0]?.codigoVisitaMedica || 0) || null;
  };

  const loadSalidaDetail = async (codigoEntrega) => {
    const key = Number(codigoEntrega || 0);

    if (!key) {
      return;
    }

    const current = salidaDetailByEntrega[key];

    if (current?.loading || current?.loaded) {
      return;
    }

    setSalidaDetailByEntrega((state) => ({
      ...state,
      [key]: {
        loading: true,
        loaded: false,
        items: []
      }
    }));

    try {
      const response = await inventoryService.getOrderSalidaDetail(key);
      setSalidaDetailByEntrega((state) => ({
        ...state,
        [key]: {
          loading: false,
          loaded: true,
          items: response?.items || []
        }
      }));
    } catch (error) {
      setSalidaDetailByEntrega((state) => ({
        ...state,
        [key]: {
          loading: false,
          loaded: true,
          items: []
        }
      }));
      messageApi.error(formatApiError(error));
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isReadyForQueries) {
      return;
    }

    loadOrders(normalizedFilters);
  }, [isReadyForQueries, normalizedFilters]);

  const renderSalidaExpanded = (record) => {
    const codigoEntrega = Number(record.codigoEntrega || 0);
    const detailState = salidaDetailByEntrega[codigoEntrega] || {
      loading: false,
      loaded: false,
      items: []
    };

    if (detailState.loading) {
      return (
        <div className="inventory-orders-detail-loading">
          <Typography.Text type="secondary">Cargando detalle...</Typography.Text>
        </div>
      );
    }

    if (!detailState.items?.length) {
      return (
        <div className="inventory-orders-detail-loading">
          <Typography.Text type="secondary">
            Sin productos para esta salida.
          </Typography.Text>
        </div>
      );
    }

    return (
      <div className="inventory-orders-detail-wrap">
        <AppTable
          rowKey={(item, index) => `${codigoEntrega}-${item.codigoProducto}-${index}`}
          className="inventory-table-friendly inventory-orders-detail-table"
          columns={salidaDetailColumns}
          dataSource={detailState.items}
          pagination={false}
        />
      </div>
    );
  };

  const handleOpenDoctorPicker = () => {
    setShowDoctorPickerModal(true);
    loadDoctorOptions();
  };

  const handleConfirmDoctor = async () => {
    const normalizedDoctorId = Number(selectedDoctorId || 0);

    if (!normalizedDoctorId) {
      messageApi.warning('Seleccione un médico para generar la orden.');
      return;
    }

    setResolvingDoctorVisit(true);

    try {
      const resolvedVisitId = await resolveVisitIdByDoctor(normalizedDoctorId);

      if (!resolvedVisitId) {
        messageApi.warning(
          'No se encontró una visita médica disponible para el médico seleccionado.'
        );
        return;
      }

      setShowDoctorPickerModal(false);
      setGenerateVisitId(resolvedVisitId);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setResolvingDoctorVisit(false);
    }
  };

  const handleSavedOrder = () => {
    setGenerateVisitId(null);
    setActiveTab(TAB_SALIDAS);
    loadOrders({
      ...normalizedFilters,
      tab: TAB_SALIDAS
    });
  };

  if (generateVisitId) {
    return (
      <div className="inventory-orders-generation-wrap">
        {contextHolder}
        <SampleOrderGeneratorPanel
          visitId={generateVisitId}
          onCancel={() => setGenerateVisitId(null)}
          onSaved={handleSavedOrder}
        />
      </div>
    );
  }

  return (
    <div className="inventory-orders-section">
      {contextHolder}
      <div className="inventory-orders-toolbar">
        <Typography.Title level={4} className="inventory-tab-title">
          Detalle de Órdenes
        </Typography.Title>

        <AppButton
          variant="ghost"
          icon={<PlusOutlined />}
          onClick={handleOpenDoctorPicker}
        >
          Nueva Orden
        </AppButton>
      </div>

      <AppCard className="inventory-filters-card" loading={loadingBootstrap}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={5}>
            <Typography.Text className="inventory-filter-label">
              Fecha Inicio
            </Typography.Text>
            <AppInput
              type="date"
              value={filters.fechaInicio}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  fechaInicio: normalizeDateValue(event.target.value)
                }))
              }
            />
          </Col>

          <Col xs={24} md={5}>
            <Typography.Text className="inventory-filter-label">
              Fecha Final
            </Typography.Text>
            <AppInput
              type="date"
              value={filters.fechaFinal}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  fechaFinal: normalizeDateValue(event.target.value)
                }))
              }
            />
          </Col>

          <Col xs={24} md={5}>
            <Typography.Text className="inventory-filter-label">Producto</Typography.Text>
            <AppSelect
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar..."
              options={productOptions}
              value={filters.codigoProducto}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  codigoProducto: value || undefined
                }))
              }
            />
          </Col>

          <Col xs={24} md={5}>
            <Typography.Text className="inventory-filter-label">Tipo Producto</Typography.Text>
            <AppSelect
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar..."
              options={typeOptions}
              value={filters.tipoProducto}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  tipoProducto: value || undefined
                }))
              }
            />
          </Col>

          <Col xs={24} md={4}>
            <Typography.Text className="inventory-filter-label">Buscar</Typography.Text>
            <AppInput
              placeholder="Buscar..."
              value={filters.buscar}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  buscar: String(event.target.value || '')
                }))
              }
            />
          </Col>
        </Row>
      </AppCard>

      <AppCard className="inventory-tabs-card">
        <Tabs
          className="inventory-tabs inventory-orders-inner-tabs"
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: TAB_ENTRADAS,
              label: 'Entradas',
              children:
                loadingOrders ? (
                  <div className="inventory-placeholder">Cargando entradas...</div>
                ) : orderItems.length === 0 ? (
                  <Empty description="Sin resultados de entradas." />
                ) : (
                  <AppTable
                    rowKey={(record) => Number(record.codigoEntrega)}
                    className="inventory-table-friendly"
                    columns={entradaColumns}
                    dataSource={orderItems}
                    pagination={{
                      pageSize: 12,
                      showSizeChanger: false
                    }}
                  />
                )
            },
            {
              key: TAB_SALIDAS,
              label: 'Salidas',
              children:
                loadingOrders ? (
                  <div className="inventory-placeholder">Cargando salidas...</div>
                ) : orderItems.length === 0 ? (
                  <Empty description="Sin resultados de salidas." />
                ) : (
                  <AppTable
                    rowKey={(record) => Number(record.codigoEntrega)}
                    className="inventory-table-friendly"
                    columns={salidaColumns}
                    dataSource={orderItems}
                    pagination={{
                      pageSize: 12,
                      showSizeChanger: false
                    }}
                    expandable={{
                      expandedRowKeys: expandedSalidaRows,
                      expandIcon: () => null,
                      onExpandedRowsChange: (keys) => {
                        setExpandedSalidaRows(
                          (keys || []).map((key) => Number(key))
                        );
                      },
                      expandedRowRender: (record) => renderSalidaExpanded(record)
                    }}
                  />
                )
            }
          ]}
        />
      </AppCard>

      <AppModal
        open={showDoctorPickerModal}
        title="Seleccionar médico para generar orden"
        onCancel={() => {
          if (!resolvingDoctorVisit) {
            setShowDoctorPickerModal(false);
          }
        }}
        footer={[
          <AppButton
            key="cancel-order-doctor"
            variant="outline"
            onClick={() => setShowDoctorPickerModal(false)}
            disabled={loadingDoctorOptions || resolvingDoctorVisit}
          >
            Cancelar
          </AppButton>,
          <AppButton
            key="continue-order-doctor"
            onClick={handleConfirmDoctor}
            loading={resolvingDoctorVisit}
            disabled={loadingDoctorOptions || resolvingDoctorVisit || !selectedDoctorId}
          >
            Continuar
          </AppButton>
        ]}
      >
        <div className="inventory-orders-visit-modal">
          <div>
            <Typography.Text className="inventory-filter-label">Médico</Typography.Text>
            <AppSelect
              showSearch
              optionFilterProp="label"
              placeholder={loadingDoctorOptions ? 'Cargando médicos...' : 'Seleccionar...'}
              options={doctorOptions}
              value={selectedDoctorId}
              loading={loadingDoctorOptions}
              notFoundContent="Sin médicos disponibles"
              onChange={(value) => setSelectedDoctorId(value || undefined)}
              disabled={resolvingDoctorVisit}
            />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
