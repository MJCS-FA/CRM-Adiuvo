import {
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  UpOutlined
} from '@ant-design/icons';
import { Col, Empty, Row, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppButton, AppCard, AppInput, AppModal, AppSelect, AppTable } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { inventoryService } from '../../services/inventoryService';
import { formatApiError } from '../../utils/formatApiError';

function normalizeDateValue(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return text.slice(0, 10);
}

function buildRequestFilters({ fechaInicio, fechaFinal, buscar }) {
  const payload = {};
  const normalizedFechaInicio = normalizeDateValue(fechaInicio);
  const normalizedFechaFinal = normalizeDateValue(fechaFinal);
  const search = String(buscar || '').trim();

  if (normalizedFechaInicio && normalizedFechaFinal) {
    payload.fechaInicio = normalizedFechaInicio;
    payload.fechaFinal = normalizedFechaFinal;
  }

  if (search) {
    payload.buscar = search;
  }

  return payload;
}

function formatDateCell(value) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 10) : '-';
}

function formatTextCell(value) {
  const text = String(value || '').trim();
  return text || '-';
}

function normalizeRequestQuantity(value) {
  const raw = String(value || '');
  const cleaned = raw.replace(/[^\d]/g, '');

  if (!cleaned) {
    return {
      quantity: '',
      error: 'Ingrese una cantidad válida.'
    };
  }

  const parsed = Number(cleaned);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return {
      quantity: cleaned,
      error: 'La cantidad debe ser mayor a 0.'
    };
  }

  return {
    quantity: cleaned,
    error: ''
  };
}

function getEstadoColor(estadoText = '') {
  const normalized = String(estadoText || '').trim().toLowerCase();

  if (!normalized) {
    return 'default';
  }

  if (
    normalized.includes('rechaz') ||
    normalized.includes('cancelad') ||
    normalized.includes('anulad')
  ) {
    return 'red';
  }

  if (
    normalized.includes('aprobad') ||
    normalized.includes('completad') ||
    normalized.includes('entregad')
  ) {
    return 'green';
  }

  if (
    normalized.includes('pendiente') ||
    normalized.includes('solicit') ||
    normalized.includes('revisión')
  ) {
    return 'gold';
  }

  return 'blue';
}

function mapTargetOptions(type, doctors = [], branches = []) {
  if (type === 'medico') {
    return doctors;
  }

  return branches;
}

function mapTemporaryRowKey(item = {}) {
  return String(item.codigoProducto || '');
}

