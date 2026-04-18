import { Select } from 'antd';

export function AppSelect({ className = '', ...rest }) {
  return <Select {...rest} className={`app-select ${className}`.trim()} />;
}
