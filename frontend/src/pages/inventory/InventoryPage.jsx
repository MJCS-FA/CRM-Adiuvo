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
    <div className="inv-page">
      {contextHolder}

      <style>{`
        .inv-page { display: flex; flex-direction: column; gap: 20px; }

        .inv-header {
          display: flex; align-items: center; justify-content: space-between;
        }
        .inv-header-title { font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; }
        .inv-header-sub { font-size: 13px; color: var(--text-tertiary); margin-top: 2px; }

        .inv-tabs-wrap {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .inv-filters-card {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          display: flex; gap: 16px; align-items: flex-end;
          box-shadow: var(--shadow-xs);
          flex-wrap: wrap;
        }
        .inv-filter-group { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 180px; }
        .inv-filter-label { font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }

        .inv-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 14px;
        }
        .inv-product-card {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex; flex-direction: column; gap: 12px;
          box-shadow: var(--shadow-xs);
          transition: all var(--duration-normal) var(--ease-out);
          position: relative; overflow: hidden;
        }
        .inv-product-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, var(--adiuvo-red), var(--adiuvo-red-deep));
        }
        .inv-product-card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
        .inv-product-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .inv-product-name { font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.3; flex: 1; }
        .inv-product-code {
          padding: 3px 10px; border-radius: var(--radius-full);
          background: var(--adiuvo-red-light); color: var(--adiuvo-red);
          font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0;
        }
        .inv-product-sku { font-size: 12px; color: var(--text-tertiary); font-family: 'Courier New', monospace; }
        .inv-product-type {
          display: inline-flex; align-items: center;
          padding: 4px 10px; border-radius: var(--radius-full);
          background: var(--bg-subtle); color: var(--text-secondary);
          font-size: 11px; font-weight: 600; width: fit-content;
        }
        .inv-product-stock {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-radius: var(--radius-md);
          background: var(--bg-subtle); margin-top: 4px;
        }
        .inv-product-stock-lbl { font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
        .inv-product-stock-val { font-size: 22px; font-weight: 800; color: var(--text-primary); }
        .inv-product-action {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px; border-radius: var(--radius-md);
          border: 1.5px solid var(--border-default); background: transparent;
          font-size: 13px; font-weight: 600; color: var(--text-secondary);
          cursor: pointer; transition: all var(--duration-fast) var(--ease-out); width: 100%;
        }
        .inv-product-action:hover { border-color: var(--adiuvo-red); color: var(--adiuvo-red); background: var(--adiuvo-red-light); }

        .inv-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; padding: 60px 24px;
          background: var(--bg-card); border-radius: var(--radius-lg);
          border: 1px solid var(--border-default);
        }
        .inv-empty-icon { font-size: 48px; opacity: 0.25; }
        .inv-empty-text { font-size: 15px; font-weight: 600; color: var(--text-tertiary); }

        .inv-skeleton {
          background: var(--bg-card); border-radius: var(--radius-lg);
          height: 180px; border: 1px solid var(--border-default);
          animation: invSkel 1.5s ease-in-out infinite;
        }
        @keyframes invSkel { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* ── Header ── */}
      <div className="inv-header">
        <div>
          <div className="inv-header-title">Inventario</div>
          <div className="inv-header-sub">
            {inventoryContext?.codigoVisitador ? `Visitador ${inventoryContext.codigoVisitador}` : 'Muestras médicas y pedidos'}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="inv-tabs-wrap">
        <Tabs
          className="inventory-tabs"
          defaultActiveKey="mi-inventario"
          items={[
            {
              key: 'mi-inventario',
              label: 'Mi Inventario',
              children: (
                <div style={{ padding: '0 24px 24px' }}>
                  {/* Filters */}
                  <div className="inv-filters-card" style={{ margin: '0 0 20px', borderRadius: 'var(--radius-md)' }}>
                    <div className="inv-filter-group">
                      <span className="inv-filter-label">Código Producto</span>
                      <AppInput
                        placeholder="Número..."
                        value={filters.codigoProducto}
                        onChange={(e) => setFilters((c) => ({ ...c, codigoProducto: String(e.target.value || '').replace(/[^\d]/g, '') }))}
                      />
                    </div>
                    <div className="inv-filter-group">
                      <span className="inv-filter-label">Producto</span>
                      <AppSelect
                        allowClear showSearch optionFilterProp="label"
                        placeholder="Seleccionar..."
                        options={productOptions}
                        value={filters.productoCodigo}
                        onSearch={(v) => setFilters((c) => ({ ...c, productoSearch: String(v || '') }))}
                        onChange={(v) => setFilters((c) => ({ ...c, productoCodigo: v || undefined, productoSearch: v && v > 0 ? String(productOptions.find((i) => Number(i.value) === Number(v))?.sku || '') : '' }))}
                      />
                    </div>
                    <div className="inv-filter-group">
                      <span className="inv-filter-label">Tipo</span>
                      <AppSelect
                        allowClear showSearch optionFilterProp="label"
                        placeholder="Todos..."
                        options={typeOptions}
                        value={filters.tipoProducto}
                        onChange={(v) => setFilters((c) => ({ ...c, tipoProducto: v || undefined }))}
                      />
                    </div>
                  </div>

                  {/* Product Grid */}
                  {loadingBootstrap || loadingInventory ? (
                    <div className="inv-grid">
                      {[1,2,3,4,5,6].map((i) => <div key={i} className="inv-skeleton" />)}
                    </div>
                  ) : inventoryItems.length === 0 ? (
                    <div className="inv-empty">
                      <span className="inv-empty-icon">📦</span>
                      <span className="inv-empty-text">Sin resultados de inventario</span>
                    </div>
                  ) : (
                    <div className="inv-grid">
                      {inventoryItems.map((item) => (
                        <div key={`${item.codigoProducto}-${item.tipoProducto}`} className="inv-product-card">
                          <div className="inv-product-header">
                            <span className="inv-product-name">{item.nombreProducto || 'Sin nombre'}</span>
                            <span className="inv-product-code">#{item.codigoProducto}</span>
                          </div>
                          {item.sku && <span className="inv-product-sku">SKU: {item.sku}</span>}
                          {item.tipoProductoDescripcion && (
                            <span className="inv-product-type">{item.tipoProductoDescripcion}</span>
                          )}
                          <div className="inv-product-stock">
                            <span className="inv-product-stock-lbl">Disponible</span>
                            <span className="inv-product-stock-val">{item.disponible ?? '—'}</span>
                          </div>
                          <button
                            type="button"
                            className="inv-product-action"
                            onClick={() => navigate(`/inventario/detalle/${item.codigoProducto}`, { state: { inventoryItem: item } })}
                          >
                            <FileSearchOutlined /> Ver Detalle
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            },
            { key: 'ordenes', label: 'Órdenes', children: <InventoryOrdersSection /> },
            { key: 'solicitudes', label: 'Solicitudes', children: <InventoryRequestsSection /> }
          ]}
        />
      </div>
    </div>
  );
}
