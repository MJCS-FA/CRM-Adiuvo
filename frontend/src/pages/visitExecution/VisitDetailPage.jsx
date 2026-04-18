import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  HeartFilled
} from '@ant-design/icons';
import { Empty, Rate, Spin, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppCard, AppButton } from '../../components/ui';
import { visitExecutionService } from '../../services/visitExecutionService';
import { formatApiError } from '../../utils/formatApiError';
import { sanitizeDisplayText } from '../../utils/sanitizeDisplayText';

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

function ProductList({ items, emptyText, icon, iconClassName }) {
  if (!items.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
  }

  return (
    <div className="visit-detail-products-list">
      {items.map((product) => (
        <div key={product.codigoProducto} className="visit-detail-product-row">
          <span className={`visit-detail-product-icon ${iconClassName}`} aria-hidden="true">
            {icon}
          </span>
          <Typography.Text className="visit-detail-product-name">
            {product.nombreProducto}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

export function VisitDetailPage() {
  const navigate = useNavigate();
  const { visitId } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState({
    visit: null,
    productosInteres: [],
    productosAbordados: []
  });

  useEffect(() => {
    let mounted = true;

    const loadDetail = async () => {
      setLoading(true);

      try {
        const response = await visitExecutionService.getVisitDetail(visitId);

        if (!mounted) {
          return;
        }

        setDetail({
          visit: response.visit || null,
          productosInteres: response.productosInteres || [],
          productosAbordados: response.productosAbordados || []
        });
      } catch (error) {
        if (mounted) {
          messageApi.error(formatApiError(error));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDetail();

    return () => {
      mounted = false;
    };
  }, [visitId]);

  const doctorName = useMemo(() => {
    const visit = detail.visit || {};
    return visit.nombreMedico || visit.nombreSucursal || 'No disponible';
  }, [detail.visit]);
  const visitComment = useMemo(
    () => sanitizeDisplayText(detail.visit?.comentario, 'Sin comentario'),
    [detail.visit?.comentario]
  );

  return (
    <div className="page-wrap visit-detail-page">
      {contextHolder}

      <div className="visit-detail-header">
        <AppButton
          variant="ghost"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="visit-detail-back-btn"
          aria-label="Regresar"
        />
      </div>

      {loading ? (
        <AppCard>
          <div className="visit-detail-loading">
            <Spin />
          </div>
        </AppCard>
      ) : (
        <>
          <AppCard>
            <div className="visit-detail-general-grid">
              <div className="visit-detail-general-item">
                <Typography.Text className="visit-detail-label">Médico</Typography.Text>
                <Typography.Text className="visit-detail-value">{doctorName}</Typography.Text>
              </div>

              <div className="visit-detail-general-item">
                <Typography.Text className="visit-detail-label">Fecha de visita</Typography.Text>
                <Typography.Text className="visit-detail-value">
                  {formatVisitDate(detail.visit?.fechaVisita)}
                </Typography.Text>
              </div>

              <div className="visit-detail-general-item">
                <Typography.Text className="visit-detail-label">Calificación</Typography.Text>
                <Rate disabled value={Number(detail.visit?.clasificacionVisita || 0)} />
              </div>
            </div>
          </AppCard>

          <AppCard title="Comentario">
            <Typography.Paragraph className="visit-detail-comment" style={{ margin: 0 }}>
              {visitComment}
            </Typography.Paragraph>
          </AppCard>

          <AppCard title="Productos de interés">
            <ProductList
              items={detail.productosInteres}
              emptyText="Sin productos de interés"
              icon={<HeartFilled />}
              iconClassName="is-interest"
            />
          </AppCard>

          <AppCard title="Productos abordados">
            <ProductList
              items={detail.productosAbordados}
              emptyText="Sin productos abordados"
              icon={<CheckCircleFilled />}
              iconClassName="is-addressed"
            />
          </AppCard>
        </>
      )}
    </div>
  );
}
