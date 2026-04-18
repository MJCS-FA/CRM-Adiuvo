import { Layout, Typography, message } from 'antd';
import {
  AppstoreOutlined,
  BookOutlined,
  CalendarOutlined,
  InboxOutlined,
  LogoutOutlined,
  PlaySquareOutlined
} from '@ant-design/icons';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import adiuvoLogo from '../assets/logo-adiuvo.png';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { useAuth } from '../hooks/useAuth';

const { Content } = Layout;

const navItems = [
  { key: 'dashboard', to: '/dashboard', label: 'Inicio', icon: <AppstoreOutlined /> },
  { key: 'directorio', to: '/directorio', label: 'Directorio', icon: <BookOutlined /> },
  { key: 'calendario', to: '/calendario', label: 'Agenda', icon: <CalendarOutlined /> },
  { key: 'inventario', to: '/inventario', label: 'Inventario', icon: <InboxOutlined /> },
  { key: 'multimedia', to: '/multimedia', label: 'Media', icon: <PlaySquareOutlined /> }
];

export function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const getUserInitials = () => {
    const name = user?.displayName || user?.username || 'U';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const currentPage = navItems.find((item) => location.pathname.startsWith(item.to));

  return (
    <div className="app-shell">
      {contextHolder}

      {/* ─── Top Header ─── */}
      <header className="app-top-header">
        <div className="header-left">
          <img src={adiuvoLogo} alt="Adiuvo" className="header-logo" />
          <div className="header-divider" />
          <span className="header-page-title">{currentPage?.label || 'Panel'}</span>
        </div>
        <div className="header-right">
          <div className="header-user-pill">
            <div className="header-user-avatar">{getUserInitials()}</div>
            <span className="header-user-name">
              {user?.displayName || user?.username || 'Usuario'}
            </span>
          </div>
          <button
            className="header-logout-btn"
            onClick={handleLogout}
            title="Cerrar Sesión"
          >
            <LogoutOutlined />
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <section className="app-content-area">
        <ConnectionBanner />
        <Content>
          <Outlet />
        </Content>
      </section>

      {/* ─── Bottom Navigation ─── */}
      <nav className="app-bottom-nav">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
