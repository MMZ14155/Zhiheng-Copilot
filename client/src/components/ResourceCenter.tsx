import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiApi, ApiError, errorMessage, filesApi, projectsApi, tagsApi } from "../api";
import type {
  ProjectFile,
  ProjectListItem,
  ProjectTagSnapshot,
} from "../api/models";
import { formatDateTime, shortHash } from "../utils/format";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { ROUTES } from "../constants/routes";

type DetailState = {
  files: ProjectFile[];
  snapshots: ProjectTagSnapshot[];
  summary: string | null;
  filesError: string | null;
  snapshotsError: string | null;
  summaryError: string | null;
};

const emptyDetail: DetailState = {
  files: [],
  snapshots: [],
  summary: null,
  filesError: null,
  snapshotsError: null,
  summaryError: null,
};
const statusLabels: Record<string, string> = {
  pending: "待解析",
  processing: "解析中",
  parsed: "已解析",
  completed: "已解析",
  failed: "解析失败",
};

export default function ResourceCenter() {
  const navigate = useNavigate();
  const requestId = useRef(0);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DetailState>(emptyDetail);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const result = await projectsApi.listProjects({ page: 1, size: 100 });
      setProjects(result.items);
      setSelectedId((current) =>
        result.items.some((item) => item.id === current)
          ? current
          : (result.items[0]?.id ?? ""),
      );
    } catch (reason) {
      console.error("资料中心项目列表加载失败", reason);
      setProjectsError(errorMessage(reason, "项目列表加载失败，请稍后重试"));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    const currentRequest = ++requestId.current;
    setDetailLoading(true);
    setDetail(emptyDetail);
    const [fileResult, snapshotResult, summaryResult] = await Promise.allSettled(
      [
        filesApi.listProjectFiles(Number(projectId)),
        tagsApi.listProjectTagSnapshots(Number(projectId)),
        aiApi.getLatestSummary(Number(projectId)),
      ],
    );
    if (currentRequest !== requestId.current) return;
    let files: ProjectFile[] = [];
    let filesError: string | null = null;
    if (fileResult.status === "fulfilled") files = fileResult.value;
    else {
      console.error("资料清单加载失败", fileResult.reason);
      filesError = errorMessage(
        fileResult.reason,
        "资料清单加载失败，请稍后重试",
      );
    }
    let snapshots: ProjectTagSnapshot[] = [];
    let snapshotsError: string | null = null;
    if (snapshotResult.status === "fulfilled") {
      snapshots = snapshotResult.value;
    } else {
      console.error("版本快照加载失败", snapshotResult.reason);
      snapshotsError = errorMessage(
        snapshotResult.reason,
        "版本快照加载失败，请稍后重试",
      );
    }
    const summaryMissing =
      summaryResult.status === "rejected" &&
      summaryResult.reason instanceof ApiError &&
      summaryResult.reason.status === 404;
    if (summaryResult.status === "rejected" && !summaryMissing)
      console.error("Copilot 总结加载失败", summaryResult.reason);
    setDetail({
      files,
      snapshots,
      summary:
        summaryResult.status === "fulfilled"
          ? summaryResult.value.content
          : null,
      filesError,
      snapshotsError,
      summaryError:
        summaryResult.status === "rejected" && !summaryMissing
          ? errorMessage(
              summaryResult.reason,
              "Copilot 建议加载失败，请稍后重试",
            )
          : null,
    });
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      requestId.current += 1;
      setDetail(emptyDetail);
      setDetailLoading(false);
    }
  }, [loadDetail, selectedId]);

  const selected = projects.find((project) => project.id === selectedId);
  const fileNames = new Map(detail.files.map((file) => [file.id, file.name]));
  const retry = () => {
    if (selectedId) void loadDetail(selectedId);
  };

  return (
    <div className="resource-center">
      <aside className="resource-sidebar">
        <div className="resource-sidebar-heading">
          <h3>项目列表</h3>
          <button
            type="button"
            onClick={() => void loadProjects()}
            disabled={projectsLoading}
          >
            刷新
          </button>
        </div>
        {projectsLoading && (
          <div className="resource-state" role="status">
            正在加载项目…
          </div>
        )}
        {!projectsLoading && projectsError && (
          <State error={projectsError} onRetry={loadProjects} />
        )}
        {!projectsLoading && !projectsError && projects.length === 0 && (
          <div className="resource-state">暂无项目</div>
        )}
        {!projectsLoading &&
          !projectsError &&
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`project-item ${selectedId === project.id ? "active" : ""}`}
              onClick={() => setSelectedId(project.id)}
            >
              <span>
                <span className="project-name">{project.name}</span>
                <span className="project-meta">
                  {project.code} · {PROJECT_STATUS_LABELS[project.status]}
                </span>
              </span>
            </button>
          ))}
      </aside>
      <main className="resource-main">
        {!selected && !projectsLoading && (
          <div className="resource-state">请先选择一个项目查看资料。</div>
        )}
        {selected && (
          <>
            <div className="resource-main-header">
              <div>
                <div className="resource-main-title">{selected.name}</div>
                <div className="resource-main-subtitle">
                  {selected.code} · {PROJECT_STATUS_LABELS[selected.status]}
                </div>
              </div>
            </div>
            {detailLoading ? (
              <div className="resource-state" role="status">
                正在加载项目资料、快照与 Copilot 建议…
              </div>
            ) : (
              <>
                <div className="resource-section-heading">
                  <span>统一资料清单</span>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => navigate(ROUTES.project(selected.id))}
                  >
                    上传过程文件
                  </button>
                </div>
                {detail.filesError ? (
                  <State error={detail.filesError} onRetry={retry} />
                ) : detail.files.length === 0 ? (
                  <div className="resource-state compact">
                    暂无资料文件，上传过程文件后将在此展示。
                  </div>
                ) : (
                  <div className="doc-grid">
                    {detail.files.map((file) => (
                      <div
                        key={file.id}
                        className={`doc-card ${file.latestVersion ? "" : "missing"}`}
                      >
                        <div className="doc-card-heading">
                          <div className="name">{file.name}</div>
                          {file.isDeliverable && (
                            <span className="deliverable-badge">已升格</span>
                          )}
                        </div>
                        {file.latestVersion ? (
                          <>
                            <div className="version">
                              版本 ·{" "}
                              <span title={file.latestVersion.version}>
                                {shortHash(file.latestVersion.version)}
                              </span>
                            </div>
                            <span
                              className={`status ${file.latestVersion.parseStatus}`}
                            >
                              {statusLabels[file.latestVersion.parseStatus] ??
                                file.latestVersion.parseStatus}
                            </span>
                          </>
                        ) : (
                          <span className="status missing">缺失版本</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="resource-section-heading">
                  <span>版本快照</span>
                </div>
                {detail.snapshotsError ? (
                  <State error={detail.snapshotsError} onRetry={retry} />
                ) : detail.snapshots.length === 0 ? (
                  <div className="resource-state compact">暂无版本快照。</div>
                ) : (
                  <div className="version-timeline">
                    {detail.snapshots.map((snapshot) => (
                      <div
                        key={`${snapshot.tagName}-${snapshot.id}`}
                        className="timeline-item"
                      >
                        <div className="timeline-time">
                          {formatDateTime(snapshot.createdAt)}
                        </div>
                        <div className="timeline-title">
                          {snapshot.tagName} ·{" "}
                          {(snapshot.sourceFileId !== null
                            ? fileNames.get(snapshot.sourceFileId)
                            : undefined) ?? snapshot.name}
                        </div>
                        <div className="timeline-desc">
                          版本{" "}
                          <span title={snapshot.fileVersion}>
                            {shortHash(snapshot.fileVersion)}
                          </span>
                          {snapshot.note ? ` · ${snapshot.note}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detail.summaryError ? (
                  <div className="ai-suggestion">
                    <h4>Copilot 建议</h4>
                    <State error={detail.summaryError} onRetry={retry} />
                  </div>
                ) : detail.summary?.trim() ? (
                  <div className="ai-suggestion">
                    <h4>Copilot 建议</h4>
                    <p>{detail.summary}</p>
                  </div>
                ) : (
                  <div className="resource-state compact">
                    暂无 Copilot 建议，生成项目总结后将在此展示。
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function State({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <div className="resource-state error" role="alert">
      <p>{error}</p>
      <button type="button" onClick={() => void onRetry()}>
        重试
      </button>
    </div>
  );
}
