import { useCallback, useEffect, useState } from "react";
import { deliverablesApi, errorMessage } from "../api";
import type { TrackedFile } from "../api";
import { Alert, Button } from "./ui";
import "./PaymentCollectionList.css";

const EMPTY: TrackedFile = {
  id: "",
  sourceFileId: null,
  name: "",
  category: "回款",
  required: false,
  currentVersion: null,
  status: "ok",
  versions: [],
  paymentStatus: "未付款",
  receivableAmount: "",
  receivedAmount: "",
  paymentDate: "",
  remarks: "",
};

const PAYMENT_NAMES = ["首款", "尾款", "全款"];
const PAYMENT_STATUSES = ["未付款", "已付款"];

type Draft = {
  name: string;
  paymentStatus: string;
  receivedAmount: string;
  paymentDate: string;
  remarks: string;
};

function toDraft(item: TrackedFile): Draft {
  return {
    name: item.name,
    paymentStatus: PAYMENT_STATUSES.includes(item.paymentStatus ?? "")
      ? (item.paymentStatus as string)
      : "未付款",
    receivedAmount: item.receivedAmount ?? "",
    paymentDate: item.paymentDate ?? "",
    remarks: item.remarks ?? "",
  };
}

function derivePaymentStatus(items: TrackedFile[]): string {
  if (items.length === 0) return "未付款";
  const paidNames = new Set(
    items.filter((i) => i.paymentStatus === "已付款").map((i) => i.name),
  );
  if (paidNames.has("全款")) return "已付全款";
  if (paidNames.has("首款") && paidNames.has("尾款")) return "已付全款";
  if (paidNames.has("首款")) return "已付首款";
  return "未付款";
}

export default function PaymentCollectionList({
  projectId,
  contractAmount,
}: {
  projectId: number;
  contractAmount: number | null;
}) {
  const [items, setItems] = useState<TrackedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(EMPTY));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await deliverablesApi.listTrackedFiles(projectId);
      setItems(data.filter((item) => item.category === "回款"));
    } catch (reason) {
      console.error("回款清单加载失败", reason);
      setError(errorMessage(reason, "回款清单加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setEditingId("__new__");
    setDraft(toDraft(EMPTY));
  };

  const startEdit = (item: TrackedFile) => {
    setEditingId(item.id);
    setDraft(toDraft(item));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        category: "回款" as const,
        payment_status: draft.paymentStatus || null,
        received_amount: draft.receivedAmount || null,
        payment_date: draft.paymentDate || null,
        remarks: draft.remarks || null,
      };
      if (editingId === "__new__") {
        await deliverablesApi.createTrackedFile(projectId, body);
      } else {
        await deliverablesApi.updateTrackedFile(Number(editingId), body);
      }
      setEditingId(null);
      await load();
    } catch (reason) {
      console.error("保存回款记录失败", reason);
      setError(errorMessage(reason, "保存失败，请稍后重试"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条回款记录吗？")) return;
    try {
      await deliverablesApi.deleteTrackedFile(Number(id));
      await load();
    } catch (reason) {
      console.error("删除回款记录失败", reason);
      setError(errorMessage(reason, "删除失败，请稍后重试"));
    }
  };

  const renderCell = (item: TrackedFile) => {
    const isEditing = editingId === item.id;
    const value = isEditing ? draft : toDraft(item);
    const update = (patch: Partial<Draft>) => {
      if (!isEditing) return;
      setDraft((prev) => ({ ...prev, ...patch }));
    };
    return (
      <tr key={item.id}>
        <td>
          {isEditing ? (
            <select
              value={value.name}
              onChange={(e) => update({ name: e.target.value })}
            >
              <option value="">请选择</option>
              {PAYMENT_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            item.name || "-"
          )}
        </td>
        <td>
          {isEditing ? (
            <select
              value={value.paymentStatus || "未付款"}
              onChange={(e) => update({ paymentStatus: e.target.value })}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            item.paymentStatus ?? "未付款"
          )}
        </td>
        <td>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={value.receivedAmount}
              onChange={(e) => update({ receivedAmount: e.target.value })}
              placeholder="金额"
            />
          ) : (
            item.receivedAmount || item.receivableAmount || "-"
          )}
        </td>
        <td>
          {isEditing ? (
            <input
              type="date"
              value={value.paymentDate}
              onChange={(e) => update({ paymentDate: e.target.value })}
            />
          ) : (
            item.paymentDate ?? "-"
          )}
        </td>
        <td>
          {isEditing ? (
            <input
              value={value.remarks}
              onChange={(e) => update({ remarks: e.target.value })}
              placeholder="备注"
            />
          ) : (
            item.remarks ?? "-"
          )}
        </td>
        <td className="payment-actions">
          {isEditing ? (
            <>
              <Button
                variant="primary"
                onClick={() => void handleSave()}
                disabled={saving || !value.name.trim()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
              <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => startEdit(item)}>
                编辑
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleDelete(item.id)}
              >
                删除
              </Button>
            </>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="payment-collection-list">
      {error && <Alert>{error}</Alert>}
      <p className="payment-summary">
        合同金额：{contractAmount === null ? "—" : `${contractAmount} 元`} 状态：
        {derivePaymentStatus(items)}
      </p>
      {loading && items.length === 0 ? (
        <p>加载中…</p>
      ) : (
        <table className="payment-collection-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>状态</th>
              <th>金额</th>
              <th>日期</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(renderCell)}
            {editingId === "__new__" && renderCell({ ...EMPTY, id: "__new__" })}
          </tbody>
        </table>
      )}
      {editingId !== "__new__" && (
        <Button variant="primary" onClick={startCreate}>
          + 新增回款记录
        </Button>
      )}
    </div>
  );
}
