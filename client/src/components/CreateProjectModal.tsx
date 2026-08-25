import {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ApiError,
  aiApi,
  projectsApi,
  type ProjectDraft,
  type ProjectListItem,
  type ProjectPartyDto,
  type ProjectTypeDto,
  type ProjectWriteDto,
} from "../api";
import { PROJECT_TYPES } from "../constants/projectTypes";
import "./CreateProjectModal.css";

type Field =
  | "name"
  | "customerName"
  | "projectType"
  | "contractAmount"
  | "signedDate"
  | "startedDate"
  | "deliveryDate"
  | "progress"
  | "notes";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;
type Mode = "ai" | "manual";
const initial: Values = {
  name: "",
  customerName: "",
  projectType: "",
  contractAmount: "",
  signedDate: "",
  startedDate: "",
  deliveryDate: "",
  progress: "",
  notes: "",
};

// 与现有上传入口（ProcessFiles）保持同一 accept 口径。
const CONTRACT_ACCEPT = ".pdf,.docx,.xlsx,.jpg,.jpeg,.png";
const MISSING_FIELD_LABELS: Record<string, string> = {
  name: "项目名称",
  customer_name: "客户名称",
  parties: "签约方",
  contract_amount: "合同金额",
  signed_date: "签约日期",
  started_date: "启动日期",
  planned_delivery_date: "计划交付日期",
  project_type: "项目类型",
  notes: "备注",
};

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = "请输入项目名称";
  if (!v.customerName.trim()) e.customerName = "请输入客户名称";
  if (
    v.contractAmount &&
    (!Number.isFinite(Number(v.contractAmount)) ||
      Number(v.contractAmount) <= 0)
  )
    e.contractAmount = "合同金额必须大于 0";
  if (
    v.progress &&
    (!Number.isFinite(Number(v.progress)) ||
      Number(v.progress) < 0 ||
      Number(v.progress) > 100)
  )
    e.progress = "进度必须在 0 到 100 之间";
  if (v.signedDate && v.startedDate && v.signedDate > v.startedDate)
    e.startedDate = "启动日期不能早于签约日期";
  if (v.startedDate && v.deliveryDate && v.startedDate > v.deliveryDate)
    e.deliveryDate = "计划交付日期不能早于启动日期";
  if (
    !v.startedDate &&
    v.signedDate &&
    v.deliveryDate &&
    v.signedDate > v.deliveryDate
  )
    e.deliveryDate = "计划交付日期不能早于签约日期";
  return e;
}

