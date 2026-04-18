import {
  ClockCircleOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileTextOutlined,
  MessageOutlined,
  MedicineBoxOutlined,
  PlayCircleOutlined,
  ShopOutlined,
  StepForwardOutlined
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Calendar,
  Checkbox,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Modal,
  Pagination,
  Popover,
  Radio,
  Row,
  Switch,
  TimePicker,
  Typography,
  message
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppButton, AppCard, AppInput, AppSelect } from '../../components/ui';
import { calendarService } from '../../services/calendarService';
import { directoryService } from '../../services/directoryService';
import { homeService } from '../../services/homeService';
import { formatApiError } from '../../utils/formatApiError';
import { sanitizeDisplayText } from '../../utils/sanitizeDisplayText';
import { resolveVisitStatusTheme } from '../../utils/visitStatus';

function Metric({ label, value, emphasize = false }) {
  return (
    <div className="home-metric-item">
      <Typography.Text className="home-metric-label">{label}</Typography.Text>
      <Typography.Text className={`home-metric-value ${emphasize ? 'is-emphasis' : ''}`}>
        {value}
      </Typography.Text>
    </div>
  );
}

function SummaryBlock({ title, cycleName, agendados, completados, cumplimiento, loading }) {
  return (
    <AppCard className="home-summary-card" loading={loading}>
      <Typography.Title level={4} className="home-summary-title">
        {title}
      </Typography.Title>

      <Typography.Text className="home-cycle-name">
        {cycleName || 'Sin ciclo activo'}
      </Typography.Text>

      <div className="home-metrics-grid">
        <Metric label="Agendados" value={agendados} />
        <Metric label="Completados" value={completados} />
        <Metric label="Cumplimiento" value={`${cumplimiento}%`} emphasize />
      </div>
    </AppCard>
  );
}

function parseVisitDate(value) {
  const text = String(value || '').trim();
  const directDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);

  if (directDateMatch?.[1]) {
    const safeDate = dayjs(directDateMatch[1]);
    return safeDate.isValid() ? safeDate : null;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const normalized = dayjs(`${year}-${month}-${day}`);

  return normalized.isValid() ? normalized : null;
}

function formatDate(fechaVisita) {
  const date = parseVisitDate(fechaVisita);

  if (!date) {
    return 'Sin fecha';
  }

  return date.format('DD/MM/YYYY');
}

function normalizeDateRange(value) {
  const today = dayjs().startOf('day');
  const range = Array.isArray(value) ? value : [];
  const leftRaw = dayjs.isDayjs(range[0]) ? range[0] : dayjs(range[0]);
  const rightRaw = dayjs.isDayjs(range[1]) ? range[1] : dayjs(range[1]);

  let start = leftRaw.isValid() ? leftRaw.startOf('day') : today;
  let end = rightRaw.isValid() ? rightRaw.startOf('day') : start;

  if (start.isAfter(end, 'day')) {
    [start, end] = [end, start];
  }

  return [start, end];
}

function buildMonthKeysFromDateRange(value) {
  const [startDate, endDate] = normalizeDateRange(value);
  const startMonth = startDate.startOf('month');
  const endMonth = endDate.startOf('month');
  const keys = [];

  for (let cursor = startMonth; cursor.valueOf() <= endMonth.valueOf(); cursor = cursor.add(1, 'month')) {
    keys.push(cursor.format('YYYY-MM'));
  }

  return keys;
}

function formatDateRangeLabel(value) {
  const [startDate, endDate] = normalizeDateRange(value);
  return `${startDate.format('YYYY-MM-DD')} a ${endDate.format('YYYY-MM-DD')}`;
}

function getFilteredVisits(visits = [], filters) {
  const {
    visitType,
    showCompleted,
    selectedDateRange
  } = filters || {};
  const [startDate, endDate] = normalizeDateRange(selectedDateRange);

  return visits
    .filter((visit) => visit.type === visitType)
    .filter((visit) => (showCompleted ? visit.completed : !visit.completed))
    .filter((visit) => {
      const visitDate = parseVisitDate(visit.fechaVisita);

      if (!visitDate) {
        return false;
      }

      if (visitDate.isBefore(startDate, 'day')) {
        return false;
      }

      if (visitDate.isAfter(endDate, 'day')) {
        return false;
      }

      return true;
    });
}

function resolvePrimaryAction(statusKey) {
  if (statusKey === 'in_progress') {
    return {
      key: 'follow',
      label: 'Seguir',
      icon: <StepForwardOutlined />
    };
  }

  if (statusKey === 'completed') {
    return {
      key: 'detail',
      label: 'Ver Detalle',
      icon: <EyeOutlined />
    };
  }

  if (statusKey === 'cancelled') {
    return {
      key: 'detail',
      label: 'Ver Detalle',
      icon: <EyeOutlined />
    };
  }

  return {
    key: 'start',
    label: 'Iniciar',
    icon: <PlayCircleOutlined />
  };
}

