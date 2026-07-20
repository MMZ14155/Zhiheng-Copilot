import type { RiskLevel } from '../types';

interface FilterItem {
  key: RiskLevel | 'all';
  label: string;
  count: number;
  riskClass: string;
}

interface RiskFilterProps {
  blockCount: number;
  warnCount: number;
  okCount: number;
  totalCount: number;
  active: RiskLevel | 'all';
  onChange: (risk: RiskLevel | 'all') => void;
}

export default function RiskFilter({
  blockCount,
  warnCount,
  okCount,
  totalCount,
  active,
  onChange,
}: RiskFilterProps) {
  const items: FilterItem[] = [
    { key: 'block', label: '阻塞级项目', count: blockCount, riskClass: 'block' },
    { key: 'warn', label: '预警级项目', count: warnCount, riskClass: 'warn' },
    { key: 'ok', label: '健康级项目', count: okCount, riskClass: 'ok' },
    { key: 'all', label: '项目总数', count: totalCount, riskClass: '' },
  ];

  const handleClick = (key: RiskLevel | 'all') => {
    onChange(active === key ? 'all' : key);
  };

  return (
    <div className="risk-filter">
      {items.map((item) => (
        <div
          key={item.key}
          className={`stat-card ${active === item.key ? 'active ' + item.riskClass : ''}`}
          onClick={() => handleClick(item.key)}
          title={item.key === 'all' ? '点击显示全部项目' : `点击只看${item.label}`}
        >
          <div className="label">{item.label}</div>
          <div className={`value ${item.riskClass || ''}`}>{item.count}</div>
        </div>
      ))}
    </div>
  );
}
