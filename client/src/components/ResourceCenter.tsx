import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi, ApiError, filesApi, projectsApi, tagsApi } from '../api';
import type { ProjectFile, ProjectListItem, TagSnapshot } from '../api/models';

/*
 * 待认证体系落地后恢复下列权限控制代码。
 *
 * import { canViewFile, canUploadProcessFile } from '../core/ProjectAccess';
 * import type { User, ProjectPermission } from '../core/ProjectAccess';
 * import type { WorkspaceFile } from '../types/project';
 * const currentUser: User = { id: 'u1', isAdmin: false, role: 'user' };
 * const accessProject: ProjectPermission = { managerId: selected?.manager ?? 'unknown', implementerIds: ['u1'] };
 * const dummyFile: WorkspaceFile = { id: 'dummy', name: 'dummy', path: '', versions: [], tags: [], isDeliverable: false };
 * const canUpload = canUploadProcessFile(currentUser, accessProject);
 * selected.docs.filter(() => canViewFile(currentUser, dummyFile, accessProject));
 */

type SnapshotRow = TagSnapshot & { tagName: string };
type DetailState = {
  files: ProjectFile[];
  snapshots: SnapshotRow[];
  summary: string | null;
  filesError: string | null;
  snapshotsError: string | null;
  summaryError: string | null;
};

const emptyDetail: DetailState = { files: [], snapshots: [], summary: null, filesError: null, snapshotsError: null, summaryError: null };
const errorMessage = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;
const shortHash = (value: string) => value.slice(0, 8);
const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const statusLabels: Record<string, string> = { pending: '待解析', processing: '解析中', parsed: '已解析', completed: '已解析', failed: '解析失败' };
const projectStatusLabels: Record<ProjectListItem['status'], string> = { active: '进行中', archived: '已归档', completed: '已完成' };

