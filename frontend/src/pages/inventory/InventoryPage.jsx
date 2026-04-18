import { ArrowLeftOutlined, FileSearchOutlined } from '@ant-design/icons';
import { Col, Empty, Row, Tabs, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard, AppInput, AppSelect, AppTable } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { inventoryService } from '../../services/inventoryService';
import { formatApiError } from '../../utils/formatApiError';
import { InventoryOrdersSection } from './InventoryOrdersSection';
import { InventoryRequestsSection } from './InventoryRequestsSection';

function normalizeCodigoProductoValue(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  const parsed = Number(digits);

  if (!digits || !Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function buildMyInventoryFilters({
  codigoProducto,
  productSku,
  tipoProducto
}) {
  const payload = {};
  const normalizedCodigoProducto = normalizeCodigoProductoValue(codigoProducto);
  const sku = String(productSku || '').trim();

  if (normalizedCodigoProducto > 0) {
    payload.codigoProducto = normalizedCodigoProducto;
  }

  if (sku) {
    payload.codigoSku = sku;
  }

  if (tipoProducto) {
    payload.tipoProducto = tipoProducto;
  }

  return payload;
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryContext, setInventoryContext] = useState(null);
  const [productOptions, setProductOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [isReadyForQueries, setIsReadyForQueries] = useState(false);
  const [filters, setFilters] = useState({
    codigoProducto: '',
    productoCodigo: undefined,
    productoSearch: '',
    tipoProducto: undefined
  });
  const inventoryRequestIdRef = useRef(0);

  const debouncedCodigoProducto = useDebouncedValue(filters.codigoProducto, 320);
  const debouncedProductoCodigo = useDebouncedValue(filters.productoCodigo, 220);
  const debouncedProductoSearch = useDebouncedValue(filters.productoSearch, 220);
  const debouncedTipoProducto = useDebouncedValue(filters.tipoProducto, 140);

  const selectedProductSku = useMemo(() => {
    const selectedCode = Number(debouncedProductoCodigo || 0);

    if (!selectedCode) {
      return '';
    }

    const selected = productOptions.find(
      (option) => Number(option.value) === selectedCode
    );
    return String(selected?.sku || '').trim();
  }, [debouncedProductoCodigo, productOptions]);

  const normalizedFilters = useMemo(
    () =>
      buildMyInventoryFilters({
        codigoProducto: debouncedCodigoProducto,
        productSku: selectedProductSku || debouncedProductoSearch,
        tipoProducto: debouncedTipoProducto
      }),
    [
      debouncedCodigoProducto,
      selectedProductSku,
      debouncedProductoSearch,
      debouncedTipoProducto
    ]
  );

  const inventoryColumns = useMemo(
    () => [
      {
        title: 'Código Producto',
        dataIndex: 'codigoProducto',
        width: 150,
        align: 'center'
      },
      {
        title: 'SKU',
        dataIndex: 'sku',
        width: 180,
        align: 'center',
        render: (value) => value || 'N/A'
      },
      {
        title: 'Nombre Producto',
        dataIndex: 'nombreProducto',
        align: 'center'
      },
      {
        title: 'Tipo Producto',
        dataIndex: 'tipoProductoDescripcion',
        width: 180,
        align: 'center',
        render: (value) => value || 'N/A'
      },
      {
        title: 'Cantidad Disponible',
        dataIndex: 'disponible',
        width: 180,
        align: 'center'
      },
      {
        title: 'Detalle',
        dataIndex: 'acciones',
        width: 90,
        align: 'center',
        render: (_, record) => (
          <button
            type="button"
            className="inventory-detail-action-btn"
            onClick={() =>
              navigate(`/inventario/detalle/${record.codigoProducto}`, {
                state: {
                  inventoryItem: record
                }
              })
            }
            aria-label={`Ver detalle del producto ${record.codigoProducto}`}
          >
            <FileSearchOutlined />
          </button>
        )
      }
    ],
    [navigate]
  );

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);

    try {
      const response = await inventoryService.getBootstrap();
      setInventoryContext(response?.context || null);
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

  const loadInventory = async (queryFilters = {}) => {
    const requestId = inventoryRequestIdRef.current + 1;
    inventoryRequestIdRef.current = requestId;
    setLoadingInventory(true);

    try {
      const response = await inventoryService.getMyInventory(queryFilters);

      if (requestId !== inventoryRequestIdRef.current) {
        return;
      }

      setInventoryItems(response?.items || []);

      if (response?.context) {
        setInventoryContext((current) => ({
          ...(current || {}),
          ...response.context
        }));
      }
    } catch (error) {
      if (requestId === inventoryRequestIdRef.current) {
        messageApi.error(formatApiError(error));
      }
    } finally {
      if (requestId === inventoryRequestIdRef.current) {
        setLoadingInventory(false);
      }
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isReadyForQueries) {
      return;
    }

    loadInventory(normalizedFilters);
  }, [isReadyForQueries, normalizedFilters]);

  return (
    <div className="page-wrap inventory-page">
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

      <AppCard className="inventory-tabs-card" loading={loadingBootstrap}>
        <Tabs
          className="inventory-tabs"
          defaultActiveKey="mi-inventario"
          items={[
            {
              key: 'mi-inventario',
              label: 'Mi Inventario',
              children: (
                <div className="inventory-tab-content">
                  <Typography.Title level={4} className="inventory-tab-title">
                    Inventario de muestras
                  </Typography.Title>

                  <AppCard className="inventory-filters-card">
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={8}>
                        <Typography.Text className="inventory-filter-label">
                          Código Producto
                        </Typography.Text>
                        <AppInput
                          placeholder="Escriba..."
                          value={filters.codigoProducto}
                          onChange={(event) =>
                            setFilters((current) => ({
                              ...current,
                              codigoProducto: String(event.target.value || '').replace(
                                /[^\d]/g,
                                ''
                              )
                            }))
                          }
                        />
                      </Col>

                      <Col xs={24} md={8}>
                        <Typography.Text className="inventory-filter-label">
                          Producto
                        </Typography.Text>
                        <AppSelect
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Seleccionar..."
                          options={productOptions}
                          value={filters.productoCodigo}
                          onSearch={(value) =>
                            setFilters((current) => ({
                              ...current,
                              productoSearch: String(value || '')
                            }))
                          }
                          onChange={(value) =>
                            setFilters((current) => ({
                              ...current,
                              productoCodigo: value || undefined,
                              productoSearch:
                                value && value > 0
                                  ? String(
                                      productOptions.find(
                                        (item) => Number(item.value) === Number(value)
                                      )?.sku || ''
                                    )
                                  : ''
                            }))
                          }
                        />
                      </Col>

                      <Col xs={24} md={8}>
                        <Typography.Text className="inventory-filter-label">
                          Tipo Producto
                        </Typography.Text>
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
                    </Row>
                  </AppCard>

                  <AppCard
                    title={
                      <span>
                        Mi Inventario
                        {inventoryContext?.codigoVisitador
                          ? ` - Visitador ${inventoryContext.codigoVisitador}`
                          : ''}
                      </span>
                    }
                    className="inventory-grid-card"
                  >
                    {loadingInventory ? (
                      <div className="inventory-placeholder">Cargando inventario...</div>
                    ) : inventoryItems.length === 0 ? (
                      <Empty description="Sin resultados de inventario disponible." />
                    ) : (
                      <AppTable
                        rowKey={(record) =>
                          `${record.codigoProducto}-${record.tipoProducto}`
                        }
                        className="inventory-table-friendly"
                        columns={inventoryColumns}
                        dataSource={inventoryItems}
                        pagination={{
                          pageSize: 12,
                          showSizeChanger: false
                        }}
                      />
                    )}
                  </AppCard>
                </div>
              )
            },
            {
              key: 'ordenes',
              label: 'Órdenes',
              children: <InventoryOrdersSection />
            },
            {
              key: 'solicitudes',
              label: 'Solicitudes',
              children: <InventoryRequestsSection />
            }
          ]}
        />
      </AppCard>
    </div>
  );
}
