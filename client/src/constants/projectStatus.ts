import type { ProjectListItem } from "../api/models";

export const PROJECT_STATUS_LABELS: Record<ProjectListItem["status"], string> = {
  项目启动: "项目启动",
  合同签署: "合同签署",
  已开票: "已开票",
  首款已付: "首款已付",
  尾款已付: "尾款已付",
  全款已付: "全款已付",
  项目结项: "项目结项",
};