function formatTime(timeValue) {
  const text = String(timeValue || '').trim();

  if (!text) {
    return 'Sin hora';
  }

  return text.length >= 5 ? text.slice(0, 5) : text;
}

function buildBranchDisplayName({
  codigoInternoSucursal,
  nombreSucursal,
  codigoSucursal
}) {
  const internalCode = String(codigoInternoSucursal || '').trim();
  const name = String(nombreSucursal || '').trim();

  if (internalCode && name) {
    return `${internalCode} - ${name}`;
  }

  if (name) {
    return name;
  }

  const code = Number(codigoSucursal || 0);
  return code > 0 ? `Sucursal ${code}` : 'Sucursal no asignada';
}

function getBirthdayDisplayName(value) {
  const tokens = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    return 'Sin nombre';
  }

  if (tokens.length === 1) {
    return tokens[0];
  }

  if (tokens.length === 2) {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return `${tokens[0]} ${tokens[tokens.length - 2]}`;
}

function DashboardFilters({ value, onChange }) {
  const isBranch = value.visitType === 'branch';
  const [selectedStartDate, selectedEndDate] = normalizeDateRange(value.selectedDateRange);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(selectedStartDate.startOf('month'));

  useEffect(() => {
    setCalendarMonth(selectedStartDate.startOf('month'));
  }, [selectedStartDate.valueOf()]);

  const handleDateSelect = (nextDate) => {
    const current = nextDate.startOf('day');

    if (!pendingStartDate) {
      setPendingStartDate(current);
      setHoverDate(current);

      onChange({
        ...value,
        selectedDateRange: [current, current]
      });
      return;
    }

    const rangeStart = current.isBefore(pendingStartDate, 'day') ? current : pendingStartDate;
    const rangeEnd = current.isBefore(pendingStartDate, 'day') ? pendingStartDate : current;

    onChange({
      ...value,
      selectedDateRange: [rangeStart, rangeEnd]
    });
    setPendingStartDate(null);
    setHoverDate(null);
    setIsCalendarOpen(false);
  };

  const [activeRangeStart, activeRangeEnd] = useMemo(() => {
    if (!pendingStartDate) {
      return [selectedStartDate, selectedEndDate];
    }

    const pendingDay = pendingStartDate.startOf('day');
    const previewDay =
      hoverDate && hoverDate.isValid()
        ? hoverDate.startOf('day')
        : pendingDay;

    if (previewDay.isBefore(pendingDay, 'day')) {
      return [previewDay, pendingDay];
    }

    return [pendingDay, previewDay];
  }, [
    pendingStartDate ? pendingStartDate.valueOf() : 0,
    hoverDate ? hoverDate.valueOf() : 0,
    selectedStartDate.valueOf(),
    selectedEndDate.valueOf()
  ]);

  const isRangeStart = (current) => current.isSame(activeRangeStart, 'day');
  const isRangeEnd = (current) => current.isSame(activeRangeEnd, 'day');
  const isRangeMiddle = (current) =>
    current.isAfter(activeRangeStart, 'day') && current.isBefore(activeRangeEnd, 'day');

  const calendarContent = (
    <div className="dashboard-single-calendar-content">
      <Typography.Text className="dashboard-single-calendar-help">
        Primer clic: inicio. Segundo clic: fin.
      </Typography.Text>
      <Calendar
        fullscreen={false}
        value={calendarMonth}
        onSelect={(nextDate) => {
          setCalendarMonth(nextDate.startOf('month'));
          handleDateSelect(nextDate);
        }}
        onPanelChange={(nextDate) => {
          setCalendarMonth(nextDate.startOf('month'));
        }}
        headerRender={({ value: headerValue, onChange }) => (
          <div className="dashboard-single-calendar-header">
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => {
                const previousMonth = headerValue.subtract(1, 'month');
                onChange(previousMonth);
                setCalendarMonth(previousMonth.startOf('month'));
              }}
            />
            <Typography.Text className="dashboard-single-calendar-title">
              {headerValue.format('MMMM YYYY')}
            </Typography.Text>
            <Button
              type="text"
              icon={<RightOutlined />}
              onClick={() => {
                const nextMonth = headerValue.add(1, 'month');
                onChange(nextMonth);
                setCalendarMonth(nextMonth.startOf('month'));
              }}
            />
          </div>
        )}
        fullCellRender={(current) => {
          const currentDay = current.startOf('day');
          const isToday = current.isSame(dayjs(), 'day');
          const isOutsideMonth = !currentDay.isSame(calendarMonth, 'month');
          const classNames = [
            'dashboard-range-calendar-cell',
            isRangeMiddle(currentDay) ? 'is-range-middle' : '',
            isRangeStart(currentDay) ? 'is-range-start' : '',
            isRangeEnd(currentDay) ? 'is-range-end' : '',
            isOutsideMonth ? 'is-outside-month' : '',
            isToday ? 'is-today' : ''
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              className={classNames}
              onMouseEnter={() => {
                if (pendingStartDate) {
                  setHoverDate(currentDay);
                }
              }}
            >
              {current.date()}
            </div>
          );
        }}
      />
    </div>
  );

  return (
    <AppCard className="dashboard-filters-card">
      <div className="dashboard-filters">
        <div className="dashboard-filters-top">
          <Switch
            checked={isBranch}
            checkedChildren="Sucursal"
            unCheckedChildren="Médica"
            onChange={(checked) =>
              onChange({
                ...value,
                visitType: checked ? 'branch' : 'medical'
              })
            }
          />
        </div>

        <div className="dashboard-filters-options">
          <Checkbox
            checked={value.showCompleted}
            onChange={(event) =>
              onChange({
                ...value,
                showCompleted: event.target.checked
              })
            }
          >
            <Typography.Text className="dashboard-checkbox-text">Solo completadas</Typography.Text>
          </Checkbox>

          <div className="dashboard-filters-date-row">
            <div className="dashboard-date-picker-wrap">
              <Typography.Text className="dashboard-date-picker-label">
                Seleccione el rango de fechas
              </Typography.Text>
              <Popover
                trigger="click"
                placement="bottomLeft"
                open={isCalendarOpen}
                onOpenChange={(nextOpen) => {
                  setIsCalendarOpen(nextOpen);

                  if (!nextOpen) {
                    setPendingStartDate(null);
                    setHoverDate(null);
                  }
                }}
                content={calendarContent}
                overlayClassName="dashboard-single-calendar-overlay"
              >
                <Button className="dashboard-date-range-trigger">
                  {formatDateRangeLabel([selectedStartDate, selectedEndDate])}
                </Button>
              </Popover>
            </div>
          </div>

        </div>
      </div>
    </AppCard>
  );
}

