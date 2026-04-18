import { Alert } from 'antd';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function ConnectionBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      message="Estas offline"
      description="Puedes seguir usando la app y tus cambios se sincronizaran cuando vuelva la conexion."
      style={{ marginBottom: 12 }}
    />
  );
}
