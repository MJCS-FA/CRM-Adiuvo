import { Card } from 'antd';

export function AppCard({ className = '', children, ...rest }) {
  return (
    <Card {...rest} className={`app-card ${className}`.trim()}>
      {children}
    </Card>
  );
}
