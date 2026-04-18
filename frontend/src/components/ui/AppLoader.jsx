import { Spin } from 'antd';

export function AppLoader({ tip = 'Loading...', className = '' }) {
  return (
    <div className={`app-loader ${className}`.trim()}>
      <Spin size="large" tip={tip} />
    </div>
  );
}
