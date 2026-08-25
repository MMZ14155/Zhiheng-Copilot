import type { ProjectType } from "../api/models";

export const PROJECT_TYPES: ProjectType[] = [
  "软件销售",
  "正版化服务",
  "正版化服务+软件销售",
];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  软件销售: "软件销售",
  正版化服务: "正版化服务",
  "正版化服务+软件销售": "正版化服务+软件销售",
};

export const PROJECT_TYPE_COLORS: Record<ProjectType, string> = {
  软件销售: "#1677ff",
  正版化服务: "#52c41a",
  "正版化服务+软件销售": "#722ed1",
};
