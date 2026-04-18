import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Col, Row, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppButton, AppCard, AppInput } from '../../components/ui';
import { directoryService } from '../../services/directoryService';
import { formatApiError } from '../../utils/formatApiError';

function asDisplayValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  return String(value);
}

function ReadOnlyField({ label, value, multiline = false }) {
  return (
    <div>
      <Typography.Text className="directory-filter-label">{label}</Typography.Text>
      <AppInput
        type={multiline ? 'textarea' : 'text'}
        disabled
        value={asDisplayValue(value)}
      />
    </div>
  );
}

function ResponsableBlock({ title, responsable }) {
  return (
    <div className="directory-branch-responsable-block">
      <Typography.Text className="directory-item-line directory-item-line-strong">
        {title}
      </Typography.Text>
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <ReadOnlyField label="Nombre" value={responsable?.nombre} />
        </Col>
        <Col xs={24} md={12}>
          <ReadOnlyField label="Correo" value={responsable?.correo} />
        </Col>
        <Col xs={24}>
          <ReadOnlyField label="Teléfono" value={responsable?.telefono} />
        </Col>
      </Row>
    </div>
  );
}

export function BranchFichaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { codigoSucursal } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [data, setData] = useState(null);

  const filterCountry = Number(location.state?.codigoPais);
  const sucursalNombreState = String(location.state?.sucursalNombre || '').trim();

  const loadFicha = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const params = {};

      if (Number.isFinite(filterCountry) && filterCountry > 0) {
        params.codigoPais = filterCountry;
      }

      const response = await directoryService.getBranchFicha(codigoSucursal, params);
      setData(response);
    } catch (error) {
      const messageText = formatApiError(error);
      setErrorMessage(messageText);
      messageApi.error(messageText);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFicha();
  }, [codigoSucursal, filterCountry]);

  const sucursal = data?.sucursal || {};
  const responsables = data?.responsables || {};

  return (
    <div className="page-wrap directory-branch-ficha-page">
      {contextHolder}

      <div className="directory-branch-ficha-header">
        <AppButton
          variant="ghost"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="directory-branch-ficha-back-btn"
          aria-label="Regresar"
        />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Ficha de Sucursal
        </Typography.Title>
      </div>

      {errorMessage ? (
        <Alert type="warning" showIcon message={errorMessage} />
      ) : null}

      <AppCard loading={loading} title="Información General">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <ReadOnlyField label="Empresa" value={sucursal.empresa} />
          </Col>
          <Col xs={24} md={12}>
            <ReadOnlyField
              label="Sucursal"
              value={sucursal.nombreSucursal || sucursalNombreState || null}
            />
          </Col>
          <Col xs={24} md={12}>
            <ReadOnlyField label="Correo Sucursal" value={sucursal.correoSucursal} />
          </Col>
          <Col xs={24} md={12}>
            <ReadOnlyField label="Teléfono" value={sucursal.telefono} />
          </Col>
          <Col span={24}>
            <ReadOnlyField label="Dirección" value={sucursal.direccion} multiline />
          </Col>
        </Row>
      </AppCard>

      <AppCard title="Responsables">
        <ResponsableBlock
          title="Gerente de Farmacia"
          responsable={responsables.gerenteFarmacia || responsables.gf}
        />
        <ResponsableBlock
          title="Gerente de Área"
          responsable={responsables.gerenteArea || responsables.ga}
        />
        <ResponsableBlock
          title="Gerente Operativo"
          responsable={responsables.gerenteOperativo || responsables.go}
        />
      </AppCard>
    </div>
  );
}