function VisitCard({ children, action, onAction, allowChangeDate = false }) {
  const fixedActions = [
    {
      key: 'file',
      label: 'Ficha',
      icon: <FileTextOutlined />
    }
  ];

  if (allowChangeDate) {
    fixedActions.push({
      key: 'change_date',
      label: 'Cambiar Fecha',
      icon: <CalendarOutlined />
    });
  }

  return (
    <AppCard className="dashboard-visit-card-shell">
      <div className="dashboard-visit-card">
        <div className="dashboard-visit-main">{children}</div>

        <div className="dashboard-visit-actions">
          {fixedActions.map((item) => (
            <div key={item.key} className="dashboard-visit-action">
              <Button
                shape="circle"
                className={`dashboard-visit-action-btn is-${item.key}`}
                icon={item.icon}
                size="small"
                onClick={() => onAction?.(item)}
              />
              <Typography.Text className="dashboard-visit-action-label">
                {item.label}
              </Typography.Text>
            </div>
          ))}

          {action ? (
            <div className="dashboard-visit-action">
              <Button
                shape="circle"
                className={`dashboard-visit-action-btn is-${action.key}`}
                icon={action.icon}
                size="small"
                onClick={() => onAction?.(action)}
              />
              <Typography.Text className="dashboard-visit-action-label">
                {action.label}
              </Typography.Text>
            </div>
          ) : null}
        </div>
      </div>
    </AppCard>
  );
}

function VisitInfoLine({ icon, children, className = '' }) {
  return (
    <div className={`dashboard-visit-line ${className}`.trim()}>
      <span className="dashboard-visit-line-icon" aria-hidden>
        {icon}
      </span>
      <div className="dashboard-visit-line-content">{children}</div>
    </div>
  );
}

function MedicalVisitCard({ visit, action, onAction }) {
  return (
    <VisitCard action={action} onAction={onAction} allowChangeDate={visit.canChangeDate}>
      <Typography.Text strong className="dashboard-visit-title">
        {visit.nombreMedico}
      </Typography.Text>
      <div className="dashboard-visit-status-row">
        <span className={`dashboard-visit-status-dot ${visit.statusClassName}`} />
        <Typography.Text className="dashboard-visit-status-label">
          {visit.statusLabel}
        </Typography.Text>
      </div>
      <VisitInfoLine icon={<MedicineBoxOutlined />} className="is-specialty">
        <Typography.Text className="dashboard-visit-text-secondary">
          {visit.especialidad}
        </Typography.Text>
      </VisitInfoLine>
      <VisitInfoLine icon={<EnvironmentOutlined />} className="is-hospital">
        <Typography.Text className="dashboard-visit-text-secondary">
          {visit.hospital}
        </Typography.Text>
      </VisitInfoLine>
      <VisitInfoLine icon={<MessageOutlined />} className="is-comment">
        <Typography.Paragraph
          className="dashboard-visit-comment"
          ellipsis={{ rows: 1, tooltip: visit.comentario || 'Sin comentario' }}
        >
          {visit.comentario || 'Sin comentario'}
        </Typography.Paragraph>
      </VisitInfoLine>
      <VisitInfoLine icon={<CalendarOutlined />} className="is-date">
        <Typography.Text className="dashboard-visit-text-primary">
          Fecha visita: {formatDate(visit.fechaVisita)}
        </Typography.Text>
      </VisitInfoLine>
      <VisitInfoLine icon={<ClockCircleOutlined />} className="is-time">
        <Typography.Text className="dashboard-visit-text-tertiary">
          Hora: {formatTime(visit.horaVisita)}
        </Typography.Text>
      </VisitInfoLine>
    </VisitCard>
  );
}

