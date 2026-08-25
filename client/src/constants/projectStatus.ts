import type { ProjectListItem } from "../api/models";

export const PROJECT_STATUS_LABELS: Record<ProjectListItem["status"], string> =
  {
    active: "进行中",
    archived: "已归档",
    completed: "已完成",
  };
