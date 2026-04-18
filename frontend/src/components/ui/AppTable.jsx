import { Table } from 'antd';

export function AppTable(
  { className = '', pagination = { pageSize: 50, showSizeChanger: false }, ...rest }
) {
  return (
    <Table
      {...rest}
      className={`app-table ${className}`.trim()}
      pagination={pagination}
      scroll={{ x: 'max-content' }}
      size="middle"
    />
  );
}