function BranchVisitCard({ visit, action, onAction }) {
  return (
    <VisitCard action={action} onAction={onAction} allowChangeDate={visit.canChangeDate}>
      <Typography.Text strong className="dashboard-visit-title">
        {visit.sucursal}
      </Typography.Text>
      <div className="dashboard-visit-status-row">
        <span className={`dashboard-visit-status-dot ${visit.statusClassName}`} />
        <Typography.Text className="dashboard-visit-status-label">
          {visit.statusLabel}
        </Typography.Text>
      </div>
      <VisitInfoLine icon={<ShopOutlined />} className="is-branch">
        <Typography.Text className="dashboard-visit-text-secondary">
          {visit.direccion}
        </Typography.Text>
      </VisitInfoLine>
      <VisitInfoLine icon={<CalendarOutlined />} className="is-date">
        <Typography.Text className="dashboard-visit-text-primary">
          Fecha visita: {formatDate(visit.fechaVisita)}
        </Typography.Text>
      </VisitInfoLine>
      <VisitInfoLine icon={<ClockCircleOutlined />} className="is-time">
        <Typography.Text className="dashboard-visit-text-tertiary">
          Hora: {formatTime(visit.horaVisita)}
        </Typography.Text>
      </VisitInfoLine>
    </VisitCard>
  );
}

function VisitList({ visits, loading, onVisitAction }) {
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [visits]);

  if (loading) {
    return (
      <AppCard>
        <Typography.Text type="secondary">Cargando visitas...</Typography.Text>
      </AppCard>
    );
  }

  if (!visits.length) {
    return (
      <AppCard>
        <Empty
          description="No hay visitas para el filtro seleccionado."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </AppCard>
    );
  }

  const start = (page - 1) * pageSize;
  const paginatedVisits = visits.slice(start, start + pageSize);

  return (
    <div className="dashboard-visit-list">
      <div
        className={`dashboard-visit-grid ${paginatedVisits.length === 1 ? 'is-single' : ''}`}
      >
        {paginatedVisits.map((visit) =>
          visit.type === 'medical' ? (
            <MedicalVisitCard
              key={visit.id}
              visit={visit}
              action={resolvePrimaryAction(visit.statusKey)}
              onAction={(action) => onVisitAction?.(visit, action)}
            />
          ) : (
            <BranchVisitCard
              key={visit.id}
              visit={visit}
              action={resolvePrimaryAction(visit.statusKey)}
              onAction={(action) => onVisitAction?.(visit, action)}
            />
          )
        )}
      </div>

      <Pagination
        current={page}
        total={visits.length}
        pageSize={pageSize}
        showSizeChanger={false}
        onChange={(nextPage) => setPage(nextPage)}
      />
    </div>
  );
}

