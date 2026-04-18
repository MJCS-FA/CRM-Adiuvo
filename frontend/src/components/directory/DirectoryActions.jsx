import {
  CalendarOutlined,
  FileTextOutlined,
  FolderOpenOutlined
} from '@ant-design/icons';

const actions = [
  {
    key: 'ficha',
    label: 'Ficha',
    icon: <FileTextOutlined />
  },
  {
    key: 'historial',
    label: 'Historial',
    icon: <FolderOpenOutlined />
  },
  {
    key: 'visitar',
    label: 'Visitar',
    icon: <CalendarOutlined />
  }
];

export function DirectoryActions({ onAction }) {
  return (
    <div className="directory-actions">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="directory-action-item"
          data-action={action.key}
          onClick={() => onAction?.(action)}
        >
          <span className="directory-action-icon">{action.icon}</span>
          <span className="directory-action-label">{action.label}</span>
        </button>
      ))}
    </div>
  );
}
