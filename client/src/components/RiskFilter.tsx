import type { RiskLevel } from '../types';

export type RiskBoardFilter = RiskLevel | 'delivery' | 'payment' | 'incomplete' | 'all';

interface FilterItem {
  key: RiskBoardFilter;
  label: string;
  count: number;
  riskClass: string;
}

interface RiskFilterProps {
  blockCount: number;
  warnCount: number;
  okCount: number;
  totalCount: number;
  deliveryCount: number;
  paymentCount: number;
  incompleteCount: number;
  active: RiskBoardFilter;
  onChange: (risk: RiskBoardFilter) => void;
}

export default function RiskFilter({
  blockCount,
  warnCount,
  okCount,
  totalCount,
  deliveryCount,
  paymentCount,
  incompleteCount,
  active,
  onChange,
}: RiskFilterProps) {
  const items: FilterItem[] = [
    { key: 'all', label: '全部', count: totalCount, riskClass: '' },
    { key: 'block', label: '阻塞', count: blockCount, riskClass: 'block' },
    { key: 'warn', label: '预警', count: warnCount, riskClass: 'warn' },
    { key: 'ok', label: '健康', count: okCount, riskClass: 'ok' },
    { key: 'delivery', label: '到期', count: deliveryCount, riskClass: 'delivery' },
    { key: 'payment', label: '逾期', count: paymentCount, riskClass: 'payment' },
    { key: 'incomplete', label: '缺数据', count: incompleteCount, riskClass: 'incomplete' },
  ];

  const handleClick = (key: RiskBoardFilter) => {
    onChange(active === key ? 'all' : key);
  };

  return (
    <div className="risk-filter">
      {items.map((item) => (
        <button type="button"
          key={item.key}
          className={`stat-card ${active === item.key ? 'active ' + item.riskClass : ''}`}
          onClick={() => handleClick(item.key)}
          title={item.key === 'all' ? '点击显示全部项目' : `点击只看${item.label}`}
        >
          <div className="label">{item.label}</div>
          <div className={`value ${item.riskClass || ''}`}>{item.count}</div>
        </button>
      ))}
    </div>
  );
}
