import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import {
  Alert,
  Calendar,
  Col,
  DatePicker,
  Empty,
  Form,
  Row,
  TimePicker,
  Typography,
  message
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppSelect } from '../../components/ui';
import { calendarService } from '../../services/calendarService';
import { formatApiError } from '../../utils/formatApiError';
import { resolveVisitStatusTheme } from '../../utils/visitStatus';

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatEventTime(value) {
  const asText = String(value || '').trim();
  if (!asText) {
    return '';
  }

  return asText.length >= 5 ? asText.slice(0, 5) : asText;
}

function isManualDateValid(value) {
  const text = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const parsed = new Date(`${text}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === text;
}

function isBranchVisit(visit) {
  const visitTypeCode = Number(visit?.codigoTipoVisita || 0);
  const doctorCode = Number(visit?.codigoMedico || 0);

  return visitTypeCode === 2 || doctorCode === 1;
}

function resolveVisitDisplayName(visit, branchLabelsById = new Map()) {
  if (isBranchVisit(visit)) {
    const internalCode = String(visit?.codigoInternoSucursal || '').trim();
    const branchName = String(visit?.nombreSucursal || '').trim();
    const branchCode = Number(visit?.codigoSucursal || 0);
    const branchOptionLabel =
      branchCode > 0 ? String(branchLabelsById.get(branchCode) || '').trim() : '';

    if (internalCode && branchName) {
      return `${internalCode} - ${branchName}`;
    }

    if (branchOptionLabel) {
      return branchOptionLabel;
    }

    if (branchName) {
      return branchName;
    }

    return branchCode > 0 ? `Sucursal ${branchCode}` : 'Sucursal';
  }

  const doctorName = String(visit?.nombreMedico || '').trim();

  return doctorName || 'Visita';
}

export function CalendarPage() {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const schedulerState = location.state || {};
  const isDirectorySchedulerMode = Boolean(
    schedulerState.openScheduler && schedulerState.compactScheduler
  );

  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);

  const [activeMonth, setActiveMonth] = useState(getCurrentMonthKey);
  const [selectedDay, setSelectedDay] = useState(null);
  const [visitadorContext, setVisitadorContext] = useState(null);

  const [visitTypes, setVisitTypes] = useState([]);
  const [visitChannels, setVisitChannels] = useState([]);
  const [assignedDoctors, setAssignedDoctors] = useState([]);
  const [assignedBranches, setAssignedBranches] = useState([]);
  const [monthVisits, setMonthVisits] = useState([]);

  const hasVisitador = Boolean(visitadorContext?.hasVisitador);

  const eventsByDate = useMemo(() => {
    const byDate = new Map();

    for (const visit of monthVisits) {
      const key = String(visit.fechaProgramada || '').slice(0, 10);

      if (!key) {
        continue;
      }

      if (!byDate.has(key)) {
        byDate.set(key, []);
      }

      byDate.get(key).push(visit);
    }

    return byDate;
  }, [monthVisits]);

  const selectedVisitTypeId = Form.useWatch('tipoVisitaId', form);
  const branchLabelsById = useMemo(() => {
    const map = new Map();

    for (const option of assignedBranches || []) {
      const code = Number(option?.value || 0);
      const label = String(option?.label || '').trim();

      if (code > 0 && label) {
        map.set(code, label);
      }
    }

    return map;
  }, [assignedBranches]);

  const isBranchVisitType = (value) => {
    const parsed = Number(value);

    if (parsed === 2) {
      return true;
    }

    const matched = visitTypes.find((item) => Number(item.value) === parsed);
    const label = String(matched?.label || '').toLowerCase();

    return label.includes('sucursal');
  };

  const isBranchVisit = isBranchVisitType(selectedVisitTypeId);
  const targetOptions = isBranchVisit ? assignedBranches : assignedDoctors;
  const showSchedulerPanel = isDirectorySchedulerMode || Boolean(selectedDay);

  const loadCatalogs = async () => {
    setLoadingCatalogs(true);

    try {
      const [
        visitadorResponse,
        typesResponse,
        channelsResponse,
        doctorsResponse,
        branchesResponse
      ] =
        await Promise.all([
          calendarService.getVisitador(),
          calendarService.getVisitTypes(),
          calendarService.getVisitChannels(),
          calendarService.getAssignedDoctors(),
          calendarService.getAssignedBranches()
        ]);

      setVisitadorContext(visitadorResponse);
      setVisitTypes(typesResponse.items || []);
      setVisitChannels(channelsResponse.items || []);
      setAssignedDoctors(doctorsResponse.items || []);
      setAssignedBranches(branchesResponse.items || []);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const loadMonthVisits = async (monthKey) => {
    setLoadingMonth(true);

    try {
      const response = await calendarService.getMonthVisits(monthKey);
      setMonthVisits(response.visits || []);

      if (response.hasVisitador !== undefined) {
        setVisitadorContext((current) => ({
          ...(current || {}),
          hasVisitador: response.hasVisitador,
          visitador: response.visitador || current?.visitador || null
        }));
      }
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setLoadingMonth(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  useEffect(() => {
    if (!activeMonth || isDirectorySchedulerMode) {
      return;
    }

    loadMonthVisits(activeMonth);
  }, [activeMonth, isDirectorySchedulerMode]);

  useEffect(() => {
    const scheduleState = location.state || {};

    if (!scheduleState.openScheduler) {
      return;
    }

    const today = dayjs();
    const formValues = {
      fechaProgramada: isDirectorySchedulerMode ? today.format('YYYY-MM-DD') : today
    };

    if (scheduleState.tipoVisitaId) {
      formValues.tipoVisitaId = Number(scheduleState.tipoVisitaId);
    }

    if (scheduleState.targetId) {
      formValues.targetId = Number(scheduleState.targetId);
    }

    setSelectedDay(today);
    setActiveMonth(today.format('YYYY-MM'));
    form.setFieldsValue(formValues);
  }, [location.state, form, isDirectorySchedulerMode]);

  const handleSelectDay = (value, selectionInfo) => {
    const selectionSource = String(selectionInfo?.source || 'date').toLowerCase();

    if (selectionSource !== 'date') {
      return;
    }

    setSelectedDay(value);
    setActiveMonth(value.format('YYYY-MM'));

    form.setFieldsValue({
      fechaProgramada: value
    });
  };

  const handleCreateVisit = async (values) => {
    if (savingVisit) {
      return;
    }

    setSavingVisit(true);

    try {
      const normalizedFechaProgramada =
        typeof values.fechaProgramada === 'string'
          ? String(values.fechaProgramada || '').trim()
          : values.fechaProgramada?.format('YYYY-MM-DD');

      if (!normalizedFechaProgramada || !isManualDateValid(normalizedFechaProgramada)) {
        throw new Error('La fecha programada es inválida. Usa formato YYYY-MM-DD.');
      }

      const payload = {
        tipoVisitaId: values.tipoVisitaId,
        canalVisitaId: values.canalVisitaId,
        targetId: values.targetId,
        medicoId: isBranchVisitType(values.tipoVisitaId) ? 1 : values.targetId,
        sucursalId: isBranchVisitType(values.tipoVisitaId) ? values.targetId : 0,
        fechaProgramada: normalizedFechaProgramada,
        horaProgramada: values.horaProgramada.format('HH:mm:ss'),
        comentarios: String(values.comentarios || '').trim()
      };

      await calendarService.createVisit(payload);
      messageApi.success('Visita guardada correctamente.');

      const monthKey = payload.fechaProgramada.slice(0, 7);
      setActiveMonth(monthKey);
      await loadMonthVisits(monthKey);

      if (isDirectorySchedulerMode) {
        navigate('/directorio');
        return;
      }

      setSelectedDay(null);
      form.resetFields();
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setSavingVisit(false);
    }
  };

  const dateCellRender = (value) => {
    const dayKey = value.format('YYYY-MM-DD');
    const items = eventsByDate.get(dayKey) || [];

    if (!items.length) {
      return null;
    }

    return (
      <div className="calendar-day-events">
        {items.slice(0, 3).map((event) => (
          <div className="calendar-day-event-item" key={event.codigoVisitaMedica}>
            <span
              className={`calendar-day-event-dot ${resolveVisitStatusTheme(
                event.codigoEstado,
                event.estado
              ).className}`}
            />
            <span className="calendar-day-event-text">
              {formatEventTime(event.horaProgramada)} {resolveVisitDisplayName(event, branchLabelsById)}
            </span>
          </div>
        ))}

        {items.length > 3 ? (
          <div className="calendar-day-event-more">+{items.length - 3} más</div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page-wrap calendar-page">
      {contextHolder}

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Calendario de Visitas
      </Typography.Title>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Visitador actual:{' '}
        {visitadorContext?.visitador?.nombreCompleto || 'Sin información de visitador'}
      </Typography.Paragraph>

      {!loadingCatalogs && !hasVisitador ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="No se encontró un visitador para esta sesión"
          description="No es posible programar visitas hasta que exista relación en tblVisitador."
        />
      ) : null}

      <div
        className={`calendar-layout ${
          !isDirectorySchedulerMode && showSchedulerPanel ? 'with-side-panel' : ''
        }`}
      >
        {!isDirectorySchedulerMode ? (
          <AppCard
            className="calendar-main-card"
            loading={loadingCatalogs}
            title={
              <div className="calendar-main-title">
                <CalendarOutlined />
                <span>Agenda mensual</span>
              </div>
            }
          >
            <Calendar
              fullscreen
              onSelect={handleSelectDay}
              onPanelChange={(value) => {
                setActiveMonth(value.format('YYYY-MM'));
                setSelectedDay(null);
              }}
              dateCellRender={dateCellRender}
              headerRender={({ value, onChange }) => {
                const monthLabel = new Intl.DateTimeFormat('es-ES', {
                  month: 'long',
                  year: 'numeric'
                }).format(new Date(value.year(), value.month(), 1));

                return (
                  <div className="calendar-header-custom">
                    <div className="calendar-header-nav">
                      <AppButton
                        size="sm"
                        variant="secondary"
                        icon={<LeftOutlined />}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedDay(null);
                          const next = value.clone().subtract(1, 'month');
                          onChange(next);
                          setActiveMonth(next.format('YYYY-MM'));
                        }}
                      />
                      <AppButton
                        size="sm"
                        variant="secondary"
                        icon={<RightOutlined />}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedDay(null);
                          const next = value.clone().add(1, 'month');
                          onChange(next);
                          setActiveMonth(next.format('YYYY-MM'));
                        }}
                      />
                    </div>

                    <Typography.Title level={4} className="calendar-header-label">
                      {monthLabel}
                    </Typography.Title>

                    <AppButton
                      size="sm"
                      variant="outline"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedDay(null);
                        const now = value.clone().set('date', 1);
                        const realNow = new Date();
                        const today = now
                          .set('year', realNow.getFullYear())
                          .set('month', realNow.getMonth());
                        onChange(today);
                        setActiveMonth(today.format('YYYY-MM'));
                      }}
                    >
                      Hoy
                    </AppButton>
                  </div>
                );
              }}
            />

            {loadingMonth ? (
              <Typography.Text type="secondary" className="calendar-loading-text">
                Cargando visitas del mes...
              </Typography.Text>
            ) : null}
          </AppCard>
        ) : null}

        {showSchedulerPanel ? (
          <AppCard
            className="calendar-side-panel"
            title={`Nueva Visita${
              selectedDay ? ` - ${selectedDay.format('YYYY-MM-DD')}` : ''
            }`}
            loading={loadingCatalogs}
          >
            {!hasVisitador ? (
              <Empty description="No puedes crear visitas sin visitador relacionado." />
            ) : (
              <Form layout="vertical" form={form} onFinish={handleCreateVisit}>
                <Row gutter={10}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Tipo Visita"
                      name="tipoVisitaId"
                      rules={[{ required: true, message: 'Selecciona el tipo de visita.' }]}
                    >
                      <AppSelect
                        showSearch
                        optionFilterProp="label"
                        placeholder="Seleccionar"
                        options={visitTypes}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Canal Visita"
                      name="canalVisitaId"
                      rules={[{ required: true, message: 'Selecciona el canal.' }]}
                    >
                      <AppSelect
                        showSearch
                        optionFilterProp="label"
                        placeholder="Seleccionar"
                        options={visitChannels}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Fecha Programada"
                      name="fechaProgramada"
                      rules={[
                        { required: true, message: 'Ingresa la fecha.' },
                        {
                          validator: async (_, value) => {
                            if (
                              !value ||
                              (!isDirectorySchedulerMode && value?.format) ||
                              isManualDateValid(value)
                            ) {
                              return;
                            }

                            throw new Error('Usa formato YYYY-MM-DD.');
                          }
                        }
                      ]}
                    >
                      {isDirectorySchedulerMode ? (
                        <AppInput
                          className="calendar-form-control"
                          placeholder="YYYY-MM-DD"
                          maxLength={10}
                        />
                      ) : (
                        <DatePicker
                          className="calendar-form-control"
                          format="YYYY-MM-DD"
                          onChange={(value) => setSelectedDay(value || selectedDay)}
                        />
                      )}
                    </Form.Item>
                  </Col>

                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Hora Programada"
                      name="horaProgramada"
                      rules={[{ required: true, message: 'Selecciona la hora.' }]}
                    >
                      <TimePicker className="calendar-form-control" format="HH:mm:ss" />
                    </Form.Item>
                  </Col>

                  <Col xs={24}>
                    <Form.Item
                      label={isBranchVisit ? 'Sucursal' : 'Médico'}
                      name="targetId"
                      rules={[
                        {
                          required: true,
                          message: isBranchVisit
                            ? 'Selecciona la sucursal.'
                            : 'Selecciona el médico.'
                        }
                      ]}
                    >
                      <AppSelect
                        showSearch
                        optionFilterProp="label"
                        placeholder="Seleccionar"
                        options={targetOptions}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24}>
                    <Form.Item label="Comentarios" name="comentarios">
                      <AppInput type="textarea" placeholder="Escriba..." />
                    </Form.Item>
                  </Col>
                </Row>

                <div className="calendar-form-actions">
                  <AppButton
                    type="button"
                    variant="danger"
                    onClick={() => {
                      if (isDirectorySchedulerMode) {
                        navigate('/directorio');
                        return;
                      }

                      setSelectedDay(null);
                      form.resetFields();
                    }}
                  >
                    Cancelar
                  </AppButton>

                  <AppButton
                    htmlType="submit"
                    loading={savingVisit}
                    disabled={savingVisit}
                    className="calendar-save-btn"
                  >
                    Guardar
                  </AppButton>
                </div>
              </Form>
            )}
          </AppCard>
        ) : null}
      </div>
    </div>
  );
}
