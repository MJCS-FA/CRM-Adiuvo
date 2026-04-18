import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  DeleteOutlined,
  MedicineBoxOutlined
} from '@ant-design/icons';
import { Empty, Spin, Switch, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppButton, AppCard, AppInput, AppModal } from '../ui';
import { visitExecutionService } from '../../services/visitExecutionService';
import { formatApiError } from '../../utils/formatApiError';

function getSampleProductKey(value) {
  if (value && typeof value === 'object') {
    return String(value.codigoProducto ?? '');
  }

  return String(value ?? '');
}

function buildSampleOrderDrafts(items = [], previous = {}) {
  const next = {};

  for (const item of items) {
    const codigoProductoKey = getSampleProductKey(item);
    const previousValue = previous[codigoProductoKey] || {};

    next[codigoProductoKey] = {
      selected: Boolean(previousValue.selected),
      quantity: String(previousValue.quantity || ''),
      error: String(previousValue.error || '')
    };
  }

  return next;
}

function normalizeSampleQuantity(rawValue, maxAvailable) {
  const raw = String(rawValue || '');
  const cleaned = raw.replace(/[^\d]/g, '');
  let selected = Boolean(cleaned);
  let error = '';

  if (raw && raw !== cleaned) {
    error = 'Solo se permiten números enteros sin negativos ni decimales.';
  }

  if (cleaned) {
    const quantity = Number(cleaned);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      selected = false;
      error = 'La cantidad debe ser un número entero mayor a 0.';
    } else if (quantity > Number(maxAvailable || 0)) {
      selected = true;
      error = `La cantidad no puede ser mayor a ${Number(maxAvailable || 0)}.`;
    }
  } else if (!raw) {
    selected = false;
    error = '';
  }

  return {
    quantity: cleaned,
    selected,
    error
  };
}

function getCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

