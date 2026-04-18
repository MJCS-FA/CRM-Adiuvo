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

  return (
    <div className="cal-page">
      {contextHolder}

      <style>{`
        .cal-page { display: flex; flex-direction: column; gap: 20px; }

        .cal-header { display: flex; align-items: flex-start; justify-content: space-between; }
        .cal-header-title { font-size: 22px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.5px; }
        .cal-header-sub { font-size: 13px; color: var(--text-tertiary); margin-top: 2px; }

        .cal-layout {
          display: flex; gap: 20px;
          height: calc(100vh - var(--top-header-height) - var(--bottom-nav-height) - 100px);
        }

        /* ── Main Calendar ── */
        .cal-main-card {
          flex: 1; min-width: 0;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          display: flex; flex-direction: column;
          box-shadow: var(--shadow-sm);
          overflow: hidden;
        }

        /* Custom Header for Calendar */
        .cal-custom-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px; border-bottom: 1px solid var(--border-default);
          background: var(--bg-subtle);
        }
        .cal-nav-btns { display: flex; gap: 8px; }
        .cal-nav-btn {
          width: 34px; height: 34px; border-radius: 50%;
          border: 1.5px solid var(--border-default); background: var(--bg-card);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text-secondary); transition: all 0.2s;
        }
        .cal-nav-btn:hover { border-color: var(--adiuvo-red); color: var(--adiuvo-red); }
        .cal-current-month { font-size: 16px; font-weight: 700; color: var(--text-primary); text-transform: capitalize; }
        .cal-today-btn {
          padding: 6px 16px; border-radius: var(--radius-md);
          border: 1.5px solid var(--border-default); background: var(--bg-card);
          font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;
        }
        .cal-today-btn:hover { border-color: var(--adiuvo-red); color: var(--adiuvo-red); }

        /* Ant Calendar Overrides */
        .ant-picker-calendar { background: transparent !important; }
        .ant-picker-calendar-header { display: none !important; }
        .ant-picker-calendar-date {
          border-top: 1px solid var(--border-light) !important;
          margin: 0 !important; padding: 8px !important;
          transition: background 0.2s;
        }
        .ant-picker-calendar-date:hover { background: var(--adiuvo-red-light) !important; }
        .ant-picker-calendar-date-selected { background: #fff1f2 !important; }
        .ant-picker-calendar-date-selected .ant-picker-calendar-date-value { color: var(--adiuvo-red) !important; font-weight: 800; }
        .ant-picker-calendar-date-value { font-size: 13px; font-weight: 600; color: var(--text-secondary); }

        /* Event Items in Cells */
        .cal-cell-events { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
        .cal-cell-event {
          display: flex; align-items: center; gap: 6px;
          padding: 3px 6px; border-radius: 4px;
          background: var(--bg-app); font-size: 10px; font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          border-left: 2px solid var(--adiuvo-red);
        }
        .cal-event-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cal-event--in-progress { border-left-color: #f59e0b; background: #fffbeb; }
        .cal-event--completed { border-left-color: #10b981; background: #f0fdf4; }

        /* ── Side Panel ── */
        .cal-side-panel {
          width: 380px; flex-shrink: 0;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          display: flex; flex-direction: column;
          box-shadow: var(--shadow-sm);
          padding: 24px;
          overflow-y: auto;
        }
        .cal-side-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
        .cal-side-form .ant-form-item-label label { font-size: 12px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }

        .cal-form-actions { display: flex; gap: 12px; margin-top: 12px; }
        .cal-btn-save { flex: 1; height: 44px; font-weight: 700 !important; }
        .cal-btn-cancel { height: 44px; }

        /* Empty State Side */
        .cal-empty-side {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 16px; height: 100%; text-align: center; color: var(--text-tertiary);
        }
        .cal-empty-icon { font-size: 40px; opacity: 0.2; }

        @media (max-width: 1024px) {
          .cal-side-panel { width: 320px; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="cal-header">
        <div>
          <div className="cal-header-title">Agenda de Visitas</div>
          <div className="cal-header-sub">
            {visitadorContext?.visitador?.nombreCompleto || 'Cargando información del visitador...'}
          </div>
        </div>
      </div>

      {!loadingCatalogs && !hasVisitador && (
        <Alert
          type="warning" showIcon
          message="Configuración de Visitador Requerida"
          description="No se ha detectado una relación activa en tblVisitador para tu usuario."
        />
      )}

      {/* ── Layout ── */}
      <div className="cal-layout">
        {/* Main Calendar Section */}
        {!isDirectorySchedulerMode && (
          <div className="cal-main-card">
            <Calendar
              fullscreen
              onSelect={handleSelectDay}
              onPanelChange={(v) => { setActiveMonth(v.format('YYYY-MM')); setSelectedDay(null); }}
              headerRender={({ value, onChange }) => {
                const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(value.year(), value.month(), 1));
                return (
                  <div className="cal-custom-header">
                    <div className="cal-nav-btns">
                      <button className="cal-nav-btn" onClick={() => { const n = value.clone().subtract(1, 'month'); onChange(n); setActiveMonth(n.format('YYYY-MM')); }}>
                        <LeftOutlined />
                      </button>
                      <button className="cal-nav-btn" onClick={() => { const n = value.clone().add(1, 'month'); onChange(n); setActiveMonth(n.format('YYYY-MM')); }}>
                        <RightOutlined />
                      </button>
                    </div>
                    <div className="cal-current-month">{monthLabel}</div>
                    <button className="cal-today-btn" onClick={() => { const now = dayjs(); onChange(now); setActiveMonth(now.format('YYYY-MM')); }}>
                      Hoy
                    </button>
                  </div>
                );
              }}
              dateCellRender={(value) => {
                const dayKey = value.format('YYYY-MM-DD');
                const items = eventsByDate.get(dayKey) || [];
                if (!items.length) return null;
                return (
                  <div className="cal-cell-events">
                    {items.slice(0, 3).map((ev) => {
                      const theme = resolveVisitStatusTheme(ev.codigoEstado, ev.estado);
                      const modClass = theme.key === 'in_progress' ? 'cal-event--in-progress' : theme.key === 'completed' ? 'cal-event--completed' : '';
                      return (
                        <div key={ev.codigoVisitaMedica} className={`cal-cell-event ${modClass}`}>
                          <span>{formatEventTime(ev.horaProgramada)}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {resolveVisitDisplayName(ev, branchLabelsById)}
                          </span>
                        </div>
                      );
                    })}
                    {items.length > 3 && <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--adiuvo-red)', paddingLeft: '4px' }}>+{items.length - 3} más</div>}
                  </div>
                );
              }}
            />
          </div>
        )}

        {/* Side Creation Panel */}
        <div className="cal-side-panel">
          {showSchedulerPanel ? (
            <>
              <div className="cal-side-title">
                <CalendarOutlined style={{ color: 'var(--adiuvo-red)' }} />
                <span>Nueva Visita {selectedDay ? `· ${selectedDay.format('DD MMM')}` : ''}</span>
              </div>

              {!hasVisitador ? (
                <div className="cal-empty-side">
                  <div className="cal-empty-icon">🚫</div>
                  <p>Debes estar asignado como visitador para programar eventos.</p>
                </div>
              ) : (
                <Form layout="vertical" form={form} onFinish={handleCreateVisit} className="cal-side-form">
                  <Form.Item label="Tipo de Visita" name="tipoVisitaId" rules={[{ required: true, message: 'Requerido' }]}>
                    <AppSelect options={visitTypes} placeholder="Seleccionar..." />
                  </Form.Item>

                  <Form.Item label="Canal" name="canalVisitaId" rules={[{ required: true, message: 'Requerido' }]}>
                    <AppSelect options={visitChannels} placeholder="Seleccionar..." />
                  </Form.Item>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <Form.Item label="Fecha" name="fechaProgramada" rules={[{ required: true, message: 'Requerido' }]} style={{ flex: 1 }}>
                      {isDirectorySchedulerMode ? (
                        <AppInput placeholder="YYYY-MM-DD" />
                      ) : (
                        <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
                      )}
                    </Form.Item>
                    <Form.Item label="Hora" name="horaProgramada" rules={[{ required: true, message: 'Requerido' }]} style={{ flex: 1 }}>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  </div>

                  <Form.Item label={isBranchVisit ? 'Sucursal' : 'Médico'} name="targetId" rules={[{ required: true, message: 'Requerido' }]}>
                    <AppSelect showSearch optionFilterProp="label" options={targetOptions} placeholder="Buscar..." />
                  </Form.Item>

                  <Form.Item label="Comentarios" name="comentarios">
                    <AppInput type="textarea" rows={3} placeholder="Notas adicionales..." />
                  </Form.Item>

                  <div className="cal-form-actions">
                    <AppButton
                      variant="outline" className="cal-btn-cancel"
                      onClick={() => { if (isDirectorySchedulerMode) navigate('/directorio'); else { setSelectedDay(null); form.resetFields(); } }}
                    >
                      Cancelar
                    </AppButton>
                    <AppButton htmlType="submit" loading={savingVisit} className="cal-btn-save">
                      Agendar
                    </AppButton>
                  </div>
                </Form>
              )}
            </>
          ) : (
            <div className="cal-empty-side">
              <CalendarOutlined className="cal-empty-icon" />
              <p style={{ fontWeight: 600 }}>Selecciona un día en el calendario para programar una visita.</p>
              <p style={{ fontSize: '12px' }}>O inicia desde el directorio de médicos.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
