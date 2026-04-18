import { Modal } from 'antd';

export function AppModal({ children, ...rest }) {
  return (
    <Modal centered destroyOnClose {...rest}>
      {children}
    </Modal>
  );
}
