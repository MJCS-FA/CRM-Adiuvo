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
import { Alert, Empty, Spin, Typography, message } from 'antd';
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
    <div className="media-page">
      {contextHolder}

      <style>{`
        .media-page { display: flex; flex-direction: column; gap: 20px; }

        .media-header { display: flex; align-items: center; justify-content: space-between; }
        .media-header-title { font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; }

        /* ── Filters ── */
        .media-filters-card {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          display: flex; gap: 16px; align-items: flex-end;
          box-shadow: var(--shadow-xs);
        }
        .media-filter-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .media-filter-label { font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }

        .media-refresh-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; border-radius: var(--radius-md);
          border: 1.5px solid var(--border-default); background: var(--bg-card);
          font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer;
          transition: 0.2s;
        }
        .media-refresh-btn:hover { border-color: var(--adiuvo-red); color: var(--adiuvo-red); }

        /* ── Grid ── */
        .media-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .media-card {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          overflow: hidden;
          display: flex; flex-direction: column;
          transition: all var(--duration-normal) var(--ease-out);
          box-shadow: var(--shadow-xs);
        }
        .media-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--adiuvo-red-light); }

        .media-thumb {
          position: relative; width: 100%; aspect-ratio: 16/10;
          background: var(--bg-subtle); overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }
        .media-thumb-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease; }
        .media-card:hover .media-thumb-img { transform: scale(1.05); }

        .media-kind-badge {
          position: absolute; top: 12px; left: 12px;
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: var(--radius-full);
          font-size: 10px; font-weight: 800; text-transform: uppercase;
          backdrop-filter: blur(8px);
          color: #fff;
        }
        .media-kind-badge.is-video { background: rgba(232, 60, 56, 0.85); }
        .media-kind-badge.is-pdf { background: rgba(59, 130, 246, 0.85); }
        .media-kind-badge.is-excel { background: rgba(16, 185, 129, 0.85); }
        .media-kind-badge.is-image { background: rgba(139, 92, 246, 0.85); }
        .media-kind-badge.is-other { background: rgba(107, 114, 128, 0.85); }

        .media-card-body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .media-card-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; line-height: 1.3; }
        .media-card-desc { font-size: 12px; color: var(--text-tertiary); line-height: 1.5; margin: 0; flex: 1; }

        .media-card-footer {
          padding: 12px 16px; border-top: 1px solid var(--border-light);
          display: flex; align-items: center; justify-content: space-between;
          background: var(--bg-subtle);
        }
        .media-file-name { font-size: 11px; font-weight: 600; color: var(--text-tertiary); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .media-action-btn {
          width: 34px; height: 34px; border-radius: 50%;
          border: none; background: var(--adiuvo-red); color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: 0.2s; box-shadow: 0 2px 6px rgba(232,60,56,0.3);
        }
        .media-action-btn:hover { background: var(--adiuvo-red-deep); transform: scale(1.1); }

        .media-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; padding: 80px 24px;
          background: var(--bg-card); border-radius: var(--radius-lg);
          border: 1px solid var(--border-default); color: var(--text-tertiary);
        }
        .media-empty-icon { font-size: 48px; opacity: 0.2; }

        .media-loading { display: flex; align-items: center; justify-content: center; padding: 100px; }

        /* Viewer Fullscreen */
        .media-viewer-wrap.is-fullscreen .ant-modal-content { border-radius: 0; background: #000; }
        .media-viewer-wrap.is-fullscreen .ant-modal-header { background: #111; border-bottom: 1px solid #222; }
        .media-viewer-wrap.is-fullscreen .ant-modal-title { color: #fff; }
        .media-viewer-wrap.is-fullscreen .ant-modal-close { color: #fff; }

        .media-viewer-video { width: 100%; height: 100%; max-height: calc(100vh - 180px); background: #000; }
        .media-viewer-frame { width: 100%; height: 100%; border: none; background: #fff; border-radius: 4px; }
        .media-viewer-image { max-width: 100%; max-height: calc(100vh - 200px); object-fit: contain; }
      `}</style>

      {/* ── Header ── */}
      <div className="media-header">
        <div className="media-header-title">Biblioteca Multimedia</div>
        <button
          className="media-refresh-btn"
          onClick={refreshData}
          disabled={refreshing || loadingBootstrap}
        >
          <ReloadOutlined spin={refreshing} />
          <span>Sincronizar</span>
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="media-filters-card">
        <div className="media-filter-group" style={{ flex: 1.5 }}>
          <span className="media-filter-label">Búsqueda</span>
          <AppInput
            placeholder="Buscar por nombre, descripción..."
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            value={filters.buscar}
            onChange={(e) => setFilters((c) => ({ ...c, buscar: e.target.value || '' }))}
          />
        </div>
        <div className="media-filter-group">
          <span className="media-filter-label">Tipo</span>
          <AppSelect
            allowClear showSearch optionFilterProp="label"
            placeholder="Todos los tipos"
            value={filters.codigoTipoMultimedia}
            options={typeOptions}
            onChange={(v) => setFilters((c) => ({ ...c, codigoTipoMultimedia: normalizeTipoFilter(v) }))}
          />
        </div>
      </div>

      {offlineModuleMessage && (
        <Alert
          type="info" showIcon
          message="Modo Offline"
          description={offlineModuleMessage}
          style={{ borderRadius: 'var(--radius-md)' }}
        />
      )}

      {/* ── Content ── */}
      {loadingItems ? (
        <div className="media-loading">
          <Spin size="large" />
        </div>
      ) : items.length === 0 ? (
        <div className="media-empty">
          <PictureOutlined className="media-empty-icon" />
          <span style={{ fontWeight: 600 }}>No se encontraron archivos multimedia</span>
          <span style={{ fontSize: 13 }}>Intenta con otros términos de búsqueda o filtros.</span>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((item) => {
            const cardKey = buildCardKey(item);
            const metadata = inferMultimediaKind(item);
            const portadaKey = normalizeS3Key(item.s3KeyPortada);
            const portadaUrl = portadaKey ? normalizeText(coverUrlByKey[portadaKey]) : '';
            const hasCoverLoading = Boolean(portadaKey && coverLoadingByKey[portadaKey]);

            return (
              <div key={cardKey} className="media-card">
                <div className="media-thumb">
                  {portadaUrl ? (
                    <img src={portadaUrl} alt="" className="media-thumb-img" />
                  ) : hasCoverLoading ? (
                    <Spin size="small" />
                  ) : (
                    <PictureOutlined style={{ fontSize: 40, opacity: 0.1 }} />
                  )}
                  <div className={`media-kind-badge is-${metadata.kind}`}>
                    {getKindIcon(metadata.kind)}
                    <span>{metadata.extension || 'FILE'}</span>
                  </div>
                </div>

                <div className="media-card-body">
                  <h3 className="media-card-title">{item.nombreMultimedia || 'Sin título'}</h3>
                  <p className="media-card-desc">
                    {item.descripcion || 'Sin descripción disponible para este recurso.'}
                  </p>
                </div>

                <div className="media-card-footer">
                  <span className="media-file-name">{item.nombreArchivo}</span>
                  <button
                    className="media-action-btn"
                    title={getKindLabel(metadata.kind)}
                    onClick={() => handleOpenMultimedia(item)}
                    disabled={openingItemKey === cardKey}
                  >
                    {openingItemKey === cardKey ? <Spin size="small" style={{ color: '#fff' }} /> : <EyeOutlined />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Viewer Modal ── */}
      <AppModal
        open={viewerState.open}
        title={viewerState.title || 'Vista multimedia'}
        centered={!viewerIsFullscreen}
        wrapClassName={`media-viewer-wrap${viewerIsFullscreen ? ' is-fullscreen' : ''}`}
        onCancel={() => setViewerState({ open: false, url: '', kind: 'other', title: '' })}
        width={viewerIsFullscreen ? '100vw' : 940}
        style={viewerIsFullscreen ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
        bodyStyle={viewerIsFullscreen ? { padding: '10px 12px', height: 'calc(100vh - 120px)' } : { textAlign: 'center' }}
        footer={[
          <AppButton key="ext" variant="outline" onClick={() => window.open(viewerState.url, '_blank')}>
            Abrir en pestaña nueva
          </AppButton>,
          <AppButton key="close" variant="primary" onClick={() => setViewerState({ open: false, url: '', kind: 'other', title: '' })}>
            Cerrar
          </AppButton>
        ]}
      >
        {renderViewer()}
      </AppModal>
    </div>
  );
}