export default function ResourceCenter() {
  const navigate = useNavigate();
  const requestId = useRef(0);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
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
      setSelectedId((current) => result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ''));
    } catch (reason) {
      console.error('资料中心项目列表加载失败', reason);
      setProjectsError(errorMessage(reason, '项目列表加载失败，请稍后重试'));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    const currentRequest = ++requestId.current;
    setDetailLoading(true);
    setDetail(emptyDetail);
    const [fileResult, tagResult, summaryResult] = await Promise.allSettled([
      filesApi.listProjectFiles(Number(projectId)),
      tagsApi.listTags(Number(projectId)),
      aiApi.getLatestSummary(Number(projectId)),
    ]);
    if (currentRequest !== requestId.current) return;
    let files: ProjectFile[] = [];
    let filesError: string | null = null;
    if (fileResult.status === 'fulfilled') files = fileResult.value;
    else {
      console.error('资料清单加载失败', fileResult.reason);
      filesError = errorMessage(fileResult.reason, '资料清单加载失败，请稍后重试');
    }
    let snapshots: SnapshotRow[] = [];
    let snapshotsError: string | null = null;
    if (tagResult.status === 'fulfilled') {
      const results = await Promise.allSettled(tagResult.value.map(async (tag) =>
        (await tagsApi.listTagSnapshots(tag.id)).map((snapshot) => ({ ...snapshot, tagName: tag.name })),
      ));
      if (currentRequest !== requestId.current) return;
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') {
        console.error('部分版本快照加载失败', rejected.reason);
        snapshotsError = errorMessage(rejected.reason, '版本快照加载失败，请稍后重试');
      } else snapshots = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } else {
      console.error('标签列表加载失败', tagResult.reason);
      snapshotsError = errorMessage(tagResult.reason, '版本快照加载失败，请稍后重试');
    }
    const summaryMissing = summaryResult.status === 'rejected' && summaryResult.reason instanceof ApiError && summaryResult.reason.status === 404;
    if (summaryResult.status === 'rejected' && !summaryMissing) console.error('Copilot 总结加载失败', summaryResult.reason);
    setDetail({
      files,
      snapshots,
      summary: summaryResult.status === 'fulfilled' ? summaryResult.value.content : null,
      filesError,
      snapshotsError,
      summaryError: summaryResult.status === 'rejected' && !summaryMissing ? errorMessage(summaryResult.reason, 'Copilot 建议加载失败，请稍后重试') : null,
    });
    setDetailLoading(false);
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else { requestId.current += 1; setDetail(emptyDetail); setDetailLoading(false); }
  }, [loadDetail, selectedId]);

  const selected = projects.find((project) => project.id === selectedId);
  const fileNames = new Map(detail.files.map((file) => [Number(file.id), file.name]));
  const retry = () => { if (selectedId) void loadDetail(selectedId); };

  return <div className="resource-center">
    <aside className="resource-sidebar">
      <div className="resource-sidebar-heading"><h3>项目列表</h3><button type="button" onClick={() => void loadProjects()} disabled={projectsLoading}>刷新</button></div>
      {projectsLoading && <div className="resource-state" role="status">正在加载项目…</div>}
      {!projectsLoading && projectsError && <State error={projectsError} onRetry={loadProjects} />}
      {!projectsLoading && !projectsError && projects.length === 0 && <div className="resource-state">暂无项目</div>}
      {!projectsLoading && !projectsError && projects.map((project) => <button key={project.id} type="button" className={`project-item ${selectedId === project.id ? 'active' : ''}`} onClick={() => setSelectedId(project.id)}>
        <span><span className="project-name">{project.code} · {project.name}</span><span className="project-meta">{projectStatusLabels[project.status]}</span></span>
      </button>)}
    </aside>
    <main className="resource-main">
      {!selected && !projectsLoading && <div className="resource-state">请先选择一个项目查看资料。</div>}
      {selected && <>
        <div className="resource-main-header"><div><div className="resource-main-title">{selected.code} · {selected.name}</div><div className="resource-main-subtitle">状态 · {projectStatusLabels[selected.status]}</div></div></div>
        {detailLoading ? <div className="resource-state" role="status">正在加载项目资料、快照与 Copilot 建议…</div> : <>
          <div className="section-title">统一资料清单</div>
          {detail.filesError ? <State error={detail.filesError} onRetry={retry} /> : detail.files.length === 0 ? <div className="resource-state">该项目暂无资料文件</div> : <div className="doc-grid">{detail.files.map((file) => <div key={file.id} className={`doc-card ${file.latestVersion ? '' : 'missing'}`}>
            <div className="doc-card-heading"><div className="name">{file.name}</div>{file.isDeliverable && <span className="deliverable-badge">已升格</span>}</div>
            {file.latestVersion ? <><div className="version">版本 · <span title={file.latestVersion.version}>{shortHash(file.latestVersion.version)}</span></div><span className={`status ${file.latestVersion.parseStatus}`}>{statusLabels[file.latestVersion.parseStatus] ?? file.latestVersion.parseStatus}</span></> : <span className="status missing">缺失版本</span>}
          </div>)}</div>}
          <div className="resource-actions"><button type="button" onClick={() => navigate(`/projects/${selected.id}`)}>上传过程文件</button></div>
          <div className="section-title">版本快照</div>
          {detail.snapshotsError ? <State error={detail.snapshotsError} onRetry={retry} /> : detail.snapshots.length === 0 ? <div className="resource-state">该项目暂无版本快照</div> : <div className="version-timeline">{detail.snapshots.map((snapshot) => <div key={`${snapshot.tagName}-${snapshot.id}`} className="timeline-item">
            <div className="timeline-time">{formatTime(snapshot.createdAt)}</div><div className="timeline-title">{snapshot.tagName} · {fileNames.get(Number(snapshot.sourceFileId)) ?? snapshot.name}</div><div className="timeline-desc">版本 <span title={snapshot.fileVersion}>{shortHash(snapshot.fileVersion)}</span>{snapshot.note ? ` · ${snapshot.note}` : ''}</div>
          </div>)}</div>}
          <div className="ai-suggestion"><h4>🤖 Copilot 建议</h4>{detail.summaryError ? <State error={detail.summaryError} onRetry={retry} /> : <p>{detail.summary?.trim() || '暂无最新总结，生成项目总结后将在此展示建议。'}</p>}</div>
        </>}
      </>}
    </main>
  </div>;
}

function State({ error, onRetry }: { error: string; onRetry: () => void | Promise<void> }) {
  return <div className="resource-state error" role="alert"><p>{error}</p><button type="button" onClick={() => void onRetry()}>重试</button></div>;
}