export function InventoryRequestsSection() {
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestItems, setRequestItems] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [expandedRows, setExpandedRows] = useState([]);
  const [requestDetailByCode, setRequestDetailByCode] = useState({});
  const [isReadyForQueries, setIsReadyForQueries] = useState(false);
  const [filters, setFilters] = useState({
    fechaInicio: '',
    fechaFinal: '',
    buscar: ''
  });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTargetType, setCreateTargetType] = useState('sucursal');
  const [selectedDoctorId, setSelectedDoctorId] = useState(undefined);
  const [selectedBranchId, setSelectedBranchId] = useState(undefined);
  const [temporaryItems, setTemporaryItems] = useState([]);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(undefined);
  const [newProductQuantity, setNewProductQuantity] = useState('');
  const [newProductQuantityError, setNewProductQuantityError] = useState('');
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [requestComment, setRequestComment] = useState('');
  const [savingRequest, setSavingRequest] = useState(false);
  const requestRequestIdRef = useRef(0);

  const debouncedFechaInicio = useDebouncedValue(filters.fechaInicio, 220);
  const debouncedFechaFinal = useDebouncedValue(filters.fechaFinal, 220);
  const debouncedBuscar = useDebouncedValue(filters.buscar, 280);

  const normalizedFilters = useMemo(
    () =>
      buildRequestFilters({
        fechaInicio: debouncedFechaInicio,
        fechaFinal: debouncedFechaFinal,
        buscar: debouncedBuscar
      }),
    [debouncedFechaInicio, debouncedFechaFinal, debouncedBuscar]
  );

  const targetTypeOptions = useMemo(
    () => [
      {
        value: 'sucursal',
        label: 'Sucursal asignada'
      },
      {
        value: 'medico',
        label: 'Médico asignado'
      }
    ],
    []
  );

  const currentTargetOptions = useMemo(
    () => mapTargetOptions(createTargetType, doctorOptions, branchOptions),
    [createTargetType, doctorOptions, branchOptions]
  );

  const availableProductOptions = useMemo(() => {
    const selectedCodes = new Set(
      temporaryItems.map((item) => Number(item.codigoProducto || 0))
    );

    return (productOptions || []).filter(
      (option) => !selectedCodes.has(Number(option.value || 0))
    );
  }, [productOptions, temporaryItems]);

  const temporaryColumns = useMemo(
    () => [
      {
        title: 'Código',
        dataIndex: 'codigoProducto',
        width: 110,
        align: 'center'
      },
      {
        title: 'Producto',
        dataIndex: 'nombreProducto',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Cantidad',
        dataIndex: 'cantidadSolicitada',
        width: 120,
        align: 'center'
      },
      {
        title: 'Acción',
        dataIndex: 'accion',
        width: 90,
        align: 'center',
        render: (_, record) => (
          <button
            type="button"
            className="inventory-requests-remove-btn"
            onClick={() =>
              setTemporaryItems((current) =>
                current.filter(
                  (item) => Number(item.codigoProducto) !== Number(record.codigoProducto)
                )
              )
            }
            disabled={savingRequest}
            aria-label={`Eliminar producto ${record.codigoProducto}`}
          >
            <DeleteOutlined />
          </button>
        )
      }
    ],
    [savingRequest]
  );

  const requestColumns = useMemo(
    () => [
      {
        title: 'Solicitud',
        dataIndex: 'codigoSolicitud',
        width: 110,
        align: 'center'
      },
      {
        title: 'Fecha Solicitud',
        dataIndex: 'fechaSolicitud',
        width: 140,
        align: 'center',
        render: (value) => formatDateCell(value)
      },
      {
        title: 'Visitador',
        dataIndex: 'nombreVisitador',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Sucursal',
        dataIndex: 'nombreSucursal',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Médico',
        dataIndex: 'nombreMedico',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Estado',
        dataIndex: 'estado',
        width: 140,
        align: 'center',
        render: (value) => (
          <Tag color={getEstadoColor(value)} className="inventory-request-state-pill">
            {formatTextCell(value)}
          </Tag>
        )
      },
      {
        title: 'Detalle',
        dataIndex: 'detalle',
        width: 110,
        align: 'center',
        render: (_, record) => {
          const codigoSolicitud = Number(record.codigoSolicitud || 0);
          const expanded = expandedRows.includes(codigoSolicitud);

          return (
            <button
              type="button"
              className="inventory-orders-detail-link"
              onClick={() => {
                if (!codigoSolicitud) {
                  return;
                }

                if (expanded) {
                  setExpandedRows((current) =>
                    current.filter((item) => item !== codigoSolicitud)
                  );
                  return;
                }

                setExpandedRows((current) => [...current, codigoSolicitud]);
                loadRequestDetail(codigoSolicitud);
              }}
            >
              {expanded ? <UpOutlined /> : <DownOutlined />}
              Detalle
            </button>
          );
        }
      }
    ],
    [expandedRows, requestDetailByCode]
  );

  const requestDetailColumns = useMemo(
    () => [
      {
        title: 'Código',
        dataIndex: 'codigoProducto',
        width: 110,
        align: 'center'
      },
      {
        title: 'Producto',
        dataIndex: 'nombreProducto',
        align: 'center',
        render: (value) => formatTextCell(value)
      },
      {
        title: 'Cantidad Solicitada',
        dataIndex: 'cantidadSolicitada',
        width: 170,
        align: 'center'
      },
      {
        title: 'Cantidad Entregada',
        dataIndex: 'cantidadEntregada',
        width: 170,
        align: 'center'
      },
      {
        title: 'Motivo Rechazo',
        dataIndex: 'motivoRechazo',
        width: 190,
        align: 'center',
        render: (value) => formatTextCell(value)
      }
    ],
    []
  );

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);

    try {
      const response = await inventoryService.getRequestsBootstrap();
      setProductOptions(response?.filtros?.productos || []);
      setDoctorOptions(response?.filtros?.medicos || []);
      setBranchOptions(response?.filtros?.sucursales || []);
      setFilters((current) => ({
        ...current,
        fechaInicio: response?.filtros?.fechaInicio || current.fechaInicio,
        fechaFinal: response?.filtros?.fechaFinal || current.fechaFinal
      }));
      setIsReadyForQueries(true);
    } catch (error) {
      messageApi.error(formatApiError(error));
      setIsReadyForQueries(false);
    } finally {
      setLoadingBootstrap(false);
    }
  };

  const loadRequests = async (queryFilters = {}) => {
    const requestId = requestRequestIdRef.current + 1;
    requestRequestIdRef.current = requestId;
    setLoadingRequests(true);

    try {
      const response = await inventoryService.getRequests(queryFilters);

      if (requestId !== requestRequestIdRef.current) {
        return;
      }

      setRequestItems(response?.items || []);
      setExpandedRows([]);
      setRequestDetailByCode({});
    } catch (error) {
      if (requestId === requestRequestIdRef.current) {
        messageApi.error(formatApiError(error));
      }
    } finally {
      if (requestId === requestRequestIdRef.current) {
        setLoadingRequests(false);
      }
    }
  };

  const loadRequestDetail = async (codigoSolicitud) => {
    const key = Number(codigoSolicitud || 0);

    if (!key) {
      return;
    }

    const current = requestDetailByCode[key];

    if (current?.loading || current?.loaded) {
      return;
    }

    setRequestDetailByCode((state) => ({
      ...state,
      [key]: {
        loading: true,
        loaded: false,
        items: []
      }
    }));

    try {
      const response = await inventoryService.getRequestDetail(key);
      setRequestDetailByCode((state) => ({
        ...state,
        [key]: {
          loading: false,
          loaded: true,
          items: response?.items || []
        }
      }));
    } catch (error) {
      setRequestDetailByCode((state) => ({
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

    loadRequests(normalizedFilters);
  }, [isReadyForQueries, normalizedFilters]);

  const renderExpandedDetail = (record) => {
    const codigoSolicitud = Number(record.codigoSolicitud || 0);
    const detailState = requestDetailByCode[codigoSolicitud] || {
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
            Sin productos para esta solicitud.
          </Typography.Text>
        </div>
      );
    }

    return (
      <div className="inventory-orders-detail-wrap">
        <AppTable
          rowKey={(item, index) => `${codigoSolicitud}-${item.codigoProducto}-${index}`}
          className="inventory-table-friendly inventory-orders-detail-table"
          columns={requestDetailColumns}
          dataSource={detailState.items}
          pagination={false}
        />
      </div>
    );
  };

  const resetCreateState = () => {
    setCreateTargetType('sucursal');
    setSelectedDoctorId(undefined);
    setSelectedBranchId(undefined);
    setTemporaryItems([]);
    setSelectedProductId(undefined);
    setNewProductQuantity('');
    setNewProductQuantityError('');
    setRequestComment('');
    setAddProductModalOpen(false);
    setCommentModalOpen(false);
  };

  const handleOpenCreateModal = () => {
    resetCreateState();
    setCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    if (savingRequest) {
      return;
    }

    setCreateModalOpen(false);
    resetCreateState();
  };

  const handleAddProduct = () => {
    const codigoProducto = Number(selectedProductId || 0);
    const selected = (productOptions || []).find(
      (item) => Number(item.value || 0) === codigoProducto
    );
    const normalized = normalizeRequestQuantity(newProductQuantity);

    setNewProductQuantity(normalized.quantity);
    setNewProductQuantityError(normalized.error);

    if (!codigoProducto || !selected) {
      messageApi.warning('Seleccione un producto.');
      return;
    }

    if (normalized.error) {
      return;
    }

    setTemporaryItems((current) => {
      const next = current.slice();
      const currentIndex = next.findIndex(
        (item) => Number(item.codigoProducto) === codigoProducto
      );

      if (currentIndex >= 0) {
        next[currentIndex] = {
          ...next[currentIndex],
          cantidadSolicitada:
            Number(next[currentIndex].cantidadSolicitada || 0) +
            Number(normalized.quantity || 0)
        };
      } else {
        next.push({
          codigoProducto,
          nombreProducto: selected.nombreProducto || selected.label || `Producto ${codigoProducto}`,
          cantidadSolicitada: Number(normalized.quantity || 0)
        });
      }

      return next;
    });

    setSelectedProductId(undefined);
    setNewProductQuantity('');
    setNewProductQuantityError('');
    setAddProductModalOpen(false);
  };

  const handleOpenCommentModal = () => {
    const hasTarget =
      (createTargetType === 'medico' && Number(selectedDoctorId || 0) > 0) ||
      (createTargetType === 'sucursal' && Number(selectedBranchId || 0) > 0);

    if (!hasTarget) {
      messageApi.warning('Seleccione el destino de la solicitud antes de continuar.');
      return;
    }

    if (!temporaryItems.length) {
      messageApi.warning('Debe agregar al menos un producto.');
      return;
    }

    setCommentModalOpen(true);
  };

  const handleSaveRequest = async () => {
    const comentario = String(requestComment || '').trim();

    if (!comentario) {
      messageApi.warning('Ingrese un comentario de observación.');
      return;
    }

    setSavingRequest(true);

    try {
      await inventoryService.createRequest({
        codigoMedico:
          createTargetType === 'medico' ? Number(selectedDoctorId || 0) : undefined,
        codigoSucursal:
          createTargetType === 'sucursal' ? Number(selectedBranchId || 0) : undefined,
        comentario,
        items: temporaryItems.map((item) => ({
          codigoProducto: Number(item.codigoProducto),
          cantidadSolicitada: Number(item.cantidadSolicitada)
        }))
      });

      messageApi.success('Solicitud creada correctamente.');
      setCommentModalOpen(false);
      setCreateModalOpen(false);
      resetCreateState();
      loadRequests(normalizedFilters);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setSavingRequest(false);
    }
  };

  return (
    <div className="inventory-requests-section">
      {contextHolder}

      <div className="inventory-orders-toolbar">
        <Typography.Title level={4} className="inventory-tab-title">
          Detalle de Solicitudes
        </Typography.Title>

        <AppButton variant="ghost" icon={<PlusOutlined />} onClick={handleOpenCreateModal}>
          Nueva Solicitud
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

          <Col xs={24} md={8}>
            <Typography.Text className="inventory-filter-label">Buscar</Typography.Text>
            <AppInput
              placeholder="Código, médico o estado..."
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

      <AppCard className="inventory-grid-card">
        {loadingRequests ? (
          <div className="inventory-placeholder">Cargando solicitudes...</div>
        ) : requestItems.length === 0 ? (
          <Empty description="Sin resultados de solicitudes." />
        ) : (
          <AppTable
            rowKey={(record) => Number(record.codigoSolicitud || 0)}
            className="inventory-table-friendly"
            columns={requestColumns}
            dataSource={requestItems}
            pagination={{
              pageSize: 12,
              showSizeChanger: false
            }}
            expandable={{
              expandedRowKeys: expandedRows,
              expandIcon: () => null,
              onExpandedRowsChange: (keys) => {
                setExpandedRows((keys || []).map((key) => Number(key)));
              },
              expandedRowRender: (record) => renderExpandedDetail(record)
            }}
          />
        )}
      </AppCard>

      <AppModal
        open={createModalOpen}
        title="Nueva Solicitud"
        onCancel={handleCloseCreateModal}
        maskClosable={!savingRequest}
        keyboard={!savingRequest}
        width={860}
        footer={[
          <AppButton
            key="cancel-create-request"
            variant="outline"
            onClick={handleCloseCreateModal}
            disabled={savingRequest}
          >
            Cancelar
          </AppButton>,
          <AppButton
            key="open-comment-request"
            onClick={handleOpenCommentModal}
            disabled={savingRequest}
          >
            Solicitar
          </AppButton>
        ]}
      >
        <div className="inventory-requests-create-modal">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Typography.Text className="inventory-filter-label">Tipo Destino</Typography.Text>
              <AppSelect
                options={targetTypeOptions}
                value={createTargetType}
                onChange={(value) => {
                  const nextType = value || 'sucursal';
                  setCreateTargetType(nextType);
                  setSelectedDoctorId(undefined);
                  setSelectedBranchId(undefined);
                }}
                disabled={savingRequest}
              />
            </Col>

            <Col xs={24} md={16}>
              <Typography.Text className="inventory-filter-label">
                {createTargetType === 'medico' ? 'Médico' : 'Sucursal'}
              </Typography.Text>
              <AppSelect
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Seleccionar..."
                options={currentTargetOptions}
                value={createTargetType === 'medico' ? selectedDoctorId : selectedBranchId}
                onChange={(value) => {
                  if (createTargetType === 'medico') {
                    setSelectedDoctorId(value || undefined);
                  } else {
                    setSelectedBranchId(value || undefined);
                  }
                }}
                disabled={savingRequest}
              />
            </Col>
          </Row>

          <div className="inventory-requests-product-toolbar">
            <Typography.Text className="inventory-filter-label">
              Productos de la solicitud
            </Typography.Text>

            <AppButton
              variant="outline"
              icon={<PlusOutlined />}
              onClick={() => setAddProductModalOpen(true)}
              disabled={savingRequest}
            >
              Agregar Producto
            </AppButton>
          </div>

          {temporaryItems.length === 0 ? (
            <Empty
              className="inventory-requests-empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Agregue productos para continuar."
            />
          ) : (
            <AppTable
              rowKey={(record) => mapTemporaryRowKey(record)}
              className="inventory-table-friendly"
              columns={temporaryColumns}
              dataSource={temporaryItems}
              pagination={false}
            />
          )}
        </div>
      </AppModal>

      <AppModal
        open={addProductModalOpen}
        title="Agregar Producto"
        onCancel={() => {
          if (!savingRequest) {
            setAddProductModalOpen(false);
          }
        }}
        footer={[
          <AppButton
            key="cancel-add-product"
            variant="outline"
            onClick={() => setAddProductModalOpen(false)}
            disabled={savingRequest}
          >
            Cancelar
          </AppButton>,
          <AppButton
            key="confirm-add-product"
            onClick={handleAddProduct}
            disabled={savingRequest}
          >
            Guardar
          </AppButton>
        ]}
      >
        <div className="inventory-requests-modal-grid">
          <div>
            <Typography.Text className="inventory-filter-label">Producto</Typography.Text>
            <AppSelect
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar..."
              options={availableProductOptions}
              value={selectedProductId}
              onChange={(value) => setSelectedProductId(value || undefined)}
              disabled={savingRequest}
            />
          </div>

          <div>
            <Typography.Text className="inventory-filter-label">Cantidad</Typography.Text>
            <AppInput
              inputMode="numeric"
              placeholder="0"
              value={newProductQuantity}
              onChange={(event) => {
                const normalized = normalizeRequestQuantity(event.target.value);
                setNewProductQuantity(normalized.quantity);
                setNewProductQuantityError(normalized.error);
              }}
            />
            {newProductQuantityError ? (
              <Typography.Text type="danger">{newProductQuantityError}</Typography.Text>
            ) : null}
          </div>
        </div>
      </AppModal>

      <AppModal
        open={commentModalOpen}
        title="Confirmar Solicitud"
        onCancel={() => {
          if (!savingRequest) {
            setCommentModalOpen(false);
          }
        }}
        footer={[
          <AppButton
            key="cancel-comment-request"
            variant="outline"
            onClick={() => setCommentModalOpen(false)}
            disabled={savingRequest}
          >
            Cancelar
          </AppButton>,
          <AppButton
            key="save-request"
            onClick={handleSaveRequest}
            loading={savingRequest}
            disabled={savingRequest}
          >
            Guardar
          </AppButton>
        ]}
      >
        <div className="inventory-requests-modal-grid">
          <div>
            <Typography.Text className="inventory-filter-label">
              Comentario de observación
            </Typography.Text>
            <AppInput
              type="textarea"
              placeholder="Ingrese comentario..."
              value={requestComment}
              onChange={(event) => setRequestComment(event.target.value)}
              disabled={savingRequest}
            />
          </div>
        </div>
      </AppModal>
    </div>
  );
}
