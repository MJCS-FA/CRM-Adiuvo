import { Button } from 'antd';

const variantClassMap = {
  primary: 'app-btn-primary',
  secondary: 'app-btn-secondary',
  outline: 'app-btn-outline',
  ghost: 'app-btn-ghost',
  danger: 'app-btn-danger',
  dangerOutline: 'app-btn-danger-outline'
};

const sizeMap = {
  sm: 'small',
  md: 'middle',
  lg: 'large'
};

export function AppButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  htmlType = 'button',
  ...rest
}) {
  const classes = ['app-btn', variantClassMap[variant] || variantClassMap.primary, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Button
      {...rest}
      htmlType={htmlType}
      className={classes}
      type={variant === 'primary' ? 'primary' : 'default'}
      size={sizeMap[size] || 'middle'}
      block={fullWidth}
    />
  );
}
