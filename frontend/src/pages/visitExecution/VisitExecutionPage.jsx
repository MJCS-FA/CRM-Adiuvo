import {
  ArrowLeftOutlined,
  BorderOutlined,
  CheckCircleFilled,
  CheckSquareFilled,
  DeleteOutlined,
  HeartFilled,
  HeartOutlined,
  LoadingOutlined,
  MedicineBoxOutlined
} from '@ant-design/icons';
import { Empty, Input, Rate, Space, Spin, Switch, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AppButton, AppCard, AppModal, AppSelect } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { visitExecutionService } from '../../services/visitExecutionService';
import { formatApiError } from '../../utils/formatApiError';

function formatVisitDate(value) {
  const text = String(value || '').trim();

  if (!text) {
    return 'Sin fecha';
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text.slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function formatVisitTime(value) {
  const text = String(value || '').trim();

  if (!text) {
    return 'Sin hora';
  }

  return text.length >= 5 ? text.slice(0, 5) : text;
}

function buildProductSelection(items = [], previous = {}) {
  const next = {};

  for (const item of items) {
    const id = Number(item.codigoProducto);
    const previousValue = previous[id] || {};

    next[id] = {
      agregar: Boolean(previousValue.agregar),
      favorito: Boolean(previousValue.favorito)
    };
  }

  return next;
}

function padTwo(value) {
  return String(value).padStart(2, '0');
}

function formatCurrentDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function formatCurrentTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin hora';
  }

  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}:${padTwo(date.getSeconds())}`;
}

function getLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(
      new Error('La geolocalización no está disponible en este dispositivo.')
    );
  }

  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (typeof window !== 'undefined' && !window.isSecureContext && !isLocalhost) {
    return Promise.reject(
      new Error(
        'La geolocalización requiere HTTPS. Abra la app en https:// o en localhost.'
      )
    );
  }

  const requestPosition = (options) =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const mapGeoError = (error) => {
    if (!error) {
      return 'No se pudo obtener la ubicación actual.';
    }

    if (error.code === 1) {
      return 'Permiso de ubicación denegado. Habilite la ubicación del navegador y vuelva a intentar.';
    }

    if (error.code === 2) {
      return 'No se pudo determinar la ubicación actual. Verifique GPS o red e intente nuevamente.';
    }

    if (error.code === 3) {
      return 'La ubicación tardó demasiado en responder. Intente nuevamente.';
    }

    return 'No se pudo obtener la ubicación actual. Verifique los permisos de geolocalización.';
  };

  return requestPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  })
    .catch(() =>
      requestPosition({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000
      })
    )
    .then((position) => ({
      latitudFin: Number(position.coords.latitude),
      longitudFin: Number(position.coords.longitude)
    }))
    .catch((error) => Promise.reject(new Error(mapGeoError(error))));
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

function resolveClientContext({ user, visit, visitId, fallbackCountry = 4 }) {
  const codUsuario = Number(user?.codPersonas || user?.personaId || 0);
  const codigoVisita = Number(visit?.codigoVisitaMedica || visitId || 0);
  const codMedico = Number(visit?.codigoMedico || 0);
  const codVisitador = Number(visit?.codigoVisitador || 0);
  const codPais = Number(visit?.codigoPais || fallbackCountry || 4);

  return {
    CodUsuario: Number.isFinite(codUsuario) && codUsuario > 0 ? codUsuario : null,
    CodigoVisita:
      Number.isFinite(codigoVisita) && codigoVisita > 0 ? codigoVisita : null,
    CodMedico: Number.isFinite(codMedico) && codMedico > 0 ? codMedico : null,
    CodVisitador:
      Number.isFinite(codVisitador) && codVisitador > 0 ? codVisitador : null,
    CodPais: Number.isFinite(codPais) && codPais > 0 ? codPais : 4
  };
}

function getSampleProductKey(value) {
  if (value && typeof value === 'object') {
    return String(value.codigoProducto ?? '');
  }

  return String(value ?? '');
}

export function VisitExecutionPage() {
  const { visitId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();

  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingSampleOrderProducts, setLoadingSampleOrderProducts] = useState(false);
  const [isSavingSampleOrder, setIsSavingSampleOrder] = useState(false);

  const [visit, setVisit] = useState(null);
  const [parrillas, setParrillas] = useState([]);
  const [familiasByParrilla, setFamiliasByParrilla] = useState({});
  const [selectedParrilla, setSelectedParrilla] = useState(undefined);
  const [selectedFamilia, setSelectedFamilia] = useState(undefined);
  const [products, setProducts] = useState([]);
  const [productSelection, setProductSelection] = useState({});
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(5);
  const [showOrderQuestionModal, setShowOrderQuestionModal] = useState(false);
  const [showSampleOrderScreen, setShowSampleOrderScreen] = useState(false);
  const [showSampleSignatureModal, setShowSampleSignatureModal] = useState(false);
  const [showFinalizationModal, setShowFinalizationModal] = useState(false);
  const [showLocationFallbackModal, setShowLocationFallbackModal] = useState(false);
  const [locationErrorMessage, setLocationErrorMessage] = useState('');
  const [sampleOrderProducts, setSampleOrderProducts] = useState([]);
  const [sampleOrderDrafts, setSampleOrderDrafts] = useState({});
  const [sampleOrderVisitadorCode, setSampleOrderVisitadorCode] = useState(null);
  const [sampleOrderGenerated, setSampleOrderGenerated] = useState(false);
  const [sampleOrderGeneratedCode, setSampleOrderGeneratedCode] = useState(null);
  const [sampleOrderS3Key, setSampleOrderS3Key] = useState('');
  const [sampleSignatureData, setSampleSignatureData] = useState('');
  const [showAllSampleProducts, setShowAllSampleProducts] = useState(true);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalizationClock, setFinalizationClock] = useState(new Date());
  const [hasSampleSignature, setHasSampleSignature] = useState(false);
  const signatureCanvasRef = useRef(null);
  const signatureDrawingRef = useRef(false);

  const actionMode = location.state?.actionMode === 'follow' ? 'follow' : 'start';
  const actionTitle = actionMode === 'follow' ? 'Seguir Visita' : 'Iniciar Visita';

  const families = useMemo(() => {
    if (!selectedParrilla) {
      return [];
    }

    return familiasByParrilla[String(selectedParrilla)] || [];
  }, [selectedParrilla, familiasByParrilla]);

  const familyOptions = useMemo(
    () =>
      families.map((item) => ({
        value: item.value,
        label: (
          <span className="visit-execution-family-option">
            <span>{item.label}</span>
            {item.isPrioritario ? <Tag color="gold">Prioritario</Tag> : null}
          </span>
        )
      })),
    [families]
  );

  const selectedProductsCount = useMemo(
    () => Object.values(productSelection).filter((state) => Boolean(state?.agregar)).length,
    [productSelection]
  );

  const selectedProductsPayload = useMemo(
    () =>
      products
        .map((product) => {
          const codigoProducto = Number(product.codigoProducto);

          if (!Number.isFinite(codigoProducto) || codigoProducto <= 0) {
            return null;
          }

          return {
            codigoProducto,
            isAgregado: Boolean(productSelection[codigoProducto]?.agregar),
            isFavorito: Boolean(productSelection[codigoProducto]?.favorito)
          };
        })
        .filter(Boolean),
    [products, productSelection]
  );

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

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);
    setSampleOrderGenerated(false);
    setSampleOrderGeneratedCode(null);
    setSampleOrderS3Key('');
    setSampleSignatureData('');

    try {
      const response = await visitExecutionService.getBootstrap(visitId);

      setVisit(response.visit || null);
      setParrillas(response.parrillas || []);
      setFamiliasByParrilla(response.familiasByParrilla || {});
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setLoadingBootstrap(false);
    }
  };

  const loadProducts = async (codigoParrilla, codigoFamiliaProducto) => {
    if (!codigoParrilla || !codigoFamiliaProducto) {
      setProducts([]);
      setProductSelection({});
      return;
    }

    setLoadingProducts(true);

    try {
      const response = await visitExecutionService.getProducts({
        codigoParrilla,
        codigoFamiliaProducto
      });

      const items = response.items || [];

      setProducts(items);
      setProductSelection((current) => buildProductSelection(items, current));
    } catch (error) {
      messageApi.error(formatApiError(error));
      setProducts([]);
      setProductSelection({});
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [visitId]);

  useEffect(() => {
    setSelectedFamilia(undefined);
    setProducts([]);
    setProductSelection({});
  }, [selectedParrilla]);

  useEffect(() => {
    loadProducts(selectedParrilla, selectedFamilia);
  }, [selectedParrilla, selectedFamilia]);

  useEffect(() => {
    if (!showFinalizationModal || isFinalized) {
      return undefined;
    }

    setFinalizationClock(new Date());
    const timer = window.setInterval(() => {
      setFinalizationClock(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [showFinalizationModal, isFinalized]);

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

  const handleProductCheck = (codigoProducto, field, checked) => {
    const key = Number(codigoProducto);

    setProductSelection((current) => ({
      ...current,
      [key]: {
        ...(current[key] || { agregar: false, favorito: false }),
        [field]: checked
      }
    }));
  };

  const handleContinue = () => {
    if (isSaving || isFinalized) {
      return;
    }

    setShowOrderQuestionModal(true);
  };

  const openFinalizationModal = () => {
    setShowSampleOrderScreen(false);
    setShowSampleSignatureModal(false);
    setShowFinalizationModal(true);
    setShowLocationFallbackModal(false);
    setLocationErrorMessage('');
    setFinalizationClock(new Date());
  };

  const loadSampleOrderProducts = async () => {
    setLoadingSampleOrderProducts(true);

    try {
      const response = await visitExecutionService.getSampleOrderProducts(visitId);
      const items = Array.isArray(response?.items) ? response.items : [];
      const visitadorCode = Number(
        response?.codigoUsuarioVisitador || response?.visit?.codigoVisitador || 0
      );

      setSampleOrderProducts(items);
      setSampleOrderDrafts((current) => buildSampleOrderDrafts(items, current));
      setSampleOrderVisitadorCode(
        Number.isFinite(visitadorCode) && visitadorCode > 0 ? visitadorCode : null
      );

      if (response?.visit) {
        setVisit((current) => ({
          ...(current || {}),
          ...response.visit
        }));
      }
    } catch (error) {
      messageApi.error(formatApiError(error));
      setSampleOrderProducts([]);
      setSampleOrderDrafts({});
      setSampleOrderVisitadorCode(null);
    } finally {
      setLoadingSampleOrderProducts(false);
    }
  };

  const handleOrderDecision = (value) => {
    setShowOrderQuestionModal(false);

    if (value === 'yes') {
      if (sampleOrderGenerated) {
        messageApi.info(
          `La entrega de muestra ya fue registrada localmente${sampleOrderGeneratedCode ? ` (CódigoEntrega: ${sampleOrderGeneratedCode})` : ''}.`
        );
        openFinalizationModal();
        return;
      }

      setShowSampleOrderScreen(true);
      setShowSampleSignatureModal(false);
      setHasSampleSignature(false);
      setShowAllSampleProducts(true);
      loadSampleOrderProducts();
      return;
    }

    setSampleOrderS3Key('');
    setSampleSignatureData('');
    openFinalizationModal();
  };

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

  const handleSaveSampleOrderBeforeRanking = async () => {
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
      const clientContext = resolveClientContext({
        user,
        visit: {
          ...(visit || {}),
          codigoVisitador: sampleOrderVisitadorCode || visit?.codigoVisitador
        },
        visitId,
        fallbackCountry: 4
      });

      if (!clientContext.CodVisitador) {
        throw new Error(
          'No se encontró CodVisitador para registrar la entrega de muestra.'
        );
      }

      const saveResult = await visitExecutionService.createSampleOrder(visitId, {
        products: sampleSelectedValidProducts.map((item) => ({
          codigoProducto: Number(item.codigoProducto),
          cantidad: Number(item.cantidad)
        })),
        signature: signatureData,
        comentarios: comment,
        corte: visit?.corte ?? null,
        codigoSolicitud: visit?.codigoSolicitud ?? null,
        s3KeyFirma: null,
        tuid: visit?.tuid ?? null
      });

      setSampleOrderGenerated(true);
      setSampleOrderS3Key(String(saveResult?.inventory?.s3KeyFirma || '').trim());
      setSampleSignatureData(signatureData);
      setSampleOrderGeneratedCode(
        Number(
          saveResult?.inventory?.codigoEntrega ||
            saveResult?.order?.codigoOrdenMuestra ||
            0
        ) || null
      );
      setShowSampleSignatureModal(false);
      setShowSampleOrderScreen(false);
      messageApi.success('Entrega de muestra guardada en MySQL.');
      openFinalizationModal();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSavingSampleOrder(false);
    }
  };

  const submitFinalizeVisit = async ({
    latitudFin = null,
    longitudFin = null,
    allowWithoutLocation = false
  } = {}) => {
    const resolvedS3KeyFirma = String(sampleOrderS3Key || '').trim();
    const resolvedSignature = String(sampleSignatureData || '').trim();
    const payload = {
      latitudFin,
      longitudFin,
      clasificacionVisita: Number(rating),
      detalleVisita: comment,
      products: selectedProductsPayload,
      generateSampleOrder: false,
      allowWithoutLocation: Boolean(allowWithoutLocation)
    };

    if (resolvedS3KeyFirma) {
      payload.s3KeyFirma = resolvedS3KeyFirma;
    }

    if (resolvedSignature) {
      payload.signature = resolvedSignature;
    }

    if (
      Number(visit.codigoTipoVisita || 0) !== 2 &&
      visit.codigoPlazaMedica !== null &&
      visit.codigoPlazaMedica !== undefined &&
      visit.codigoPlazaMedica !== ''
    ) {
      payload.codigoPlazaMedica = Number(visit.codigoPlazaMedica);
    }

    const response = await visitExecutionService.finalizeVisit(visitId, payload);
    const resultVisit = response?.visit || {};

    setVisit((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        codigoEstado: Number(resultVisit.codigoEstado || 5),
        estadoNombre: 'Completada'
      };
    });

    setIsFinalized(true);
    setShowFinalizationModal(false);
    setShowLocationFallbackModal(false);
    setLocationErrorMessage('');
    messageApi.success(
      allowWithoutLocation
        ? 'Visita finalizada sin geolocalización.'
        : 'Visita finalizada correctamente.'
    );
  };

  const handleFinalizeVisit = async () => {
    if (isSaving || isFinalized) {
      return;
    }

    if (!visit?.codigoVisitaMedica) {
      messageApi.error('No se encontró la visita actual para finalizar.');
      return;
    }

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      messageApi.error('Debe seleccionar una clasificación entre 1 y 5 estrellas.');
      return;
    }

    setIsSaving(true);

    try {
      let locationCoordinates;

      try {
        locationCoordinates = await getLocation();
      } catch (locationError) {
        setLocationErrorMessage(formatApiError(locationError));
        setShowLocationFallbackModal(true);
        return;
      }

      await submitFinalizeVisit({
        latitudFin: locationCoordinates.latitudFin,
        longitudFin: locationCoordinates.longitudFin,
        allowWithoutLocation: false
      });
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeWithoutLocation = async () => {
    if (isSaving || isFinalized) {
      return;
    }

    setIsSaving(true);

    try {
      await submitFinalizeVisit({
        latitudFin: null,
        longitudFin: null,
        allowWithoutLocation: true
      });
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={`page-wrap visit-execution-page ${
        showSampleOrderScreen ? 'visit-sample-order-mode' : ''
      }`.trim()}
    >
      {contextHolder}

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {actionTitle}
      </Typography.Title>

      {showSampleOrderScreen ? (
        <div className="visit-sample-order-screen">
          <div className="visit-sample-order-toolbar">
            <button
              type="button"
              className="visit-sample-order-back-link"
              onClick={() => {
                if (!isSavingSampleOrder) {
                  setShowSampleOrderScreen(false);
                  setShowSampleSignatureModal(false);
                }
              }}
              disabled={isSavingSampleOrder}
            >
              <ArrowLeftOutlined />
              Regresar
            </button>

            <div className="visit-sample-order-toolbar-main">
              <Typography.Text className="visit-sample-order-toolbar-meta" type="secondary">
                {visit?.codigoTipoVisita === 2
                  ? visit?.nombreSucursal || 'Sucursal'
                  : visit?.nombreMedico || 'Médico'}{' '}
                | Visita {visit?.codigoVisitaMedica || visitId}
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
                <div className="visit-sample-order-panel-title">
                  <MedicineBoxOutlined />
                  <span>Listado de Productos</span>
                </div>
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
                  description="Todos los productos ya fueron agregados."
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
            </AppCard>
          </div>
        </div>
      ) : (
        <>
          <AppCard loading={loadingBootstrap}>
            <div className="visit-execution-visit-meta">
              <Typography.Text>
                <strong>Visita:</strong>{' '}
                {visit?.codigoTipoVisita === 2
                  ? visit?.nombreSucursal || 'Sucursal'
                  : visit?.nombreMedico || 'Médico'}
              </Typography.Text>
              <Typography.Text>
                <strong>Fecha:</strong> {formatVisitDate(visit?.fechaProgramada)}
              </Typography.Text>
              <Typography.Text>
                <strong>Hora:</strong> {formatVisitTime(visit?.horaProgramada)}
              </Typography.Text>
              <Typography.Text>
                <strong>Estado:</strong> {visit?.estadoNombre || 'N/A'}
              </Typography.Text>
            </div>
          </AppCard>

          <div className="visit-execution-layout">
            <AppCard title="Productos" loading={loadingBootstrap}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div>
                  <Typography.Text className="visit-execution-field-label">Parrilla</Typography.Text>
                  <AppSelect
                    placeholder="Seleccionar..."
                    options={parrillas}
                    value={selectedParrilla}
                    onChange={(value) => setSelectedParrilla(value || undefined)}
                  />
                </div>

                <div>
                  <Typography.Text className="visit-execution-field-label">Familia</Typography.Text>
                  <AppSelect
                    placeholder={selectedParrilla ? 'Seleccionar...' : 'Seleccione parrilla'}
                    options={familyOptions}
                    value={selectedFamilia}
                    disabled={!selectedParrilla}
                    onChange={(value) => setSelectedFamilia(value || undefined)}
                  />
                </div>

                <div className="visit-execution-products-block">
                  {!selectedParrilla ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Seleccione una parrilla para ver familias."
                    />
                  ) : !selectedFamilia ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Seleccione una familia para cargar productos."
                    />
                  ) : loadingProducts ? (
                    <Typography.Text type="secondary">Cargando productos...</Typography.Text>
                  ) : products.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No hay productos para la selección actual."
                    />
                  ) : (
                    <div className="visit-execution-products-list">
                      {products.map((product) => {
                        const productId = Number(product.codigoProducto);
                        const state = productSelection[productId] || {
                          agregar: false,
                          favorito: false
                        };

                        return (
                          <div
                            key={productId}
                            className="visit-execution-product-row"
                          >
                            <Typography.Text className="visit-execution-product-name">
                              {product.nombreProducto || `Producto ${productId}`}
                            </Typography.Text>

                            <div className="visit-execution-product-actions">
                              <button
                                type="button"
                                className={`visit-execution-icon-toggle visit-execution-add-toggle ${
                                  state.agregar ? 'is-active' : ''
                                }`}
                                aria-label={state.agregar ? 'Quitar producto' : 'Agregar producto'}
                                onClick={() => handleProductCheck(productId, 'agregar', !state.agregar)}
                              >
                                {state.agregar ? <CheckSquareFilled /> : <BorderOutlined />}
                              </button>
                              <button
                                type="button"
                                className={`visit-execution-icon-toggle visit-execution-favorite-toggle ${
                                  state.favorito ? 'is-active' : ''
                                }`}
                                aria-label={state.favorito ? 'Quitar favorito' : 'Agregar favorito'}
                                onClick={() => handleProductCheck(productId, 'favorito', !state.favorito)}
                              >
                                {state.favorito ? <HeartFilled /> : <HeartOutlined />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Space>
            </AppCard>

            <AppCard title="Datos de la Visita" loading={loadingBootstrap}>
              <div className="visit-execution-visit-panel">
                <Typography.Text type="secondary">
                  Productos seleccionados: {selectedProductsCount}
                </Typography.Text>

                <div className="visit-execution-comment-block">
                  <Typography.Text className="visit-execution-field-label">Comentario</Typography.Text>
                  <Input.TextArea
                    className="app-input visit-execution-comment-input"
                    placeholder="Escriba un comentario..."
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={8}
                  />
                </div>

                <div className="visit-execution-footer">
                  <AppButton
                    onClick={handleContinue}
                    disabled={isSaving || isFinalized}
                  >
                    Continuar
                  </AppButton>
                </div>
              </div>
            </AppCard>
          </div>
        </>
      )}

      <AppModal
        open={showOrderQuestionModal}
        title="Confirmación"
        onCancel={() => setShowOrderQuestionModal(false)}
        footer={[
          <AppButton
            key="no"
            variant="outline"
            onClick={() => handleOrderDecision('no')}
            disabled={isSaving}
          >
            NO
          </AppButton>,
          <AppButton
            key="yes"
            onClick={() => handleOrderDecision('yes')}
            disabled={isSaving}
          >
            Sí
          </AppButton>
        ]}
      >
        <Typography.Text className="visit-execution-question-text">
          {'\u00BFDesea generar una orden de muestra para esta visita?'}
        </Typography.Text>
      </AppModal>

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
            onClick={handleSaveSampleOrderBeforeRanking}
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

      <AppModal
        open={showFinalizationModal}
        title="Finalizar visita"
        onCancel={() => {
          if (!isSaving) {
            setShowFinalizationModal(false);
          }
        }}
        maskClosable={false}
        keyboard={!isSaving}
        footer={[
          <AppButton
            key="cancel"
            variant="outline"
            onClick={() => setShowFinalizationModal(false)}
            disabled={isSaving}
          >
            Cancelar
          </AppButton>,
          <AppButton
            key="finalize"
            onClick={handleFinalizeVisit}
            disabled={isSaving || isFinalized}
            loading={isSaving}
          >
            Finalizar
          </AppButton>
        ]}
      >
        <div className="visit-execution-finalize-modal-body">
          <Typography.Text className="visit-execution-field-label">
            Clasificación Visita
          </Typography.Text>
          <Rate
            value={rating}
            onChange={setRating}
            disabled={isSaving || isFinalized}
          />

          <div className="visit-execution-finalize-meta">
            <Typography.Text>
              <strong>Fecha actual:</strong> {formatCurrentDate(finalizationClock)}
            </Typography.Text>
            <Typography.Text>
              <strong>Hora actual:</strong> {formatCurrentTime(finalizationClock)}
            </Typography.Text>
          </div>
        </div>
      </AppModal>

      <AppModal
        open={showLocationFallbackModal}
        title="Ubicación no disponible"
        onCancel={() => {
          if (!isSaving) {
            setShowLocationFallbackModal(false);
          }
        }}
        maskClosable={false}
        keyboard={!isSaving}
        footer={[
          <AppButton
            key="retry"
            variant="outline"
            onClick={() => {
              setShowLocationFallbackModal(false);
              setLocationErrorMessage('');
              handleFinalizeVisit();
            }}
            disabled={isSaving}
          >
            Reintentar
          </AppButton>,
          <AppButton
            key="without-location"
            onClick={handleFinalizeWithoutLocation}
            disabled={isSaving || isFinalized}
            loading={isSaving}
          >
            Finalizar sin ubicación
          </AppButton>
        ]}
      >
        <div className="visit-execution-location-fallback-body">
          <Typography.Text>
            {locationErrorMessage || 'No se pudo obtener la ubicación actual.'}
          </Typography.Text>
          <Typography.Text type="secondary">
            Puede reintentar o finalizar sin geolocalización.
          </Typography.Text>
        </div>
      </AppModal>

      <AppModal
        open={isSaving}
        closable={false}
        maskClosable={false}
        keyboard={false}
        footer={null}
        title={null}
        width={320}
      >
        <div className="visit-execution-saving-modal">
          <Spin indicator={<LoadingOutlined spin />} size="large" />
          <Typography.Text strong>Finalizando visita...</Typography.Text>
          <Typography.Text type="secondary">
            Guardando información, por favor espere.
          </Typography.Text>
        </div>
      </AppModal>
    </div>
  );
}
