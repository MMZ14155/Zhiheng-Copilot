import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  projectsApi,
  type ProjectDetail,
  type ProjectParty,
  type ProjectUpdateDto,
} from "../api";
import { PROJECT_STATUS_LABELS } from "../constants/projectStatus";
import { PROJECT_TYPES } from "../constants/projectTypes";
import { Button, Modal } from "../components/ui";
import "../components/CreateProjectModal.css";

type Field =
  | "name"
  | "customerName"
  | "projectType"
  | "contractAmount"
  | "signedDate"
  | "startedDate"
  | "plannedDeliveryDate"
  | "progress"
  | "status";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = "请输入项目名称";
  if (!values.customerName.trim()) errors.customerName = "请输入客户名称";
  if (
    values.contractAmount &&
    (!Number.isFinite(Number(values.contractAmount)) ||
      Number(values.contractAmount) <= 0)
  )
    errors.contractAmount = "合同金额必须大于 0";
  if (
    values.progress &&
    (!Number.isFinite(Number(values.progress)) ||
      Number(values.progress) < 0 ||
      Number(values.progress) > 100)
  )
    errors.progress = "进度必须在 0 到 100 之间";
  if (values.signedDate && values.startedDate && values.signedDate > values.startedDate)
    errors.startedDate = "启动日期不能早于签约日期";
  if (
    values.startedDate &&
    values.plannedDeliveryDate &&
    values.startedDate > values.plannedDeliveryDate
  )
    errors.plannedDeliveryDate = "计划交付日期不能早于启动日期";
  if (
    !values.startedDate &&
    values.signedDate &&
    values.plannedDeliveryDate &&
    values.signedDate > values.plannedDeliveryDate
  )
    errors.plannedDeliveryDate = "计划交付日期不能早于签约日期";
  return errors;
}

export default function ProjectBasicInfoEditor({
  project,
  isOpen,
  onClose,
  onSaved,
}: {
  project: ProjectDetail;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initialValues = useMemo<Values>(
    () => ({
      name: project.name ?? "",
      customerName: project.customerName ?? "",
      projectType: project.projectType ?? "",
      contractAmount:
        project.contractAmount === null ? "" : String(project.contractAmount),
      signedDate: project.signedDate ?? "",
      startedDate: project.startedDate ?? "",
      plannedDeliveryDate: project.plannedDeliveryDate ?? "",
      progress: String(project.progress ?? 0),
      status: project.status ?? "active",
    }),
    [project],
  );
  const initialParties = useMemo<ProjectParty[]>(
    () =>
      project.parties.map((party) => ({
        role: party.role,
        name: party.name,
        contact: party.contact,
      })),
    [project],
  );
  const [values, setValues] = useState<Values>(initialValues);
  const [parties, setParties] = useState<ProjectParty[]>(initialParties);
  const [errors, setErrors] = useState<Errors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: Field, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const updateParty = (
    index: number,
    field: keyof ProjectParty,
    value: string,
  ) =>
    setParties((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  const reset = () => {
    setValues(initialValues);
    setParties(initialParties);
    setErrors({});
    setApiError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setApiError(null);
    if (Object.keys(nextErrors).length) return;

    const body: ProjectUpdateDto = {
      name: values.name.trim(),
      customer_name: values.customerName.trim(),
      project_type: values.projectType
        ? (values.projectType as ProjectUpdateDto["project_type"])
        : null,
      contract_amount: values.contractAmount
        ? Number(values.contractAmount)
        : null,
      signed_date: values.signedDate || null,
      started_date: values.startedDate || null,
      planned_delivery_date: values.plannedDeliveryDate || null,
      progress: values.progress ? Number(values.progress) : 0,
      status: values.status as ProjectUpdateDto["status"],
      parties: parties
        .map((party) => ({
          role: party.role.trim(),
          name: party.name.trim(),
          contact: party.contact?.trim() || null,
        }))
        .filter((party) => party.role || party.name || party.contact),
    };

    setSubmitting(true);
    try {
      await projectsApi.updateProject(Number(project.id), body);
      await onSaved();
      handleClose();
    } catch (reason) {
      console.error("项目信息更新失败", reason);
      setApiError(
        reason instanceof ApiError
          ? reason.message
          : "项目信息更新失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      title="编辑项目基础信息"
      onClose={handleClose}
      footer={
        <>
          <Button
            variant="secondary"
            type="button"
            disabled={submitting}
            onClick={handleClose}
          >
            取消
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="basic-info-form"
            disabled={submitting}
          >
            {submitting ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <form id="basic-info-form" onSubmit={(event) => void submit(event)} noValidate>
        {apiError && (
          <div className="form-submit-error" role="alert">
            {apiError}
          </div>
        )}
        <div className="project-form-grid">
          <Field label="项目名称" required error={errors.name}>
            <input
              value={values.name}
              onChange={(event) => setField("name", event.target.value)}
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="客户名称" required error={errors.customerName}>
            <input
              value={values.customerName}
              onChange={(event) =>
                setField("customerName", event.target.value)
              }
              maxLength={200}
            />
          </Field>
          <Field label="项目类型">
            <select
              value={values.projectType}
              onChange={(event) =>
                setField("projectType", event.target.value)
              }
            >
              <option value="">请选择</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="项目状态">
            <select
              value={values.status}
              onChange={(event) => setField("status", event.target.value)}
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
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
              onChange={(event) =>
                setField("contractAmount", event.target.value)
              }
            />
          </Field>
          <Field label="进度" error={errors.progress}>
            <input
              type="number"
              min="0"
              max="100"
              value={values.progress}
              onChange={(event) => setField("progress", event.target.value)}
            />
          </Field>
          <Field label="签约日期">
            <input
              type="date"
              value={values.signedDate}
              onChange={(event) => setField("signedDate", event.target.value)}
            />
          </Field>
          <Field label="启动日期" error={errors.startedDate}>
            <input
              type="date"
              value={values.startedDate}
              onChange={(event) =>
                setField("startedDate", event.target.value)
              }
            />
          </Field>
          <Field label="计划交付日期" error={errors.plannedDeliveryDate}>
            <input
              type="date"
              value={values.plannedDeliveryDate}
              onChange={(event) =>
                setField("plannedDeliveryDate", event.target.value)
              }
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
                setParties((rows) => [
                  ...rows,
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
          {parties.map((party, index) => (
            <div className="party-row" key={index}>
              <label>
                角色
                <input
                  value={party.role}
                  onChange={(event) =>
                    updateParty(index, "role", event.target.value)
                  }
                />
              </label>
              <label>
                名称
                <input
                  value={party.name}
                  onChange={(event) =>
                    updateParty(index, "name", event.target.value)
                  }
                />
              </label>
              <label>
                联系方式
                <input
                  value={party.contact ?? ""}
                  onChange={(event) =>
                    updateParty(index, "contact", event.target.value)
                  }
                />
              </label>
              <button
                type="button"
                aria-label={`删除第 ${index + 1} 个签约方`}
                onClick={() =>
                  setParties((rows) => rows.filter((_, i) => i !== index))
                }
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </form>
    </Modal>
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