export function SampleOrderGeneratorPanel({
  visitId,
  onCancel,
  onSaved
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [loadingSampleOrderProducts, setLoadingSampleOrderProducts] = useState(false);
  const [isSavingSampleOrder, setIsSavingSampleOrder] = useState(false);
  const [sampleOrderProducts, setSampleOrderProducts] = useState([]);
  const [sampleOrderDrafts, setSampleOrderDrafts] = useState({});
  const [showAllSampleProducts, setShowAllSampleProducts] = useState(true);
  const [showSampleSignatureModal, setShowSampleSignatureModal] = useState(false);
  const [hasSampleSignature, setHasSampleSignature] = useState(false);
  const [visitData, setVisitData] = useState(null);
  const [comment, setComment] = useState('');
  const signatureCanvasRef = useRef(null);
  const signatureDrawingRef = useRef(false);

  const sampleSelectedValidProducts = useMemo(
    () =>
      sampleOrderProducts
        .map((product) => {
          const codigoProductoRaw = product.codigoProducto;
          const codigoProducto = Number(codigoProductoRaw);
          const productKey = getSampleProductKey(product);
          const draft = sampleOrderDrafts[productKey] || {
            selected: false,
            quantity: '',
            error: ''
          };
          const cantidad = Number(draft.quantity);
          const disponible = Number(product.disponible || 0);

          if (
            !draft.selected ||
            !Number.isInteger(cantidad) ||
            cantidad <= 0 ||
            cantidad > disponible ||
            draft.error ||
            !Number.isFinite(codigoProducto) ||
            codigoProducto <= 0
          ) {
            return null;
          }

          return {
            codigoProducto: codigoProductoRaw,
            cantidad
          };
        })
        .filter(Boolean),
    [sampleOrderProducts, sampleOrderDrafts]
  );

  const sampleSelectedProducts = useMemo(
    () =>
      sampleOrderProducts
        .map((product) => {
          const productKey = getSampleProductKey(product);
          const draft = sampleOrderDrafts[productKey] || {
            selected: false,
            quantity: '',
            error: ''
          };

          if (!draft.selected) {
            return null;
          }

          return {
            ...product,
            productKey,
            draft
          };
        })
        .filter(Boolean),
    [sampleOrderProducts, sampleOrderDrafts]
  );

  const sampleVisibleProducts = useMemo(() => {
    if (showAllSampleProducts) {
      return sampleOrderProducts;
    }

    return sampleOrderProducts.filter((product) => {
      const productKey = getSampleProductKey(product);
      return !Boolean(sampleOrderDrafts[productKey]?.selected);
    });
  }, [showAllSampleProducts, sampleOrderProducts, sampleOrderDrafts]);

  const sampleHasInvalidSelection = useMemo(
    () =>
      sampleOrderProducts.some((product) => {
        const productKey = getSampleProductKey(product);
        const draft = sampleOrderDrafts[productKey];

        if (!draft?.selected) {
          return false;
        }

        const cantidad = Number(draft.quantity);
        const disponible = Number(product.disponible || 0);

        return (
          Boolean(draft.error) ||
          !Number.isInteger(cantidad) ||
          cantidad <= 0 ||
          cantidad > disponible
        );
      }),
    [sampleOrderProducts, sampleOrderDrafts]
  );

  const canGenerateSampleOrder =
    !loadingSampleOrderProducts &&
    !isSavingSampleOrder &&
    sampleSelectedValidProducts.length > 0 &&
    !sampleHasInvalidSelection;

  const loadSampleOrderProducts = async () => {
    if (!visitId) {
      return;
    }

    setLoadingSampleOrderProducts(true);

    try {
      const response = await visitExecutionService.getSampleOrderProducts(visitId);
      const items = Array.isArray(response?.items) ? response.items : [];
      setSampleOrderProducts(items);
      setSampleOrderDrafts((current) => buildSampleOrderDrafts(items, current));
      setVisitData(response?.visit || null);
    } catch (error) {
      messageApi.error(formatApiError(error));
      setSampleOrderProducts([]);
      setSampleOrderDrafts({});
      setVisitData(null);
    } finally {
      setLoadingSampleOrderProducts(false);
    }
  };

  useEffect(() => {
    loadSampleOrderProducts();
  }, [visitId]);

  useEffect(() => {
    if (!showSampleSignatureModal) {
      return;
    }

    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.2;
    context.strokeStyle = '#1f2a3d';
    setHasSampleSignature(false);
  }, [showSampleSignatureModal]);

  const handleSampleProductToggle = (product) => {
    const productKey = getSampleProductKey(product);
    const disponible = Number(product.disponible || 0);

    if (disponible <= 0 || isSavingSampleOrder) {
      return;
    }

    setSampleOrderDrafts((current) => {
      const currentDraft = current[productKey] || {
        selected: false,
        quantity: '',
        error: ''
      };
      const nextSelected = !currentDraft.selected;

      if (!nextSelected) {
        return {
          ...current,
          [productKey]: {
            ...currentDraft,
            selected: false,
            quantity: '',
            error: ''
          }
        };
      }

      const quantityToUse = currentDraft.quantity || '1';
      const normalized = normalizeSampleQuantity(quantityToUse, disponible);

      return {
        ...current,
        [productKey]: {
          ...currentDraft,
          selected: true,
          quantity: normalized.quantity,
          error: normalized.error
        }
      };
    });
  };

  const handleSampleQuantityChange = (product, rawValue) => {
    const productKey = getSampleProductKey(product);
    const disponible = Number(product.disponible || 0);
    const normalized = normalizeSampleQuantity(rawValue, disponible);

    setSampleOrderDrafts((current) => ({
      ...current,
      [productKey]: {
        ...(current[productKey] || {
          selected: false,
          quantity: '',
          error: ''
        }),
        ...normalized
      }
    }));
  };

  const handleSampleProductRemove = (product) => {
    const productKey = getSampleProductKey(product);

    setSampleOrderDrafts((current) => ({
      ...current,
      [productKey]: {
        ...(current[productKey] || {
          selected: false,
          quantity: '',
          error: ''
        }),
        selected: false,
        quantity: '',
        error: ''
      }
    }));
  };

  const handleOpenSampleSignatureModal = () => {
    if (!sampleSelectedValidProducts.length) {
      messageApi.warning('Seleccione al menos un producto con cantidad válida.');
      return;
    }

    if (sampleHasInvalidSelection) {
      messageApi.warning(
        'Corrija las cantidades inválidas antes de continuar con la firma.'
      );
      return;
    }

    setShowSampleSignatureModal(true);
  };

  const clearSampleSignature = () => {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasSampleSignature(false);
  };

  const handleSampleSignaturePointerDown = (event) => {
    const canvas = signatureCanvasRef.current;

    if (!canvas || isSavingSampleOrder) {
      return;
    }

    event.preventDefault();
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(canvas, event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    signatureDrawingRef.current = true;
    setHasSampleSignature(true);
  };

  const handleSampleSignaturePointerMove = (event) => {
    const canvas = signatureCanvasRef.current;

    if (!canvas || !signatureDrawingRef.current || isSavingSampleOrder) {
      return;
    }

    event.preventDefault();
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(canvas, event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopSampleSignatureDrawing = () => {
    signatureDrawingRef.current = false;
  };

  const handleSaveOrder = async () => {
    if (isSavingSampleOrder) {
      return;
    }

    if (!sampleSelectedValidProducts.length) {
      messageApi.warning('No hay productos válidos para generar la entrega de muestra.');
      return;
    }

    if (!hasSampleSignature) {
      messageApi.warning('Debe capturar la firma para continuar.');
      return;
    }

    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      messageApi.error('No se pudo capturar la firma. Intente nuevamente.');
      return;
    }

    setIsSavingSampleOrder(true);

    try {
      const signatureData = canvas.toDataURL('image/png');
      const saveResult = await visitExecutionService.createSampleOrder(visitId, {
        products: sampleSelectedValidProducts.map((item) => ({
          codigoProducto: Number(item.codigoProducto),
          cantidad: Number(item.cantidad)
        })),
        signature: signatureData,
        comentarios: comment,
        corte: visitData?.corte ?? null,
        codigoSolicitud: visitData?.codigoSolicitud ?? null,
        s3KeyFirma: null,
        tuid: visitData?.tuid ?? null
      });

      setShowSampleSignatureModal(false);
      messageApi.success('Orden generada correctamente.');
      onSaved?.(saveResult);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSavingSampleOrder(false);
    }
  };

  return (
    <>
      {contextHolder}
      <div className="visit-sample-order-screen">
        <div className="visit-sample-order-toolbar">
          <button
            type="button"
            className="visit-sample-order-back-link"
            onClick={onCancel}
            disabled={isSavingSampleOrder}
          >
            <ArrowLeftOutlined />
            Regresar
          </button>

          <div className="visit-sample-order-toolbar-main">
            <Typography.Text type="secondary" className="visit-sample-order-toolbar-meta">
              {loadingSampleOrderProducts
                ? 'Cargando productos...'
                : `Visita ${visitId}${visitData?.nombreMedico ? ` - ${visitData.nombreMedico}` : ''}`}
            </Typography.Text>

            <AppButton
              onClick={handleOpenSampleSignatureModal}
              disabled={!canGenerateSampleOrder || isSavingSampleOrder}
              loading={isSavingSampleOrder}
            >
              Generar
            </AppButton>
          </div>
        </div>

        <div className="visit-sample-order-layout">
          <AppCard
            className="visit-sample-order-panel"
            title={
              <span className="visit-sample-order-panel-title">
                <MedicineBoxOutlined />
                Listado de Productos
              </span>
            }
            extra={
              <div className="visit-sample-order-panel-extra">
                <Typography.Text type="secondary">Ver todo</Typography.Text>
                <Switch
                  checked={showAllSampleProducts}
                  onChange={setShowAllSampleProducts}
                  size="small"
                  disabled={loadingSampleOrderProducts || isSavingSampleOrder}
                />
              </div>
            }
          >
            {loadingSampleOrderProducts ? (
              <div className="visit-sample-order-loading">
                <Spin />
              </div>
            ) : sampleOrderProducts.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No hay productos disponibles para esta entrega."
              />
            ) : sampleVisibleProducts.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Todos los productos visibles ya fueron agregados."
              />
            ) : (
              <div className="visit-sample-order-products-list">
                {sampleVisibleProducts.map((product) => {
                  const productKey = getSampleProductKey(product);
                  const codigoProducto = Number(product.codigoProducto);
                  const disponible = Number(product.disponible || 0);
                  const draft = sampleOrderDrafts[productKey] || {
                    selected: false,
                    quantity: '',
                    error: ''
                  };
                  const isDisabled = disponible <= 0;

                  return (
                    <div
                      key={productKey}
                      className={`visit-sample-order-product-row ${
                        draft.selected ? 'is-selected' : ''
                      } ${isDisabled ? 'is-disabled' : ''}`}
                      onClick={() => handleSampleProductToggle(product)}
                      role="button"
                      tabIndex={isDisabled ? -1 : 0}
                      onKeyDown={(event) => {
                        if (isDisabled) {
                          return;
                        }

                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSampleProductToggle(product);
                        }
                      }}
                      aria-disabled={isDisabled}
                    >
                      <div className="visit-sample-order-product-main">
                        <Typography.Text className="visit-sample-order-product-name">
                          {product.nombreProducto || `Producto ${codigoProducto || productKey}`}
                        </Typography.Text>

                        <Typography.Text type="secondary">
                          {product.nombreFamiliaProducto || 'Sin familia'}
                        </Typography.Text>

                        {product.sku ? (
                          <Typography.Text type="secondary">SKU: {product.sku}</Typography.Text>
                        ) : null}
                      </div>

                      <div className="visit-sample-order-product-side">
                        <Typography.Text className="visit-sample-order-available-label">
                          Disponible
                        </Typography.Text>
                        <Typography.Text className="visit-sample-order-available-value">
                          {disponible}
                        </Typography.Text>
                        {draft.selected ? (
                          <CheckCircleFilled className="visit-sample-order-selected-icon" />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AppCard>

          <AppCard
            className="visit-sample-order-panel"
            title="Productos Agregados"
            extra={
              <Typography.Text type="secondary">
                {sampleSelectedProducts.length} seleccionados
              </Typography.Text>
            }
          >
            {sampleSelectedProducts.length === 0 ? (
              <Empty
                className="visit-sample-order-selected-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Seleccione productos para ingresarlos en la orden."
              />
            ) : (
              <div className="visit-sample-order-selected-list">
                {sampleSelectedProducts.map((item) => {
                  const disponible = Number(item.disponible || 0);
                  const qtyInputId = `sample-selected-qty-${item.productKey}`;

                  return (
                    <div
                      key={`selected-${item.productKey}`}
                      className="visit-sample-order-selected-row"
                    >
                      <div className="visit-sample-order-selected-main">
                        <Typography.Text className="visit-sample-order-selected-name">
                          {item.nombreProducto || `Producto ${item.productKey}`}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          {item.nombreFamiliaProducto || 'Sin familia'}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Disponible: {disponible}
                        </Typography.Text>
                      </div>

                      <div className="visit-sample-order-selected-controls">
                        <div className="visit-sample-order-selected-qty-wrap">
                          <label
                            htmlFor={qtyInputId}
                            className="visit-sample-order-qty-label"
                          >
                            Cantidad
                          </label>
                          <input
                            id={qtyInputId}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="visit-sample-order-qty-input"
                            value={item.draft.quantity}
                            onChange={(event) =>
                              handleSampleQuantityChange(item, event.target.value)
                            }
                            disabled={isSavingSampleOrder}
                            placeholder="0"
                          />
                        </div>

                        <button
                          type="button"
                          className="visit-sample-order-remove-btn"
                          onClick={() => handleSampleProductRemove(item)}
                          disabled={isSavingSampleOrder}
                          aria-label="Quitar producto"
                        >
                          <DeleteOutlined />
                        </button>
                      </div>

                      {item.draft.error ? (
                        <Typography.Text
                          type="danger"
                          className="visit-sample-order-qty-error"
                        >
                          {item.draft.error}
                        </Typography.Text>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="visit-sample-order-summary">
              <Typography.Text
                type={sampleHasInvalidSelection ? 'danger' : 'secondary'}
              >
                {sampleHasInvalidSelection
                  ? 'Hay cantidades inválidas. Corrija antes de generar.'
                  : `Productos válidos seleccionados: ${sampleSelectedValidProducts.length}`}
              </Typography.Text>
            </div>

            <div>
              <Typography.Text className="inventory-filter-label">Comentarios</Typography.Text>
              <AppInput
                type="textarea"
                placeholder="Comentario de la orden..."
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                disabled={isSavingSampleOrder}
              />
            </div>
          </AppCard>
        </div>
      </div>

      <AppModal
        open={showSampleSignatureModal}
        title={'Confirmaci\u00f3n de entrega de medicamentos'}
        onCancel={() => {
          if (!isSavingSampleOrder) {
            setShowSampleSignatureModal(false);
          }
        }}
        maskClosable={!isSavingSampleOrder}
        keyboard={!isSavingSampleOrder}
        footer={[
          <AppButton
            key="clear-signature"
            variant="outline"
            onClick={clearSampleSignature}
            disabled={isSavingSampleOrder}
          >
            Borrar firma
          </AppButton>,
          <AppButton
            key="back-signature"
            variant="outline"
            onClick={() => setShowSampleSignatureModal(false)}
            disabled={isSavingSampleOrder}
          >
            Regresar
          </AppButton>,
          <AppButton
            key="continue-signature"
            onClick={handleSaveOrder}
            disabled={isSavingSampleOrder || !hasSampleSignature}
            loading={isSavingSampleOrder}
          >
            Continuar
          </AppButton>
        ]}
      >
        <div className="visit-sample-order-confirmation-body">
          <Typography.Text>
            {'Firma para orden de muestra por visitador m\u00e9dico.'}
          </Typography.Text>

          <div className="visit-sample-order-signature-box">
            <canvas
              ref={signatureCanvasRef}
              width={640}
              height={240}
              className="visit-sample-order-signature-canvas"
              onPointerDown={handleSampleSignaturePointerDown}
              onPointerMove={handleSampleSignaturePointerMove}
              onPointerUp={stopSampleSignatureDrawing}
              onPointerLeave={stopSampleSignatureDrawing}
            />
          </div>
        </div>
      </AppModal>
    </>
  );
}
