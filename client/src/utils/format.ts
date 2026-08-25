const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" });
const percentFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
});

export const formatMoney = (value: number) => moneyFormatter.format(value);
export const formatDateTime = (value: string) =>
  dateTimeFormatter.format(new Date(value));
export const formatDate = (value: string) =>
  dateFormatter.format(new Date(value));
export const formatPercentValue = (value: number) =>
  percentFormatter.format(value);
export const shortHash = (value: string) => value.slice(0, 8);
