import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  ApiError,
  filesApi,
  tagsApi,
  getAuthUser,
  subscribeAuth,
} from "../api";
import type { ProjectFile, Tag, TagSnapshot, TagTypeDto } from "../api";

const tagTypes: Array<{ value: TagTypeDto; label: string }> = [
  { value: "demo", label: "演示" },
  { value: "report", label: "报告" },
  { value: "meeting", label: "会议" },
  { value: "audit", label: "审计" },
  { value: "custom", label: "自定义" },
];
const errorMessage = (reason: unknown, fallback: string) =>
  reason instanceof ApiError ? reason.message : fallback;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function TagPanel({ projectId }: { projectId: number }) {
  const currentUser = useSyncExternalStore(
    subscribeAuth,
    getAuthUser,
    getAuthUser,
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<TagTypeDto>("demo");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagItems, fileItems] = await Promise.all([
        tagsApi.listTags(projectId),
        filesApi.listProjectFiles(projectId),
      ]);
      setTags(tagItems);
      setFiles(fileItems);
    } catch (reason) {
      console.error("标签数据加载失败", reason);
      setError(errorMessage(reason, "标签数据加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return setError("请输入标签名称");
    setSubmitting(true);
    setError(null);
    try {
      await tagsApi.createTag(projectId, {
        name: name.trim(),
        type,
        note: note.trim() || undefined,
      });
      setName("");
      setNote("");
      await load();
    } catch (reason) {
      console.error("标签创建失败", reason);
      setError(errorMessage(reason, "标签创建失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tag-panel">
      <div className="tag-create-form">
        <label>
          标签名称
          <input
            value={name}
            disabled={submitting}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          标签类型
          <select
            value={type}
            disabled={submitting}
            onChange={(event) => setType(event.target.value as TagTypeDto)}
          >
            {tagTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          创建人
          <input value={currentUser?.name ?? "加载中…"} disabled />
        </label>
        <label>
          备注
          <input
            value={note}
            disabled={submitting}
            onChange={(event) => setNote(event.target.value)}
            placeholder="选填"
          />
        </label>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void create()}
        >
          {submitting ? "创建中…" : "新建标签"}
        </button>
      </div>
      {loading && (
        <p className="detail-empty" role="status">
          正在加载标签…
        </p>
      )}
      {!loading && error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}
      {!loading && !error && tags.length === 0 && (
        <p className="detail-empty">暂无标签</p>
      )}
      {!loading && !error && tags.length > 0 && (
        <div className="tag-list">
          {tags.map((tag) => (
            <TagItem key={tag.id} tag={tag} files={files} />
          ))}
        </div>
      )}
    </div>
  );
}

function TagItem({ tag, files }: { tag: Tag; files: ProjectFile[] }) {
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<TagSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshots(await tagsApi.listTagSnapshots(tag.id));
    } catch (reason) {
      console.error("标签快照加载失败", reason);
      setError(errorMessage(reason, "快照加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [tag.id]);
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && snapshots === null) void loadSnapshots();
  };
  return (
    <article className="tag-item">
      <button
        type="button"
        className="tag-toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        <span>
          <strong>{tag.name}</strong>
          <small>
            {tagTypes.find((item) => item.value === tag.type)?.label ??
              tag.type}
          </small>
        </span>
        <span>{tag.createdBy}</span>
        <span>{tag.note || "无备注"}</span>
        <time>{formatDate(tag.createdAt)}</time>
        <b>{expanded ? "收起" : "展开"}</b>
      </button>
      {expanded && (
        <div className="snapshot-panel">
          <SnapshotForm
            tagId={tag.id}
            files={files}
            onCreated={loadSnapshots}
          />
          {loading && (
            <p className="detail-empty" role="status">
              正在加载快照…
            </p>
          )}
          {!loading && error && (
            <div className="inline-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void loadSnapshots()}>
                重试
              </button>
            </div>
          )}
          {!loading && !error && snapshots?.length === 0 && (
            <p className="detail-empty">暂无快照</p>
          )}
          {!loading && !error && snapshots && snapshots.length > 0 && (
            <ul className="snapshot-list">
              {snapshots.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <code title={item.fileVersion}>
                    {item.fileVersion.slice(0, 8)}
                  </code>
                  <span>{item.note || "无备注"}</span>
                  <time>{formatDate(item.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

function SnapshotForm({
  tagId,
  files,
  onCreated,
}: {
  tagId: number;
  files: ProjectFile[];
  onCreated: () => Promise<void>;
}) {
  const [fileId, setFileId] = useState("");
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chooseFile = async (value: string) => {
    setFileId(value);
    setVersions([]);
    setVersion("");
    setError(null);
    if (!value) return;
    setLoadingVersions(true);
    try {
      const options = await filesApi.listFileVersionOptions(Number(value));
      setVersions(options);
      setVersion(options[0] ?? "");
    } catch (reason) {
      console.error("文件版本加载失败", reason);
      setError(errorMessage(reason, "文件版本加载失败，请稍后重试"));
    } finally {
      setLoadingVersions(false);
    }
  };
  const submit = async () => {
    if (!fileId || !version) return setError("请选择文件及版本");
    setSubmitting(true);
    setError(null);
    try {
      await tagsApi.createTagSnapshot(tagId, {
        source_file_id: Number(fileId),
        version,
        note: note.trim() || undefined,
      });
      setNote("");
      await onCreated();
    } catch (reason) {
      console.error("快照创建失败", reason);
      setError(errorMessage(reason, "快照创建失败，请稍后重试"));
    } finally {
      setSubmitting(false);
    }
  };
  const busy = loadingVersions || submitting;
  return (
    <div className="snapshot-form">
      <select
        aria-label="选择项目文件"
        value={fileId}
        disabled={busy}
        onChange={(event) => void chooseFile(event.target.value)}
      >
        <option value="">选择文件</option>
        {files.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        aria-label="选择文件版本"
        value={version}
        disabled={busy || !fileId}
        onChange={(event) => setVersion(event.target.value)}
      >
        <option value="">
          {loadingVersions
            ? "版本加载中…"
            : versions.length
              ? "选择版本"
              : "暂无版本"}
        </option>
        {versions.map((item) => (
          <option key={item} value={item}>
            {item.slice(0, 8)}
          </option>
        ))}
      </select>
      <input
        aria-label="快照备注"
        value={note}
        disabled={busy}
        placeholder="快照备注 选填"
        onChange={(event) => setNote(event.target.value)}
      />
      <button
        type="button"
        disabled={busy || !fileId || !version}
        onClick={() => void submit()}
      >
        {submitting ? "添加中…" : "添加快照"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
