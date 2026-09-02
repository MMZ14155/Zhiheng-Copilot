// 风险类型与后端 risk.type 取值保持一致。
export const RISK_TYPE_MATERIAL_MISSING = "material-missing";
export const RISK_TYPE_DELIVERY_WARNING = "delivery-warning";
export const RISK_TYPE_PAYMENT_UNCLEARED = "payment-uncleared";

export const RISK_LABELS: Record<string, string> = {
  [RISK_TYPE_MATERIAL_MISSING]: "材料缺失",
  [RISK_TYPE_DELIVERY_WARNING]: "即将到期",
  [RISK_TYPE_PAYMENT_UNCLEARED]: "回款未结清",
};
