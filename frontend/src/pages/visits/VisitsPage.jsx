import { Alert, Col, Form, Row, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppBadge, AppButton, AppCard, AppInput, AppSelect, AppTable } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getCachedVisits, setCachedVisits } from '../../offline/cache';
import { enqueueCreateVisitMutation, getPendingMutationsCount } from '../../offline/queue';
import { syncPendingVisits } from '../../offline/syncManager';
import { visitService } from '../../services/visitService';
import { formatApiError } from '../../utils/formatApiError';

const statusOptions = [
  { label: 'Pendiente', value: 'pending' },
  { label: 'Completada', value: 'completed' },
  { label: 'Cancelada', value: 'cancelled' }
];

export function VisitsPage() {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [visits, setVisits] = useState([]);
  const [pendingMutations, setPendingMutations] = useState(0);
  const wasOnlineRef = useRef(isOnline);

  const tableData = useMemo(
    () =>
      visits.map((visit) => ({
        ...visit,
        key: visit.id || visit.clientTempId || `${visit.doctorName}-${visit.visitDate}`
      })),
    [visits]
  );

  const columns = [
    {
      title: 'Doctor',
      dataIndex: 'doctorName',
      key: 'doctorName'
    },
    {
      title: 'Lugar',
      dataIndex: 'location',
      key: 'location'
    },
    {
      title: 'Fecha',
      dataIndex: 'visitDate',
      key: 'visitDate',
      render: (value) => new Date(value).toLocaleString()
    },
    {
      title: 'Estado',
      dataIndex: 'status',
      key: 'status',
      render: (value) => {
        if (value === 'pending_sync') {
          return <AppBadge status="warning" label="Pendiente sync" />;
        }

        if (value === 'completed') {
          return <AppBadge status="processing" label="Completada" />;
        }

        if (value === 'in_progress') {
          return <AppBadge status="warning" label="En proceso" />;
        }

        if (value === 'cancelled') {
          return <AppBadge status="error" label="Cancelada" />;
        }

        return <AppBadge status="success" label="Pendiente" />;
      }
    }
  ];

  const refreshPendingCounter = async () => {
    const count = await getPendingMutationsCount();
    setPendingMutations(count);
  };

  const hydrateVisits = async () => {
    setIsLoading(true);

    try {
      if (isOnline) {
        const response = await visitService.list();
        setVisits(response.visits);
        await setCachedVisits(user?.id, response.visits);
      } else {
        const cached = await getCachedVisits(user?.id);
        setVisits(cached);
      }

      await refreshPendingCounter();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    hydrateVisits();
  }, [isOnline, user?.id]);

  const handleCreateVisit = async (values) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...values,
      visitDate: new Date(values.visitDate).toISOString()
    };

    try {
      if (isOnline) {
        const response = await visitService.create(payload);
        const updated = [response.visit, ...visits];
        setVisits(updated);
        await setCachedVisits(user?.id, updated);
        messageApi.success('Visita registrada en línea.');
      } else {
        const tempVisit = {
          ...payload,
          clientTempId: `tmp_${Date.now()}`,
          status: 'pending_sync'
        };

        await enqueueCreateVisitMutation(tempVisit);
        const updated = [tempVisit, ...visits];
        setVisits(updated);
        await setCachedVisits(user?.id, updated);
        messageApi.warning('Sin conexión: visita guardada para sincronización.');
      }

      form.resetFields();
      await refreshPendingCounter();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) {
      return;
    }

    setIsSyncing(true);

    try {
      const syncResult = await syncPendingVisits();

      if (syncResult.failed > 0) {
        messageApi.warning(`Sincronización parcial: ${syncResult.synced} exitosas, ${syncResult.failed} fallidas.`);
      } else {
        messageApi.success(`Sincronización completa: ${syncResult.synced} visitas.`);
      }

      await hydrateVisits();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOnline && !wasOnlineRef.current && pendingMutations > 0 && !isSyncing) {
      handleSync();
    }

    wasOnlineRef.current = isOnline;
  }, [isOnline, pendingMutations, isSyncing]);

  return (
    <div className="page-wrap">
      {contextHolder}

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Registro de visitas
      </Typography.Title>

      {!isOnline ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Modo offline activo"
          description="Los registros nuevos se enviarán automáticamente cuando recuperes conexión."
        />
      ) : null}

      <AppCard title="Nueva visita" style={{ marginBottom: 12 }}>
        <Form form={form} layout="vertical" onFinish={handleCreateVisit} initialValues={{ status: 'pending' }}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="doctorName" label="Nombre del doctor" rules={[{ required: true, message: 'Este campo es obligatorio.' }]}>
                <AppInput placeholder="Dr. Juan Pérez" />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="location" label="Lugar" rules={[{ required: true, message: 'Este campo es obligatorio.' }]}>
                <AppInput placeholder="Hospital Central" />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="visitDate" label="Fecha y hora" rules={[{ required: true, message: 'Selecciona fecha y hora.' }]}>
                <AppInput type="datetime-local" />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="status" label="Estado">
                <AppSelect options={statusOptions} />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item name="notes" label="Notas">
                <AppInput type="textarea" placeholder="Detalle de la visita..." />
              </Form.Item>
            </Col>
          </Row>

          <AppButton htmlType="submit" loading={isSubmitting} disabled={isSubmitting} fullWidth>
            Guardar visita
          </AppButton>
        </Form>
      </AppCard>

      <AppCard
        title="Visitas registradas"
        extra={
          <AppButton
            variant="secondary"
            size="sm"
            onClick={handleSync}
            loading={isSyncing}
            disabled={!isOnline || pendingMutations === 0}
          >
            Sincronizar ({pendingMutations})
          </AppButton>
        }
      >
        <AppTable
          columns={columns}
          dataSource={tableData}
          loading={isLoading}
          pagination={{ pageSize: 50, showSizeChanger: false }}
        />
      </AppCard>
    </div>
  );
}

