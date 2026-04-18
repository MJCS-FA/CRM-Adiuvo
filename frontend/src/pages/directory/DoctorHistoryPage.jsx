import { ArrowLeftOutlined, EyeOutlined } from '@ant-design/icons';
import { Alert, Empty, Pagination, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppButton, AppCard } from '../../components/ui';
import { directoryService } from '../../services/directoryService';
import { formatApiError } from '../../utils/formatApiError';
import { sanitizeDisplayText } from '../../utils/sanitizeDisplayText';
import { resolveVisitStatusTheme } from '../../utils/visitStatus';

const PAGE_SIZE = 50;

function formatDate(value) {
  const text = String(value || '').trim();

  if (!text) {
    return 'Sin fecha';
  }

  const direct = new Date(text);

  if (Number.isNaN(direct.getTime())) {
    return text.slice(0, 10);
  }

  return direct.toISOString().slice(0, 10);
}

function formatTime(value) {
  const text = String(value || '').trim();

  if (!text) {
    return 'Sin hora';
  }

  return text.length >= 5 ? text.slice(0, 5) : text;
}

export function DoctorHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { codigoMedico } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [page, setPage] = useState(1);
  const [doctor, setDoctor] = useState(null);
  const [visits, setVisits] = useState([]);

  const doctorNameFromState = String(location.state?.doctorName || '').trim();

  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const response = await directoryService.getDoctorHistory(codigoMedico);

        if (!mounted) {
          return;
        }

        setDoctor(response.doctor || null);
        setVisits(response.visits || []);
      } catch (error) {
        if (!mounted) {
          return;
        }

        const text = formatApiError(error);
        setErrorMessage(text);
        messageApi.error(text);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      mounted = false;
    };
  }, [codigoMedico]);

  useEffect(() => {
    setPage(1);
  }, [visits]);

  const paginatedVisits = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visits.slice(start, start + PAGE_SIZE);
  }, [visits, page]);

  const doctorName = doctor?.nombreMedico || doctorNameFromState || `Médico ${codigoMedico}`;

  return (
    <div className="page-wrap directory-doctor-history-page">
      {contextHolder}

      <div className="directory-doctor-history-header">
        <AppButton
          variant="ghost"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="directory-doctor-history-back-btn"
          aria-label="Regresar"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Historial de visitas
        </Typography.Title>
      </div>

      <AppCard>
        <Typography.Text className="directory-item-title">{doctorName}</Typography.Text>
      </AppCard>

      {errorMessage ? <Alert type="warning" showIcon message={errorMessage} /> : null}

      <AppCard loading={loading} title="Visitas realizadas">
        {!loading && !visits.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No hay visitas para este médico."
            />
        ) : (
          <div className="directory-history-list">
            {paginatedVisits.map((visit) => {
              const codigoEstado = Number(visit.codigoEstado || 0);
              const statusTheme = resolveVisitStatusTheme(codigoEstado, visit.estado);
              const estadoLabel = String(visit.estado || '').trim() || statusTheme.label;
              const comentario = sanitizeDisplayText(visit.comentario, 'Sin comentario');

              return (
                <div
                  key={visit.codigoVisitaMedica}
                  className="directory-history-item"
                >
                  <div className="directory-history-main">
                    <Typography.Text className="directory-item-line directory-item-line-strong">
                      Visita #{visit.codigoVisitaMedica}
                    </Typography.Text>
                    <Typography.Text className="directory-item-line">
                      Fecha: {formatDate(visit.fechaVisita)}
                    </Typography.Text>
                    <Typography.Text className="directory-item-line">
                      Hora: {formatTime(visit.horaVisita)}
                    </Typography.Text>
                    <Typography.Text className="directory-item-line directory-item-muted">
                      {comentario}
                    </Typography.Text>
                  </div>

                  <div className="directory-history-side">
                    <Tag color={statusTheme.tagColor}>{estadoLabel}</Tag>

                    {codigoEstado === 5 ? (
                      <AppButton
                        variant="outline"
                        size="sm"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/visita-detalle/${visit.codigoVisitaMedica}`)}
                      >
                        Ver detalle
                      </AppButton>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && visits.length ? (
          <Pagination
            current={page}
            total={visits.length}
            pageSize={PAGE_SIZE}
            showSizeChanger={false}
            onChange={(nextPage) => setPage(nextPage)}
          />
        ) : null}
      </AppCard>
    </div>
  );
}