export default function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("ai");
  const [values, setValues] = useState(initial);
  const [parties, setParties] = useState<ProjectPartyDto[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [renewalOptions, setRenewalOptions] = useState<ProjectListItem[]>([]);
  const [renewalSourceId, setRenewalSourceId] = useState<number | "">("");
  const [renewalLoading, setRenewalLoading] = useState(false);
  const busy = submitting || analyzing;

  const set = (field: Field, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose, busy]);
  useEffect(() => {
    let cancelled = false;
    setRenewalLoading(true);
    projectsApi
      .listProjects({ size: 1000 })
      .then(({ items }) => {
        if (!cancelled)
          setRenewalOptions(items.filter((p) => p.status === "active"));
      })
      .catch((reason: unknown) => {
        console.error("加载可续签项目失败", reason);
      })
      .finally(() => {
        if (!cancelled) setRenewalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const updateParty = (
    index: number,
    field: keyof ProjectPartyDto,
    value: string,
  ) =>
    setParties((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  const applyDraft = (draft: ProjectDraft) => {
    setValues((v) => ({
      ...v,
      name: draft.name ?? "",
      customerName: draft.customerName ?? "",
      projectType: draft.projectType ?? "",
      contractAmount:
        draft.contractAmount === null ? "" : String(draft.contractAmount),
      signedDate: draft.signedDate ?? "",
      startedDate: draft.startedDate ?? "",
      deliveryDate: draft.plannedDeliveryDate ?? "",
      notes: draft.notes ?? "",
    }));
    setParties(
      draft.parties.map((p) => ({
        role: p.role,
        name: p.name,
        contact: p.contact,
      })),
    );
    setErrors({});
    setApiError(null);
  };

  const analyze = async () => {
    if (!contractFile || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const draft = await aiApi.analyzeProjectDraft(contractFile);
      applyDraft(draft);
      setMissingFields(draft.missingFields);
      setAnalyzed(true);
    } catch (reason) {
      console.error("合同分析失败", reason);
      setAnalysisError(
        reason instanceof ApiError
          ? reason.message
          : "合同分析失败，请稍后重试",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = validate(values);
    setErrors(next);
    setApiError(null);
    if (Object.keys(next).length) return;
    const body: ProjectWriteDto = {
      name: values.name.trim(),
      customer_name: values.customerName.trim(),
      project_type: (values.projectType as ProjectTypeDto) || null,
      contract_amount: values.contractAmount
        ? Number(values.contractAmount)
        : null,
      signed_date: values.signedDate || null,
      started_date: values.startedDate || null,
      planned_delivery_date: values.deliveryDate || null,
      progress: values.progress ? Number(values.progress) : 0,
      notes: values.notes.trim() || null,
      parties: parties
        .map((p) => ({
          role: p.role.trim(),
          name: p.name.trim(),
          contact: p.contact?.trim() || null,
        }))
        .filter((p) => p.role || p.name || p.contact),
    };
    setSubmitting(true);
    try {
      if (renewalSourceId) {
        await projectsApi.createProjectWithRenewal(
          body,
          Number(renewalSourceId),
        );
      } else {
        await projectsApi.createProject(body);
      }
      await onCreated();
      onClose();
    } catch (reason) {
      console.error("项目创建失败", reason);
      setApiError(
        reason instanceof ApiError
          ? reason.message
          : "项目创建失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="create-project-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="create-project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <h2 id={titleId}>新建项目</h2>
            <p>填写项目基本信息，带 * 的字段为必填项。</p>
          </div>
          <button
            type="button"
            aria-label="关闭新建项目弹窗"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </header>
        <div className="mode-switch" role="tablist" aria-label="创建模式">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "ai"}
            className={mode === "ai" ? "active" : ""}
            onClick={() => setMode("ai")}
          >
            AI 合同分析
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manual"}
            className={mode === "manual" ? "active" : ""}
            onClick={() => setMode("manual")}
          >
            手动填写
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)} noValidate>
          {apiError && (
            <div className="form-submit-error" role="alert">
              {apiError}
            </div>
          )}
          {mode === "ai" && (
            <div className="ai-upload-panel">
              <label className="ai-file-picker">
                <input
                  type="file"
                  aria-label="选择合同文件"
                  accept={CONTRACT_ACCEPT}
                  disabled={analyzing}
                  onChange={(e) => {
                    setContractFile(e.target.files?.[0] ?? null);
                    setAnalysisError(null);
                  }}
                />
                <span className="ai-file-picker-icon" aria-hidden="true">
                  ⇪
                </span>
                <span className="ai-file-picker-text">
                  {contractFile
                    ? contractFile.name
                    : "点击选择合同文件（PDF / Word / 图片）"}
                </span>
              </label>
              <div className="ai-upload-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!contractFile || analyzing}
                  onClick={() => void analyze()}
                >
                  {analyzing ? "分析中…" : "开始分析"}
                </button>
                <p className="ai-hint">
                  上传合同文件后，AI 将自动识别项目信息并回填下方表单。
                </p>
              </div>
              {analyzing && (
                <div className="ai-skeleton">
                  <div className="skeleton-line short" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </div>
              )}
              {analysisError && !analyzing && (
                <div className="ai-analysis-error">
                  <span>{analysisError}</span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void analyze()}
                  >
                    重试
                  </button>
                </div>
              )}
              {analyzed &&
                !analyzing &&
                !analysisError &&
                missingFields.length > 0 && (
                  <div className="ai-missing-banner">
                    以下字段未能从合同识别，请补充：
                    {missingFields
                      .map((f) => MISSING_FIELD_LABELS[f] ?? f)
                      .join("、")}
                  </div>
                )}
              {analyzed &&
                !analyzing &&
                !analysisError &&
                !missingFields.length && (
                  <div className="ai-success-note">
                    已根据合同内容回填表单，请核对后提交。
                  </div>
                )}
            </div>
          )}
          <div className="project-form-grid">
            <Field label="项目名称" required error={errors.name}>
              <input
                autoFocus
                maxLength={200}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="客户名称" required error={errors.customerName}>
              <input
                maxLength={200}
                value={values.customerName}
                onChange={(e) => set("customerName", e.target.value)}
              />
            </Field>
            <Field label="项目类型">
              <select
                value={values.projectType}
                onChange={(e) => set("projectType", e.target.value)}
              >
                <option value="">请选择</option>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="合同金额" error={errors.contractAmount}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={values.contractAmount}
                onChange={(e) => set("contractAmount", e.target.value)}
              />
            </Field>
            <Field label="签约日期">
              <input
                type="date"
                value={values.signedDate}
                onChange={(e) => set("signedDate", e.target.value)}
              />
            </Field>
            <Field label="启动日期" error={errors.startedDate}>
              <input
                type="date"
                value={values.startedDate}
                onChange={(e) => set("startedDate", e.target.value)}
              />
            </Field>
            <Field label="计划交付日期" error={errors.deliveryDate}>
              <input
                type="date"
                value={values.deliveryDate}
                onChange={(e) => set("deliveryDate", e.target.value)}
              />
            </Field>
            <Field label="进度" error={errors.progress}>
              <input
                type="number"
                min="0"
                max="100"
                value={values.progress}
                onChange={(e) => set("progress", e.target.value)}
              />
            </Field>
          </div>
          <div className="parties-section">
            <div className="section-heading">
              <div>
                <h3>签约方</h3>
                <span>可选，支持添加多个签约方</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setParties((p) => [
                    ...p,
                    { role: "", name: "", contact: null },
                  ])
                }
              >
                + 添加签约方
              </button>
            </div>
            {!parties.length && (
              <div className="parties-empty">暂未添加签约方</div>
            )}
            {parties.map((p, i) => (
              <div className="party-row" key={i}>
                <label>
                  角色
                  <input
                    value={p.role}
                    onChange={(e) => updateParty(i, "role", e.target.value)}
                  />
                </label>
                <label>
                  名称
                  <input
                    value={p.name}
                    onChange={(e) => updateParty(i, "name", e.target.value)}
                  />
                </label>
                <label>
                  联系方式
                  <input
                    value={p.contact ?? ""}
                    onChange={(e) => updateParty(i, "contact", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`删除第 ${i + 1} 个签约方`}
                  onClick={() =>
                    setParties((rows) => rows.filter((_, j) => j !== i))
                  }
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <Field label="续签来源">
            <select
              value={renewalSourceId}
              disabled={renewalLoading}
              onChange={(e) =>
                setRenewalSourceId(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            >
              <option value="">不作为续签项目</option>
              {renewalOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {renewalSourceId !== "" && (
            <div className="form-renewal-warning">
              新创建的项目将被标记为「
              {
                renewalOptions.find((p) => p.id === String(renewalSourceId))
                  ?.name
              }
              」的续签项目。
            </div>
          )}
          <Field label="备注">
            <textarea
              rows={4}
              maxLength={10000}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              取消
            </button>
            <button className="primary-button" disabled={busy}>
              {busy ? "创建中…" : "创建项目"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`project-form-field${error ? " invalid" : ""}`}>
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
