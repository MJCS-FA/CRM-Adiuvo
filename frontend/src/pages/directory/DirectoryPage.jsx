import {
  BankOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PhoneOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Empty, Pagination, Tabs, Typography, message, Spin } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppInput, AppSelect } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { directoryService } from '../../services/directoryService';
import { formatApiError } from '../../utils/formatApiError';

const PAGE_SIZE = 12;

// Inline FA logo component — avoids broken image path issues
function FaLogo() {
  return (
    <svg viewBox="0 0 100 80" className="dir-card__pharmacy-logo">
      <text x="50" y="62" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold" fontSize="68" fill="#3aa548">FA</text>
    </svg>
  );
}

function normalize(value, fallback = '—') {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') {
    return fallback;
  }
  return text;
}

function getInitials(name) {
  return (name || 'A')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #e83c38, #c42e2a)',
  'linear-gradient(135deg, #475569, #334155)',
  'linear-gradient(135deg, #7c3aed, #5b21b6)',
  'linear-gradient(135deg, #0891b2, #0e7490)',
  'linear-gradient(135deg, #059669, #047857)',
  'linear-gradient(135deg, #d97706, #b45309)',
  'linear-gradient(135deg, #dc2626, #991b1b)',
  'linear-gradient(135deg, #2563eb, #1d4ed8)',
];

