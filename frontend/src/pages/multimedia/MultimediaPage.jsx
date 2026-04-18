import {
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileUnknownOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { Empty, Spin, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppButton, AppCard, AppInput, AppModal, AppSelect } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  cacheMultimediaCoverFromRemote,
  getCachedMultimediaCoverMap,
  normalizeMultimediaS3Key
} from '../../offline/multimediaCoverCache';
import { multimediaService } from '../../services/multimediaService';
import { formatApiError } from '../../utils/formatApiError';

const PORTADA_TABLE = 'BinarioPortadaMultimedia';
const ARCHIVO_TABLE = 'tblMultimedia';

function normalizeTipoFilter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeS3Key(value) {
  return normalizeMultimediaS3Key(value);
}

function inferExtension(name = '') {
  const value = normalizeText(name);
  const parts = value.split('.');
  if (parts.length < 2) {
    return '';
  }

  return parts[parts.length - 1].toLowerCase();
}

function inferMultimediaKind(item = {}) {
  const fileName = normalizeText(item.nombreArchivo);
  const extension = inferExtension(fileName);
  const mimeType = normalizeText(item.mimeType).toLowerCase();
  const typeLabel = normalizeText(item.tipoMultimedia).toLowerCase();

  if (
    ['mp4', 'm4v', 'mov', 'webm', 'avi'].includes(extension) ||
    mimeType.startsWith('video/') ||
    typeLabel.includes('video')
  ) {
    return { kind: 'video', extension };
  }

  if (
    extension === 'pdf' ||
    mimeType === 'application/pdf' ||
    typeLabel.includes('pdf')
  ) {
    return { kind: 'pdf', extension };
  }

  if (
    ['xls', 'xlsx', 'csv'].includes(extension) ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    typeLabel.includes('excel')
  ) {
    return { kind: 'excel', extension };
  }

  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension) ||
    mimeType.startsWith('image/')
  ) {
    return { kind: 'image', extension };
  }

  return { kind: 'other', extension };
}

function getKindLabel(kind = 'other') {
  if (kind === 'video') {
    return 'Ver Video';
  }

  if (kind === 'pdf') {
    return 'Ver PDF';
  }

  if (kind === 'excel') {
    return 'Abrir Excel';
  }

  if (kind === 'image') {
    return 'Ver Imagen';
  }

  return 'Abrir Archivo';
}

function getKindIcon(kind = 'other') {
  if (kind === 'video') {
    return <PlayCircleOutlined />;
  }

  if (kind === 'pdf') {
    return <FilePdfOutlined />;
  }

  if (kind === 'excel') {
    return <FileExcelOutlined />;
  }

  if (kind === 'image') {
    return <FileImageOutlined />;
  }

  return <FileUnknownOutlined />;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(normalizeText(value));
}

function buildCardKey(item = {}) {
  const multimediaId = Number(item.codigoMultimedia || 0);
  const fileName = normalizeText(item.nombreArchivo);
  const title = normalizeText(item.nombreMultimedia);

  return `${multimediaId}-${fileName}-${title}`;
}

function isOfflineCacheMissError(error) {
  return error?.code === 'OFFLINE_CACHE_MISS';
}

function filterItemsLocally(items = [], filters = {}) {
  const normalizedTipo = normalizeTipoFilter(filters.codigoTipoMultimedia);
  const normalizedBuscar = normalizeText(filters.buscar).toLowerCase();

  return (items || []).filter((item) => {
    if (normalizedTipo > 0 && Number(item.codigoTipoMultimedia || 0) !== normalizedTipo) {
      return false;
    }

    if (!normalizedBuscar) {
      return true;
    }

    const fields = [
      normalizeText(item.nombreMultimedia),
      normalizeText(item.descripcion),
      normalizeText(item.nombreArchivo)
    ]
      .join(' ')
      .toLowerCase();

    return fields.includes(normalizedBuscar);
  });
}

