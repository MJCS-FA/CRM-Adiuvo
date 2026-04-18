import { Tag } from 'antd';

const statusConfig = {
  success: { color: 'success', label: 'Synced' },
  warning: { color: 'warning', label: 'Pending sync' },
  error: { color: 'error', label: 'Failed' },
  processing: { color: 'processing', label: 'Processing' },
  default: { color: 'default', label: 'Unknown' }
};

export function AppBadge({ status = 'default', label }) {
  const config = statusConfig[status] || statusConfig.default;

  return <Tag color={config.color}>{label || config.label}</Tag>;
}