export function DashboardPage() {
  const [changeVisitForm] = Form.useForm();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [hasVisitador, setHasVisitador] = useState(true);

  const [cycleName, setCycleName] = useState('');
  const [medicalSummary, setMedicalSummary] = useState({
    agendados: 0,
    completados: 0,
    cumplimiento: 0
  });
  const [branchSummary, setBranchSummary] = useState({
    agendados: 0,
    completados: 0,
    cumplimiento: 0
  });
  const [birthdayMonthLabel, setBirthdayMonthLabel] = useState('');
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayIndex, setBirthdayIndex] = useState(0);
  const [monthVisits, setMonthVisits] = useState([]);
  const [doctorReferences, setDoctorReferences] = useState([]);
  const [branchReferences, setBranchReferences] = useState([]);
  const [isRunningVisitModalOpen, setIsRunningVisitModalOpen] = useState(false);
  const [runningVisitConflict, setRunningVisitConflict] = useState(null);
  const [isChangeVisitDrawerOpen, setIsChangeVisitDrawerOpen] = useState(false);
  const [selectedVisitForChange, setSelectedVisitForChange] = useState(null);
  const [savingVisitUpdate, setSavingVisitUpdate] = useState(false);
  const [cancelReasonOptions, setCancelReasonOptions] = useState([]);
  const [loadingCancelReasons, setLoadingCancelReasons] = useState(false);

  const today = dayjs().startOf('day');
  const [filters, setFilters] = useState({
    visitType: 'medical',
    showCompleted: false,
    selectedDateRange: [today, today]
  });
  const selectedMonthKeys = useMemo(
    () => buildMonthKeysFromDateRange(filters.selectedDateRange),
    [filters.selectedDateRange]
  );
  const reagendarDecision = Form.useWatch('reagendar', changeVisitForm);

  const currentBirthday = useMemo(() => {
    if (!birthdays.length) {
      return null;
    }

    return birthdays[birthdayIndex % birthdays.length] || birthdays[0];
  }, [birthdays, birthdayIndex]);

  const doctorsByCode = useMemo(() => {
    const map = new Map();

    for (const doctor of doctorReferences) {
      const code = Number(doctor.codigoMedico);

      if (Number.isFinite(code)) {
        map.set(code, doctor);
      }
    }

    return map;
  }, [doctorReferences]);

  const branchesByCode = useMemo(() => {
    const map = new Map();

    for (const branch of branchReferences) {
      const code = Number(branch.codigoSucursal);

      if (Number.isFinite(code)) {
        map.set(code, branch);
      }
    }

    return map;
  }, [branchReferences]);

  const normalizedVisits = useMemo(() => {
    return (monthVisits || []).map((rawVisit) => {
      const codigoTipoVisita = Number(rawVisit.codigoTipoVisita || 0);
      const codigoMedico = Number(rawVisit.codigoMedico || 0);
      const codigoSucursal = Number(rawVisit.codigoSucursal || 0);
      const isBranch = codigoTipoVisita === 2 || codigoMedico === 1;
      const doctor = doctorsByCode.get(codigoMedico);
      const branch = branchesByCode.get(codigoSucursal);
      const codigoInternoSucursal =
        String(rawVisit.codigoInternoSucursal || '').trim() ||
        String(branch?.codigoInternoSucursal || '').trim();
      const estado = String(rawVisit.estado || '').toLowerCase();
      const completed = Number(rawVisit.codigoEstado) === 5 || estado.includes('completad');
      const statusTheme = resolveVisitStatusTheme(rawVisit.codigoEstado, rawVisit.estado);
      const statusKey = statusTheme.key;
      const nombreMedico =
        rawVisit.nombreMedico || doctor?.nombreMedico || `Médico ${codigoMedico || 'N/A'}`;
      const nombreSucursalVisita = String(rawVisit.nombreSucursal || '').trim();
      const sucursal = isBranch
        ? buildBranchDisplayName({
            codigoInternoSucursal,
            nombreSucursal: branch?.nombreSucursal || nombreSucursalVisita,
            codigoSucursal
          })
        : '';

      return {
        id: rawVisit.codigoVisitaMedica,
        type: isBranch ? 'branch' : 'medical',
        completed,
        statusKey,
        statusClassName: statusTheme.className,
        statusLabel: String(rawVisit.estado || '').trim() || statusTheme.label,
        codigoEstado: Number(rawVisit.codigoEstado || 0),
        estado: rawVisit.estado || '',
        codigoMedico,
        codigoSucursal,
        codigoInternoSucursal,
        fechaVisita: rawVisit.fechaProgramada,
        horaVisita: rawVisit.horaProgramada || '',
        nombreMedico,
        especialidad: doctor?.especialidad || 'Sin especialidad',
        hospital: doctor?.hospital || 'Sin hospital',
        comentario: sanitizeDisplayText(rawVisit.comentarios, 'Sin comentario'),
        sucursal,
        direccion:
          branch?.direccionSucursal ||
          (isBranch ? 'Dirección no disponible' : ''),
        displayName: isBranch ? sucursal : nombreMedico,
        canChangeDate: statusKey === 'pending'
      };
    });
  }, [monthVisits, doctorsByCode, branchesByCode]);

  const filteredVisits = useMemo(
    () => getFilteredVisits(normalizedVisits, filters),
    [normalizedVisits, filters]
  );

  const activeVisitInProgress = useMemo(
    () => normalizedVisits.find((visit) => visit.statusKey === 'in_progress') || null,
    [normalizedVisits]
  );

  const openRunningVisitModal = (visit) => {
    setRunningVisitConflict(visit || null);
    setIsRunningVisitModalOpen(true);
  };

  const closeChangeVisitDrawer = () => {
    setIsChangeVisitDrawerOpen(false);
    setSelectedVisitForChange(null);
    changeVisitForm.resetFields();
  };

  const openChangeVisitDrawer = (visit) => {
    const visitDate = parseVisitDate(visit?.fechaVisita);
    const timeText = String(visit?.horaVisita || '').trim();
    const normalizedTime = timeText.length >= 5 ? timeText.slice(0, 5) : '';
    const timeValue = normalizedTime ? dayjs(`2000-01-01T${normalizedTime}:00`) : null;

    setSelectedVisitForChange(visit || null);
    setIsChangeVisitDrawerOpen(true);
    changeVisitForm.setFieldsValue({
      reagendar: undefined,
      codigoMotivoCancelacion: undefined,
      observaciones: '',
      fechaProgramada: visitDate || dayjs(),
      horaProgramada: timeValue?.isValid() ? timeValue : null
    });
  };

  const loadCancelReasons = async () => {
    setLoadingCancelReasons(true);

    try {
      const response = await calendarService.getCancellationReasons();
      const mapped = (response?.items || [])
        .map((item) => ({
          value: Number(item.value),
          label: String(item.label || '').trim()
        }))
        .filter((item) => Number.isFinite(item.value) && item.value > 0 && item.label);

      setCancelReasonOptions(mapped);
    } catch (error) {
      setCancelReasonOptions([]);
      messageApi.error(formatApiError(error));
    } finally {
      setLoadingCancelReasons(false);
    }
  };

  const handleSubmitVisitChange = async () => {
    if (!selectedVisitForChange || savingVisitUpdate) {
      return;
    }

    try {
      const values = await changeVisitForm.validateFields();
      const isReagendar = values.reagendar === true;
      const payload = {
        reprogramar: isReagendar,
        codigoMotivoCancelacion: Number(values.codigoMotivoCancelacion),
        observaciones: String(values.observaciones || '').trim()
      };

      if (isReagendar) {
        payload.fechaProgramada = values.fechaProgramada.format('YYYY-MM-DD');
        payload.horaProgramada = values.horaProgramada.format('HH:mm:ss');
      }

      setSavingVisitUpdate(true);
      const response = await calendarService.updateVisit(selectedVisitForChange.id, payload);

      messageApi.success(response?.message || (isReagendar ? 'Visita reagendada' : 'Visita cancelada'));
      closeChangeVisitDrawer();

      if (isReagendar) {
        const nextDate = dayjs(payload.fechaProgramada);
        setFilters((current) => ({
          ...current,
          selectedDateRange: [nextDate.startOf('day'), nextDate.startOf('day')],
          showCompleted: false
        }));
      } else {
        await loadMonthVisits(selectedMonthKeys);
      }

      loadOverview();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      messageApi.error(formatApiError(error));
    } finally {
      setSavingVisitUpdate(false);
    }
  };

  const handleVisitAction = (visit, action) => {
    if (!visit || !action) {
      return;
    }

    if (action.key === 'start') {
      const runningVisit =
        normalizedVisits.find(
          (item) => item.statusKey === 'in_progress' && Number(item.id) !== Number(visit.id)
        ) || null;

      if (runningVisit) {
        messageApi.warning('No puede iniciar una visita ya que tiene una en ejecución');
        openRunningVisitModal(runningVisit);
        return;
      }

      navigate(`/visita-ejecucion/${visit.id}`, {
        state: {
          actionMode: 'start',
          visit
        }
      });
      return;
    }

    if (action.key === 'follow') {
      navigate(`/visita-ejecucion/${visit.id}`, {
        state: {
          actionMode: 'follow',
          visit
        }
      });
      return;
    }

    if (action.key === 'file') {
      if (visit.type === 'branch') {
        if (Number(visit.codigoSucursal || 0) <= 0) {
          messageApi.warning('La visita no tiene una sucursal asociada para abrir la ficha.');
          return;
        }

        navigate(`/directorio/sucursales/ficha/${visit.codigoSucursal}`, {
          state: {
            sucursalNombre: visit.sucursal || null
          }
        });
        return;
      }

      if (Number(visit.codigoMedico || 0) <= 0) {
        messageApi.warning('La visita no tiene un médico asociado para abrir la ficha.');
        return;
      }

      navigate(`/directorio/ficha/${visit.codigoMedico}`, {
        state: {
          doctorName: visit.nombreMedico || null
        }
      });
      return;
    }

    if (action.key === 'change_date') {
      if (!visit.canChangeDate) {
        messageApi.warning('Solo puede cambiar fecha en visitas no iniciadas.');
        return;
      }

      if (!cancelReasonOptions.length && !loadingCancelReasons) {
        messageApi.warning('No hay motivos de cancelación configurados para gestionar la visita.');
        return;
      }

      openChangeVisitDrawer(visit);
      return;
    }

    if (action.key === 'detail') {
      navigate(`/visita-detalle/${visit.id}`);
      return;
    }

    messageApi.info('Visualización de detalle disponible para esta visita.');
  };

  const loadMonthVisits = async (monthKeys = []) => {
    setLoadingVisits(true);

    try {
      const normalizedMonthKeys = Array.isArray(monthKeys)
        ? monthKeys
            .map((item) => String(item || '').trim())
            .filter(Boolean)
        : [];
      const targetMonths = normalizedMonthKeys.length
        ? [...new Set(normalizedMonthKeys)]
        : [dayjs().format('YYYY-MM')];
      const responses = await Promise.all(
        targetMonths.map((month) => calendarService.getMonthVisits(month))
      );
      const mergedVisits = new Map();
      let hasVisitadorValue = null;

      for (const response of responses) {
        for (const visit of response.visits || []) {
          mergedVisits.set(visit.codigoVisitaMedica, visit);
        }

        if (response.hasVisitador !== undefined) {
          const currentValue = Boolean(response.hasVisitador);
          hasVisitadorValue =
            hasVisitadorValue === null ? currentValue : hasVisitadorValue && currentValue;
        }
      }

      if (hasVisitadorValue !== null) {
        setHasVisitador(hasVisitadorValue);
      }

      setMonthVisits(
        [...mergedVisits.values()].sort((a, b) => {
          const leftDate = parseVisitDate(a.fechaProgramada);
          const rightDate = parseVisitDate(b.fechaProgramada);
          const leftTime = String(a.horaProgramada || '');
          const rightTime = String(b.horaProgramada || '');

          if (leftDate && rightDate && leftDate.isSame(rightDate, 'day')) {
            return leftTime.localeCompare(rightTime);
          }

          if (leftDate && rightDate) {
            return leftDate.valueOf() - rightDate.valueOf();
          }

          return Number(a.codigoVisitaMedica || 0) - Number(b.codigoVisitaMedica || 0);
        })
      );
    } catch (error) {
      messageApi.error(formatApiError(error));
      setMonthVisits([]);
    } finally {
      setLoadingVisits(false);
    }
  };

  const loadVisitReferences = async () => {
    setLoadingReferences(true);

    const [doctorsResult, branchesResult] = await Promise.allSettled([
      directoryService.getDoctors(),
      directoryService.getBranches()
    ]);

    if (doctorsResult.status === 'fulfilled') {
      setDoctorReferences(doctorsResult.value.medicos || []);
    } else {
      setDoctorReferences([]);
      messageApi.error(formatApiError(doctorsResult.reason));
    }

    if (branchesResult.status === 'fulfilled') {
      setBranchReferences(branchesResult.value.sucursales || []);
    } else {
      setBranchReferences([]);
      messageApi.error(formatApiError(branchesResult.reason));
    }

    setLoadingReferences(false);
  };

  const applyOverviewResponse = (response = {}) => {
    const cycle = response.cycle || {};
    const medical = response.medical || {};
    const branch = response.branch || {};
    const birthdayPayload = response.birthdays || {};
    const birthdayItems = birthdayPayload.items || [];

    setHasVisitador(Boolean(cycle.hasVisitador ?? medical.hasVisitador ?? true));
    setCycleName(cycle.cycle?.nombreCicloVisita || medical.cycle?.nombreCicloVisita || '');
    setMedicalSummary({
      agendados: Number(medical.agendados || 0),
      completados: Number(medical.completados || 0),
      cumplimiento: Number(medical.cumplimiento || 0)
    });
    setBranchSummary({
      agendados: Number(branch.agendados || 0),
      completados: Number(branch.completados || 0),
      cumplimiento: Number(branch.cumplimiento || 0)
    });
    setBirthdayMonthLabel(birthdayPayload.month?.label || '');
    setBirthdays(birthdayItems);
    setBirthdayIndex(0);
  };

  const loadOverview = async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true);
    }

    try {
      const response = await homeService.getOverview();
      applyOverviewResponse(response);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadOverview({ showLoader: true });
  }, []);

  useEffect(() => {
    loadVisitReferences();
  }, []);

  useEffect(() => {
    loadCancelReasons();
  }, []);

  useEffect(() => {
    loadMonthVisits(selectedMonthKeys);
  }, [selectedMonthKeys]);

  useEffect(() => {
    if (birthdays.length <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setBirthdayIndex((current) => (current + 1) % birthdays.length);
    }, 4500);

    return () => {
      window.clearInterval(timer);
    };
  }, [birthdays.length]);

  return (
    <div className="page-wrap home-page">
      {contextHolder}

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Principal
      </Typography.Title>

      {!loading && !hasVisitador ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="No se encontró un visitador para esta sesión"
          description="Los indicadores se mostrarán en cero hasta que exista relación en tblVisitador."
        />
      ) : null}

      <Row gutter={[12, 12]} className="home-summary-row">
        <Col xs={24} lg={8}>
            <SummaryBlock
              title="Visitas Médicas"
              cycleName={cycleName}
              agendados={medicalSummary.agendados}
              completados={medicalSummary.completados}
            cumplimiento={medicalSummary.cumplimiento}
            loading={loading}
          />
        </Col>

        <Col xs={24} lg={8}>
          <SummaryBlock
            title="Visitas a Sucursal"
            cycleName={cycleName}
            agendados={branchSummary.agendados}
            completados={branchSummary.completados}
            cumplimiento={branchSummary.cumplimiento}
            loading={loading}
          />
        </Col>

        <Col xs={24} lg={8}>
          <AppCard className="home-birthday-card" loading={loading}>
            <div className="home-birthday-title-wrap">
              <span className="home-birthday-cake-icon" aria-hidden="true" />
              <Typography.Title level={4} className="home-summary-title">
                Cumpleañeros del Mes
              </Typography.Title>
            </div>

            <Typography.Text className="home-cycle-name">
              {(birthdayMonthLabel || '').replace(/^./, (letter) => letter.toUpperCase())}
            </Typography.Text>

            {currentBirthday ? (
              <div className="home-birthday-content">
                <Typography.Text className="home-birthday-name">
                  {getBirthdayDisplayName(currentBirthday.nombreMedico)}
                </Typography.Text>
                <Typography.Text className="home-birthday-date">
                  Dia {currentBirthday.diaCumple}
                </Typography.Text>
                <Typography.Text className="home-birthday-rotating">
                  Mostrando {birthdayIndex + 1} de {birthdays.length}
                </Typography.Text>
              </div>
            ) : (
              <Empty description="Mes sin cumpleañeros" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </AppCard>
        </Col>
      </Row>

      <div className="dashboard-main-content">
        <DashboardFilters value={filters} onChange={setFilters} />

        {!loading && !hasVisitador ? (
          <Alert
            type="warning"
            showIcon
            message="No se encontró un visitador para esta sesión"
            description="No es posible obtener visitas hasta tener relación en tblVisitador."
          />
        ) : null}

        <VisitList
          visits={filteredVisits}
          loading={loadingVisits || loadingReferences}
          onVisitAction={handleVisitAction}
        />
      </div>

      <Drawer
        title="Cambiar Visita"
        open={isChangeVisitDrawerOpen}
        width={520}
        onClose={() => {
          if (!savingVisitUpdate) {
            closeChangeVisitDrawer();
          }
        }}
        destroyOnClose
        maskClosable={!savingVisitUpdate}
        className="dashboard-change-visit-drawer"
      >
        <Form layout="vertical" form={changeVisitForm}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
            Detalle del Cambio
          </Typography.Title>

          <Form.Item
            label="¿Desea reagendar la visita?"
            name="reagendar"
            rules={[{ required: true, message: 'Seleccione Sí o No.' }]}
          >
            <Radio.Group>
              <Radio value={true}>Sí</Radio>
              <Radio value={false}>No</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="Motivo"
            name="codigoMotivoCancelacion"
            rules={[{ required: true, message: 'Seleccione el motivo.' }]}
          >
            <AppSelect
              showSearch
              optionFilterProp="label"
              placeholder="Seleccionar motivo"
              loading={loadingCancelReasons}
              options={cancelReasonOptions}
            />
          </Form.Item>

          {reagendarDecision === true ? (
            <>
              <Form.Item
                label="Fecha"
                name="fechaProgramada"
                rules={[{ required: true, message: 'Seleccione la nueva fecha.' }]}
              >
                <DatePicker className="dashboard-change-date-input" format="YYYY-MM-DD" />
              </Form.Item>

              <Form.Item
                label="Hora"
                name="horaProgramada"
                rules={[{ required: true, message: 'Seleccione la nueva hora.' }]}
              >
                <TimePicker className="dashboard-change-date-input" format="HH:mm:ss" />
              </Form.Item>
            </>
          ) : null}

          <Form.Item
            label="Observaciones"
            name="observaciones"
            rules={[{ required: true, message: 'Ingrese observaciones.' }]}
          >
            <AppInput type="textarea" rows={4} placeholder="Ingrese observaciones..." />
          </Form.Item>

          <div className="dashboard-change-visit-actions">
            <AppButton
              variant="outline"
              onClick={closeChangeVisitDrawer}
              disabled={savingVisitUpdate}
            >
              Regresar
            </AppButton>
            <AppButton
              onClick={handleSubmitVisitChange}
              loading={savingVisitUpdate}
              disabled={savingVisitUpdate}
            >
              Actualizar
            </AppButton>
          </div>
        </Form>
      </Drawer>

      <Modal
        open={isRunningVisitModalOpen}
        title="Visita en ejecución"
        onCancel={() => setIsRunningVisitModalOpen(false)}
        onOk={() => setIsRunningVisitModalOpen(false)}
        okText="Entendido"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          No puede iniciar una visita ya que tiene una en ejecución.
        </Typography.Paragraph>

        <div className="dashboard-running-visit-details">
          <Typography.Text>
            <strong>Nombre:</strong>{' '}
            {runningVisitConflict?.displayName || activeVisitInProgress?.displayName || 'N/A'}
          </Typography.Text>
          <Typography.Text>
            <strong>Fecha:</strong>{' '}
            {formatDate(runningVisitConflict?.fechaVisita || activeVisitInProgress?.fechaVisita)}
          </Typography.Text>
          <Typography.Text>
            <strong>Hora:</strong>{' '}
            {formatTime(runningVisitConflict?.horaVisita || activeVisitInProgress?.horaVisita)}
          </Typography.Text>
        </div>
      </Modal>
    </div>
  );
}