export function MultimediaPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const isOnline = useOnlineStatus();
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [typeOptions, setTypeOptions] = useState([]);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    codigoTipoMultimedia: 0,
    buscar: ''
  });
  const [isReady, setIsReady] = useState(false);
  const [openingItemKey, setOpeningItemKey] = useState('');
  const [coverUrlByKey, setCoverUrlByKey] = useState({});
  const [coverErrorByKey, setCoverErrorByKey] = useState({});
  const [coverLoadingByKey, setCoverLoadingByKey] = useState({});
  const [viewerState, setViewerState] = useState({
    open: false,
    url: '',
    kind: 'other',
    title: ''
  });
  const [offlineModuleMessage, setOfflineModuleMessage] = useState('');

  const listRequestIdRef = useRef(0);
  const coverRequestIdRef = useRef(0);

  const debouncedBuscar = useDebouncedValue(filters.buscar, 260);
  const debouncedTipo = useDebouncedValue(filters.codigoTipoMultimedia, 120);

  const normalizedFilters = useMemo(
    () => ({
      codigoTipoMultimedia: normalizeTipoFilter(debouncedTipo),
      buscar: normalizeText(debouncedBuscar)
    }),
    [debouncedBuscar, debouncedTipo]
  );

  const loadBootstrap = async () => {
    setLoadingBootstrap(true);

    try {
      const response = await multimediaService.getBootstrap();
      const options = Array.isArray(response?.filtros?.tiposMultimedia)
        ? response.filtros.tiposMultimedia
        : [];
      setTypeOptions(options);
      setIsReady(true);
      setOfflineModuleMessage('');
    } catch (error) {
      if (isOfflineCacheMissError(error) && !isOnline) {
        setOfflineModuleMessage(
          'Este contenido aún no está disponible offline. Conéctate a internet para sincronizar multimedia.'
        );
      } else {
        messageApi.error(formatApiError(error));
      }
      setIsReady(false);
    } finally {
      setLoadingBootstrap(false);
    }
  };

  const loadItems = async (queryFilters = normalizedFilters) => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoadingItems(true);

    try {
      const response = await multimediaService.getItems(queryFilters);

      if (requestId !== listRequestIdRef.current) {
        return;
      }

      setItems(Array.isArray(response?.items) ? response.items : []);
      setOfflineModuleMessage('');
    } catch (error) {
      if (requestId === listRequestIdRef.current) {
        if (isOfflineCacheMissError(error) && !isOnline) {
          try {
            const fallbackResponse = await multimediaService.getItems({
              codigoTipoMultimedia: 0,
              buscar: ''
            });
            const fallbackItems = Array.isArray(fallbackResponse?.items)
              ? fallbackResponse.items
              : [];

            setItems(filterItemsLocally(fallbackItems, queryFilters));
            setOfflineModuleMessage(
              'Mostrando multimedia disponible en caché offline.'
            );
          } catch {
            setItems([]);
            setOfflineModuleMessage(
              'Este contenido aún no está disponible offline. Conéctate a internet para sincronizar multimedia.'
            );
          }
        } else {
          messageApi.error(formatApiError(error));
        }
      }
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoadingItems(false);
      }
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    loadItems(normalizedFilters);
  }, [isReady, normalizedFilters]);

  const pendingCoverKeys = useMemo(() => {
    const keys = new Set();

    for (const item of items) {
      const key = normalizeS3Key(item.s3KeyPortada);
      if (!key) {
        continue;
      }

      if (coverUrlByKey[key]) {
        continue;
      }

      if (coverErrorByKey[key] && !isOnline) {
        continue;
      }

      keys.add(key);
    }

    return [...keys];
  }, [items, coverUrlByKey, coverErrorByKey, isOnline]);

  useEffect(() => {
    if (!pendingCoverKeys.length) {
      return;
    }

    const requestId = coverRequestIdRef.current + 1;
    coverRequestIdRef.current = requestId;
    let cancelled = false;

    setCoverLoadingByKey((current) => {
      const next = { ...current };
      pendingCoverKeys.forEach((s3Key) => {
        next[s3Key] = true;
      });
      return next;
    });

    const resolveCoverUrls = async () => {
      const cachedCovers = await getCachedMultimediaCoverMap(pendingCoverKeys);
      const successMap = {};
      const errorMap = {};
      const loadingMap = {};
      const unresolvedKeys = [];

      for (const s3Key of pendingCoverKeys) {
        const cachedCover = normalizeText(cachedCovers[s3Key]);

        if (cachedCover) {
          successMap[s3Key] = cachedCover;
          loadingMap[s3Key] = false;
          continue;
        }

        unresolvedKeys.push(s3Key);
      }

      if (!unresolvedKeys.length) {
        if (!cancelled && requestId === coverRequestIdRef.current) {
          setCoverUrlByKey((current) => ({
            ...current,
            ...successMap
          }));
          setCoverLoadingByKey((current) => ({
            ...current,
            ...loadingMap
          }));
        }
        return;
      }

      if (!isOnline) {
        unresolvedKeys.forEach((s3Key) => {
          loadingMap[s3Key] = false;
          errorMap[s3Key] = true;
        });
      } else {
        const results = await Promise.allSettled(
          unresolvedKeys.map(async (s3Key) => {
            const resolvedResponse = await multimediaService.resolveFileUrl({
              s3Key,
              nombreTabla: PORTADA_TABLE
            });
            const resolvedUrl = normalizeText(
              resolvedResponse?.url || resolvedResponse?.URL
            );

            if (!resolvedUrl) {
              throw new Error('Cover URL is empty.');
            }

            const cachedDataUrl = await cacheMultimediaCoverFromRemote({
              s3Key,
              sourceUrl: resolvedUrl
            }).catch(() => '');

            return {
              s3Key,
              finalUrl: cachedDataUrl || resolvedUrl
            };
          })
        );

        results.forEach((result, index) => {
          const s3Key = unresolvedKeys[index];

          if (!s3Key) {
            return;
          }

          loadingMap[s3Key] = false;

          if (result.status === 'fulfilled' && normalizeText(result.value?.finalUrl)) {
            successMap[s3Key] = normalizeText(result.value.finalUrl);
            return;
          }

          errorMap[s3Key] = true;
        });
      }

      if (cancelled || requestId !== coverRequestIdRef.current) {
        return;
      }

      setCoverUrlByKey((current) => ({
        ...current,
        ...successMap
      }));
      setCoverErrorByKey((current) => {
        const next = {
          ...current,
          ...errorMap
        };

        Object.keys(successMap).forEach((s3Key) => {
          delete next[s3Key];
        });

        return next;
      });
      setCoverLoadingByKey((current) => ({
        ...current,
        ...loadingMap
      }));
    };

    resolveCoverUrls();

    return () => {
      cancelled = true;
    };
  }, [pendingCoverKeys, isOnline]);

  const refreshData = async () => {
    setRefreshing(true);
    setCoverUrlByKey({});
    setCoverErrorByKey({});
    setCoverLoadingByKey({});

    try {
      await loadBootstrap();
      await loadItems({
        codigoTipoMultimedia: normalizeTipoFilter(filters.codigoTipoMultimedia),
        buscar: normalizeText(filters.buscar)
      });
    } finally {
      setRefreshing(false);
    }
  };

  const resolvePlayableUrl = async (item) => {
    const directUrl = normalizeText(item.urlArchivo);
    if (isHttpUrl(directUrl)) {
      return directUrl;
    }

    const fileNameAsUrl = normalizeText(item.nombreArchivo);
    if (isHttpUrl(fileNameAsUrl)) {
      return fileNameAsUrl;
    }

    const s3KeyArchivo = normalizeS3Key(item.s3KeyArchivo);
    if (s3KeyArchivo) {
      const response = await multimediaService.resolveFileUrl({
        s3Key: s3KeyArchivo,
        nombreTabla: ARCHIVO_TABLE
      });

      const resolved = normalizeText(response?.url || response?.URL);
      if (resolved) {
        return resolved;
      }
    }

    return '';
  };

  const handleOpenMultimedia = async (item) => {
    const cardKey = buildCardKey(item);
    const metadata = inferMultimediaKind(item);
    setOpeningItemKey(cardKey);

    try {
      const resolvedUrl = await resolvePlayableUrl(item);

      if (!resolvedUrl) {
        if (!isOnline) {
          messageApi.warning(
            'Este archivo requiere internet para abrirse. La metadata se mantiene disponible offline.'
          );
        } else {
          messageApi.warning('No se pudo resolver el archivo multimedia.');
        }
        return;
      }

      const openInNewTab = () => {
        const target = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
        if (!target) {
          messageApi.warning('El navegador bloqueó la apertura del archivo.');
        }
      };

      if (metadata.kind === 'video' || metadata.kind === 'pdf' || metadata.kind === 'image') {
        setViewerState({
          open: true,
          url: resolvedUrl,
          kind: metadata.kind,
          title: normalizeText(item.nombreMultimedia) || normalizeText(item.nombreArchivo)
        });
        return;
      }

      openInNewTab();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setOpeningItemKey('');
    }
  };

  const renderViewer = () => {
    if (!viewerState.open || !viewerState.url) {
      return null;
    }

    if (viewerState.kind === 'video') {
      return (
        <video className="multimedia-viewer-video" src={viewerState.url} controls autoPlay>
          Tu navegador no soporta reproducción de video.
        </video>
      );
    }

    if (viewerState.kind === 'pdf') {
      return (
        <iframe
          title={viewerState.title || 'Documento PDF'}
          src={viewerState.url}
          className="multimedia-viewer-frame"
        />
      );
    }

    if (viewerState.kind === 'image') {
      return (
        <img
          src={viewerState.url}
          alt={viewerState.title || 'Vista multimedia'}
          className="multimedia-viewer-image"
        />
      );
    }

    return (
      <div className="multimedia-viewer-fallback">
        <Typography.Text>No se pudo previsualizar este archivo.</Typography.Text>
      </div>
    );
  };

  const viewerIsFullscreen =
    viewerState.kind === 'video' || viewerState.kind === 'pdf';

  return (
    <div className="page-wrap multimedia-page">
      {contextHolder}

      <div className="multimedia-header">
        <Typography.Title level={4}>Multimedia</Typography.Title>
        <button
          type="button"
          className="multimedia-refresh-btn"
          onClick={refreshData}
          disabled={refreshing || loadingBootstrap}
        >
          <ReloadOutlined spin={refreshing} />
          Actualizar
        </button>
      </div>

      <AppCard className="multimedia-filters-card" loading={loadingBootstrap}>
        <div className="multimedia-filters-grid">
          <div className="multimedia-filter-item">
            <Typography.Text className="multimedia-filter-label">
              Tipo de Archivo
            </Typography.Text>
            <AppSelect
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar..."
              value={filters.codigoTipoMultimedia}
              options={typeOptions}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  codigoTipoMultimedia: normalizeTipoFilter(value)
                }))
              }
            />
          </div>

          <div className="multimedia-filter-item">
            <Typography.Text className="multimedia-filter-label">
              Buscar
            </Typography.Text>
            <AppInput
              placeholder="Nombre, descripción o archivo..."
              prefix={<SearchOutlined />}
              value={filters.buscar}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  buscar: event.target.value || ''
                }))
              }
            />
          </div>
        </div>
      </AppCard>

      {offlineModuleMessage ? (
        <AppCard className="multimedia-offline-note">
          <Typography.Text>{offlineModuleMessage}</Typography.Text>
        </AppCard>
      ) : null}

      <AppCard className="multimedia-grid-card">
        {loadingItems ? (
          <div className="multimedia-loading">
            <Spin size="large" />
          </div>
        ) : items.length === 0 ? (
          <Empty description="Sin resultados" />
        ) : (
          <div className="multimedia-grid">
            {items.map((item) => {
              const cardKey = buildCardKey(item);
              const metadata = inferMultimediaKind(item);
              const portadaKey = normalizeS3Key(item.s3KeyPortada);
              const portadaUrl = portadaKey ? normalizeText(coverUrlByKey[portadaKey]) : '';
              const hasCoverError = Boolean(portadaKey && coverErrorByKey[portadaKey]);
              const hasCoverLoading = Boolean(portadaKey && coverLoadingByKey[portadaKey]);
              const canLoadCover = Boolean(portadaUrl && !hasCoverError);
              const fileName = normalizeText(item.nombreArchivo) || 'Sin nombre de archivo';

              return (
                <article key={cardKey} className="multimedia-item-card">
                  <div className="multimedia-cover-wrap">
                    {canLoadCover ? (
                      <img
                        src={portadaUrl}
                        alt={normalizeText(item.nombreMultimedia) || 'Portada multimedia'}
                        className="multimedia-cover-image"
                        loading="lazy"
                        onError={() => {
                          if (!portadaKey) {
                            return;
                          }

                          setCoverErrorByKey((current) => ({
                            ...current,
                            [portadaKey]: true
                          }));
                        }}
                      />
                    ) : hasCoverLoading ? (
                      <div className="multimedia-cover-loading">
                        <Spin size="small" />
                        <span>Cargando portada...</span>
                      </div>
                    ) : (
                      <div className="multimedia-cover-placeholder">
                        <PictureOutlined />
                        <span>Sin portada</span>
                      </div>
                    )}
                    <div className={`multimedia-kind-chip is-${metadata.kind}`}>
                      {getKindIcon(metadata.kind)}
                      <span>{metadata.extension ? metadata.extension.toUpperCase() : 'FILE'}</span>
                    </div>
                  </div>

                  <div className="multimedia-item-content">
                    <Typography.Title level={5} className="multimedia-item-title">
                      {normalizeText(item.nombreMultimedia) || 'Sin título'}
                    </Typography.Title>

                    <Typography.Paragraph
                      className="multimedia-item-description"
                      ellipsis={{ rows: 3, expandable: false }}
                    >
                      {normalizeText(item.descripcion) || 'Sin descripción.'}
                    </Typography.Paragraph>

                    <div className="multimedia-item-meta">
                      <span className="multimedia-item-meta-label">Archivo:</span>
                      <span className="multimedia-item-meta-value">{fileName}</span>
                    </div>
                    <div className="multimedia-item-meta">
                      <span className="multimedia-item-meta-label">Tipo:</span>
                      <span className="multimedia-item-meta-value">
                        {normalizeText(item.tipoMultimedia) || 'Sin tipo'}
                      </span>
                    </div>

                    <AppButton
                      variant="outline"
                      className="multimedia-open-btn"
                      icon={<EyeOutlined />}
                      loading={openingItemKey === cardKey}
                      onClick={() => handleOpenMultimedia(item)}
                    >
                      {getKindLabel(metadata.kind)}
                    </AppButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AppCard>

      <AppModal
        open={viewerState.open}
        title={viewerState.title || 'Vista multimedia'}
        centered={!viewerIsFullscreen}
        wrapClassName={`multimedia-viewer-wrap${viewerIsFullscreen ? ' is-fullscreen' : ''}`}
        onCancel={() =>
          setViewerState({
            open: false,
            url: '',
            kind: 'other',
            title: ''
          })
        }
        width={viewerIsFullscreen ? '100vw' : viewerState.kind === 'video' ? 940 : 900}
        style={viewerIsFullscreen ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
        bodyStyle={
          viewerIsFullscreen
            ? {
                padding: '10px 12px',
                height: 'calc(100vh - 126px)'
              }
            : undefined
        }
        footer={
          <div className="multimedia-viewer-footer">
            <AppButton
              variant="outline"
              onClick={() => {
                if (!viewerState.url) {
                  return;
                }

                const target = window.open(viewerState.url, '_blank', 'noopener,noreferrer');
                if (!target) {
                  messageApi.warning('El navegador bloqueó la apertura externa.');
                }
              }}
            >
              Abrir en nueva ventana
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() =>
                setViewerState({
                  open: false,
                  url: '',
                  kind: 'other',
                  title: ''
                })
              }
            >
              Cerrar
            </AppButton>
          </div>
        }
      >
        {renderViewer()}
      </AppModal>
    </div>
  );
}

