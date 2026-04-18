import { Input } from 'antd';

export function AppInput({ type = 'text', className = '', ...rest }) {
  if (type === 'textarea') {
    return <Input.TextArea {...rest} className={`app-input ${className}`.trim()} autoSize={{ minRows: 3, maxRows: 6 }} />;
  }

  if (type === 'password') {
    return <Input.Password {...rest} className={`app-input ${className}`.trim()} />;
  }

  return <Input {...rest} type={type} className={`app-input ${className}`.trim()} />;
}
