import type { RiskLevel } from "../api";

export type RiskBoardFilter =
  RiskLevel | "material" | "delivery" | "payment" | "all";

interface FilterItem {
  key: RiskBoardFilter;
  label: string;
  count: number;
  riskClass: string;
}

interface RiskFilterProps {
  materialCount: number;
  deliveryCount: number;
  paymentCount: number;
  totalCount: number;
  active: RiskBoardFilter;
  onChange: (risk: RiskBoardFilter) => void;
}

export default function RiskFilter({
  materialCount,
  deliveryCount,
  paymentCount,
  totalCount,
  active,
  onChange,
}: RiskFilterProps) {
  const items: FilterItem[] = [
    { key: "all", label: "全部", count: totalCount, riskClass: "" },
    {
      key: "material",
      label: "材料缺失",
      count: materialCount,
      riskClass: "material",
    },
    {
      key: "delivery",
      label: "即将到期",
      count: deliveryCount,
      riskClass: "delivery",
    },
    {
      key: "payment",
      label: "回款未结清",
      count: paymentCount,
      riskClass: "payment",
    },
  ];

  const handleClick = (key: RiskBoardFilter) => {
    onChange(active === key ? "all" : key);
  };

  return (
    <div className="risk-filter">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={`stat-card${item.count === 0 ? " zero" : ""}${active === item.key ? " active " + item.riskClass : ""}`}
          onClick={() => handleClick(item.key)}
          title={
            item.key === "all" ? "点击显示全部项目" : `点击只看${item.label}`
          }
        >
          <div className="label">{item.label}</div>
          <div className={`value ${item.riskClass || ""}`}>{item.count}</div>
        </button>
      ))}
    </div>
  );
}