function getGradient(name) {
  let hash = 0;
  const str = name || '';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

/* ═══════════════════════════════════════════════════════
   DOCTOR CARD — Premium horizontal layout
   ═══════════════════════════════════════════════════════ */
function DoctorCard({ item, onAction }) {
  const name = normalize(item.nombreMedico || item.correoElectronico, 'Médico');
  const hospital = normalize(item.hospital, 'Sin hospital asignado');
  const especialidad = normalize(item.especialidad, 'General');
  const categoria = normalize(item.categoria, '');

  return (
    <div className="dir-card" onClick={() => onAction({ key: 'ficha' })}>
      <div className="dir-card__avatar dir-card__avatar--doctor">
        {getInitials(name)}
      </div>
      <div className="dir-card__body">
        <div className="dir-card__name">{name}</div>
        <div className="dir-card__detail">
          <span className="dir-card__badge dir-card__badge--specialty">{especialidad}</span>
          {categoria && <span className="dir-card__badge dir-card__badge--cat">{categoria}</span>}
        </div>
        <div className="dir-card__meta">
          <BankOutlined /> <span>{hospital}</span>
        </div>
      </div>
      <div className="dir-card__actions" onClick={(e) => e.stopPropagation()}>
        <button className="dir-action dir-action--ghost" onClick={() => onAction({ key: 'ficha' })} title="Ficha médica">
          <FileTextOutlined />
        </button>
        <button className="dir-action dir-action--ghost" onClick={() => onAction({ key: 'historial' })} title="Historial">
          <HistoryOutlined />
        </button>
        <button className="dir-action dir-action--primary" onClick={() => onAction({ key: 'visitar' })}>
          <CalendarOutlined /> <span>Visitar</span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   BRANCH CARD
   ═══════════════════════════════════════════════════════ */
function BranchCard({ item, onAction }) {
  const rawName = normalize(item.nombreSucursal, 'Sucursal');
  const internalCode = normalize(item.codigoInternoSucursal || item.numeroSucursal, '');
  const displayName = internalCode && !rawName.startsWith(internalCode)
    ? `${internalCode} - ${rawName}`
    : rawName;
  const address = normalize(item.direccion || item.direccionSucursal, 'Sin dirección');
  const contact = normalize(item.contacto || item.correo || item.correoSucursal, 'Sin contacto');

  return (
    <div className="dir-card" onClick={() => onAction({ key: 'visitar' })}>
      <div className="dir-card__avatar dir-card__avatar--pharmacy">
        <FaLogo />
      </div>
      <div className="dir-card__body">
        <div className="dir-card__name">{displayName}</div>
        <div className="dir-card__detail">
          <span className="dir-card__badge dir-card__badge--branch">Farmacias del Ahorro</span>
        </div>
        <div className="dir-card__meta">
          <EnvironmentOutlined /> <span>{address}</span>
        </div>
        {contact !== 'Sin contacto' && (
          <div className="dir-card__meta">
            <PhoneOutlined /> <span>{contact}</span>
          </div>
        )}
      </div>
      <div className="dir-card__actions" onClick={(e) => e.stopPropagation()}>
        <button className="dir-action dir-action--primary dir-action--full" onClick={() => onAction({ key: 'visitar' })}>
          <CalendarOutlined /> <span>Agendar Visita</span>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DIRECTORY PAGE
   ═══════════════════════════════════════════════════════ */
export function DirectoryPage() {
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('medicos');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [doctors, setDoctors] = useState([]);
  const [doctorCount, setDoctorCount] = useState(0);
  const [branches, setBranches] = useState([]);

  const [hospitals, setHospitals] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allMunicipalities, setAllMunicipalities] = useState([]);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    hospital: undefined,
    especialidad: undefined,
    categoria: undefined,
    departamento: undefined,
    municipio: undefined,
    nombre: ''
  });

  const debouncedSearch = useDebouncedValue(filters.nombre, 350);
  const [isReady, setIsReady] = useState(false);

  // Computed: municipalities filtered by selected department
  const filteredMunicipalities = useMemo(() => {
    if (!filters.departamento) return allMunicipalities;
    return allMunicipalities.filter((m) => m.departamentoId === filters.departamento);
  }, [allMunicipalities, filters.departamento]);

  const loadInitialData = async () => {
    setLoadingInitial(true);
    try {
      const [counts, hosp, spec, cats, depts, munis] = await Promise.allSettled([
        directoryService.getDoctorsCount(),
        directoryService.getHospitals(),
        directoryService.getSpecialties(),
        directoryService.getCategories(),
        directoryService.getDepartments(),
        directoryService.getMunicipalities()
      ]);
      if (counts.status === 'fulfilled') setDoctorCount(counts.value.total || 0);
      if (hosp.status === 'fulfilled') setHospitals(hosp.value.items || []);
      if (spec.status === 'fulfilled') setSpecialties(spec.value.items || []);
      if (cats.status === 'fulfilled') setCategories(cats.value.items || []);
      if (depts.status === 'fulfilled') setDepartments(depts.value.items || []);
      if (munis.status === 'fulfilled') setAllMunicipalities(munis.value.items || []);
      setIsReady(true);
    } finally {
      setLoadingInitial(false);
    }
  };

  const loadData = async () => {
    setLoadingData(true);
    try {
      if (activeTab === 'medicos') {
        const response = await directoryService.getDoctors({ ...filters, nombre: debouncedSearch });
        setDoctors(response.medicos || []);
      } else {
        const response = await directoryService.getBranches({ nombre: debouncedSearch });
        setBranches(response.sucursales || []);
      }
      setPage(1);
    } catch (error) {
      messageApi.error(formatApiError(error));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => {
    if (isReady) loadData();
  }, [isReady, activeTab, debouncedSearch, filters.hospital, filters.especialidad, filters.categoria, filters.departamento, filters.municipio]);

  const currentList = activeTab === 'medicos' ? doctors : branches;
  const paginatedList = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return currentList.slice(start, start + PAGE_SIZE);
  }, [currentList, page]);

  const isLoading = loadingData || loadingInitial;

  return (
    <div className="dir-page">
      {contextHolder}

      {/* ── Stats Bar ── */}
      <div className="dir-stats-bar">
        <div className="dir-stat">
          <div className="dir-stat__icon">
            <TeamOutlined />
          </div>
          <div className="dir-stat__content">
            <span className="dir-stat__value">{doctorCount}</span>
            <span className="dir-stat__label">Médicos</span>
          </div>
        </div>
        <div className="dir-stat">
          <div className="dir-stat__icon dir-stat__icon--blue">
            <ShopOutlined />
          </div>
          <div className="dir-stat__content">
            <span className="dir-stat__value">{branches.length || '—'}</span>
            <span className="dir-stat__label">Sucursales</span>
          </div>
        </div>
        <div className="dir-stat">
          <div className="dir-stat__icon dir-stat__icon--green">
            <BankOutlined />
          </div>
          <div className="dir-stat__content">
            <span className="dir-stat__value">{hospitals.length || '—'}</span>
            <span className="dir-stat__label">Hospitales</span>
          </div>
        </div>
        <div className="dir-stat">
          <div className="dir-stat__icon dir-stat__icon--purple">
            <UserOutlined />
          </div>
          <div className="dir-stat__content">
            <span className="dir-stat__value">{specialties.length || '—'}</span>
            <span className="dir-stat__label">Especialidades</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="dir-toolbar">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key); setPage(1); }}
          className="dir-tabs"
          items={[
            { key: 'medicos', label: <span><UserOutlined style={{ marginRight: 6 }} />Médicos</span> },
            { key: 'sucursales', label: <span><ShopOutlined style={{ marginRight: 6 }} />Sucursales</span> }
          ]}
        />
        <div className="dir-filters">
          <div className="dir-search-box">
            <SearchOutlined className="dir-search-icon" />
            <input
              className="dir-search-input"
              placeholder={activeTab === 'medicos' ? 'Buscar médico por nombre...' : 'Buscar sucursal...'}
              value={filters.nombre}
              onChange={(e) => setFilters((c) => ({ ...c, nombre: e.target.value }))}
            />
          </div>
          {activeTab === 'medicos' && (
            <>
              <AppSelect
                allowClear
                placeholder="Hospital / Clínica"
                options={hospitals}
                value={filters.hospital}
                onChange={(val) => setFilters((c) => ({ ...c, hospital: val }))}
                style={{ width: 180 }}
              />
              <AppSelect
                allowClear
                placeholder="Especialidad"
                options={specialties}
                value={filters.especialidad}
                onChange={(val) => setFilters((c) => ({ ...c, especialidad: val }))}
                style={{ width: 180 }}
              />
              <AppSelect
                allowClear
                placeholder="Categoría"
                options={categories}
                value={filters.categoria}
                onChange={(val) => setFilters((c) => ({ ...c, categoria: val }))}
                style={{ width: 160 }}
              />
              <AppSelect
                allowClear
                placeholder="Departamento"
                options={departments}
                value={filters.departamento}
                onChange={(val) => setFilters((c) => ({ ...c, departamento: val, municipio: undefined }))}
                style={{ width: 180 }}
              />
              <AppSelect
                allowClear
                placeholder="Municipio"
                options={filteredMunicipalities}
                value={filters.municipio}
                onChange={(val) => setFilters((c) => ({ ...c, municipio: val }))}
                style={{ width: 180 }}
                disabled={!filters.departamento}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Cards Grid ── */}
      <div className="dir-grid-container">
        {isLoading ? (
          <div className="dir-loading">
            <Spin size="large" />
            <Typography.Text className="dir-loading-text">Cargando directorio...</Typography.Text>
          </div>
        ) : currentList.length === 0 ? (
          <Empty
            description={`No se encontraron ${activeTab === 'medicos' ? 'médicos' : 'sucursales'}`}
            className="dir-empty"
          />
        ) : (
          <>
            <div className="dir-grid">
              {paginatedList.map((item, index) =>
                activeTab === 'medicos' ? (
                  <DoctorCard
                    key={item.codigoMedico || index}
                    item={item}
                    onAction={(action) => {
                      if (action.key === 'ficha') navigate(`/directorio/ficha/${item.codigoMedico}`);
                      if (action.key === 'historial') navigate(`/directorio/historial/${item.codigoMedico}`);
                      if (action.key === 'visitar') navigate('/calendario', { state: { openScheduler: true, targetId: item.codigoMedico } });
                    }}
                  />
                ) : (
                  <BranchCard
                    key={item.codigoSucursal || index}
                    item={item}
                    onAction={(action) => {
                      if (action.key === 'visitar') navigate('/calendario', { state: { openScheduler: true, targetId: item.codigoSucursal, isBranch: true } });
                    }}
                  />
                )
              )}
            </div>

            <div className="dir-pagination">
              <Typography.Text className="dir-pagination-info">
                Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, currentList.length)}–{Math.min(page * PAGE_SIZE, currentList.length)} de {currentList.length}
              </Typography.Text>
              <Pagination
                current={page}
                total={currentList.length}
                pageSize={PAGE_SIZE}
                onChange={setPage}
                showSizeChanger={false}
                size="small"
              />
            </div>
          </>
        )}
      </div>

      <style>{`
        /* ═══ PAGE ═══ */
        .dir-page { display: flex; flex-direction: column; gap: 20px; }

        /* ═══ STATS BAR ═══ */
        .dir-stats-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .dir-stat {
          background: white;
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid var(--border-default);
          transition: all var(--duration-normal) var(--ease-out);
        }

        .dir-stat:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }

        .dir-stat__icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          background: var(--adiuvo-red-light);
          color: var(--adiuvo-red);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }

        .dir-stat__icon--blue { background: #eff6ff; color: #2563eb; }
        .dir-stat__icon--green { background: #f0fdf4; color: #16a34a; }
        .dir-stat__icon--purple { background: #faf5ff; color: #7c3aed; }

        .dir-stat__content { display: flex; flex-direction: column; }
        .dir-stat__value { font-size: 24px; font-weight: 800; color: var(--text-primary); line-height: 1.1; letter-spacing: -0.5px; }
        .dir-stat__label { font-size: 12px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

        /* ═══ TOOLBAR ═══ */
        .dir-toolbar {
          background: white;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-default);
          overflow: hidden;
        }

        .dir-tabs {
          padding: 0 24px;
        }

        .dir-tabs .ant-tabs-nav {
          margin-bottom: 0 !important;
        }

        .dir-filters {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 24px;
          border-top: 1px solid var(--border-light);
          background: var(--bg-subtle);
          flex-wrap: wrap;
        }

        .dir-search-box {
          flex: 1;
          max-width: 360px;
          position: relative;
          display: flex;
          align-items: center;
        }

        .dir-search-icon {
          position: absolute;
          left: 14px;
          color: var(--text-tertiary);
          font-size: 15px;
          pointer-events: none;
        }

        .dir-search-input {
          width: 100%;
          height: 40px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          padding: 0 14px 0 40px;
          font-size: 14px;
          font-family: inherit;
          color: var(--text-primary);
          background: white;
          outline: none;
          transition: all var(--duration-fast) ease;
        }

        .dir-search-input:focus {
          border-color: var(--adiuvo-red);
          box-shadow: 0 0 0 3px var(--adiuvo-red-glow);
        }

        .dir-search-input::placeholder {
          color: var(--text-tertiary);
        }

        /* ═══ CARDS GRID ═══ */
        .dir-grid-container {
          min-height: 300px;
        }

        .dir-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
          gap: 12px;
        }

        /* ─── Card ─── */
        .dir-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: white;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
          cursor: pointer;
          transition: all var(--duration-normal) var(--ease-out);
          position: relative;
          overflow: hidden;
        }

        .dir-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: transparent;
          transition: background var(--duration-normal) var(--ease-out);
        }

        .dir-card:hover {
          border-color: rgba(232, 60, 56, 0.25);
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .dir-card:hover::before {
          background: var(--adiuvo-red);
        }

        .dir-card:active {
          transform: translateY(0);
          box-shadow: var(--shadow-sm);
        }

        .dir-card__avatar {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
          letter-spacing: 0.5px;
        }

        .dir-card__avatar--doctor {
          background: linear-gradient(135deg, var(--adiuvo-red), var(--adiuvo-red-deep));
        }

        .dir-card__avatar--pharmacy {
          background: #f0fdf4;
          border: 1px solid #d1fae5;
          padding: 6px;
        }

        .dir-card__pharmacy-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 4px;
        }

        .dir-card__body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dir-card__name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }

        .dir-card__detail {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .dir-card__badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          letter-spacing: 0.2px;
          white-space: nowrap;
        }

        .dir-card__badge--specialty {
          background: var(--adiuvo-red-light);
          color: var(--adiuvo-red);
        }

        .dir-card__badge--cat {
          background: #f0fdf4;
          color: #16a34a;
        }

        .dir-card__badge--branch {
          background: #eff6ff;
          color: #2563eb;
        }

        .dir-card__meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dir-card__meta span {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ─── Card Actions ─── */
        .dir-card__actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .dir-action {
          height: 34px;
          border-radius: var(--radius-sm);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          transition: all var(--duration-fast) ease;
        }

        .dir-action--ghost {
          width: 34px;
          background: var(--bg-subtle);
          color: var(--text-tertiary);
          border: 1px solid transparent;
        }

        .dir-action--ghost:hover {
          background: var(--adiuvo-red-light);
          color: var(--adiuvo-red);
          border-color: rgba(232, 60, 56, 0.15);
        }

        .dir-action--primary {
          padding: 0 16px;
          background: var(--adiuvo-red);
          color: white;
          box-shadow: 0 2px 6px rgba(232, 60, 56, 0.25);
        }

        .dir-action--primary:hover {
          background: var(--adiuvo-red-deep);
          box-shadow: 0 4px 12px rgba(232, 60, 56, 0.3);
          transform: translateY(-1px);
        }

        .dir-action--primary:active {
          transform: translateY(0);
        }

        .dir-action--full {
          width: 100%;
        }

        /* ═══ PAGINATION ═══ */
        .dir-pagination {
          margin-top: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: white;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
        }

        .dir-pagination-info {
          font-size: 13px;
          color: var(--text-tertiary);
        }

        /* ═══ LOADING / EMPTY ═══ */
        .dir-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 80px 0;
        }

        .dir-loading-text {
          color: var(--text-tertiary) !important;
          font-size: 14px;
        }

        .dir-empty {
          padding: 80px 0;
        }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 1024px) {
          .dir-stats-bar { grid-template-columns: repeat(2, 1fr); }
          .dir-grid { grid-template-columns: 1fr; }
        }

        @media (min-width: 1280px) {
          .dir-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 1600px) {
          .dir-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  );
}
