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
  paymentStatus: "未回款",
  receivableAmount: "",
  receivedAmount: "",
  paymentDate: "",
  remarks: "",
};

type Draft = {
  name: string;
  paymentStatus: string;
  receivableAmount: string;
  receivedAmount: string;
  paymentDate: string;
  remarks: string;
};

function toDraft(item: TrackedFile): Draft {
  return {
    name: item.name,
    paymentStatus: item.paymentStatus ?? "",
    receivableAmount: item.receivableAmount ?? "",
    receivedAmount: item.receivedAmount ?? "",
    paymentDate: item.paymentDate ?? "",
    remarks: item.remarks ?? "",
  };
}

export default function PaymentCollectionList({
  projectId,
}: {
  projectId: number;
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
        receivable_amount: draft.receivableAmount || null,
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
            <input
              value={value.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="名称"
            />
          ) : (
            item.name
          )}
        </td>
        <td>
          {isEditing ? (
            <select
              value={value.paymentStatus || "未回款"}
              onChange={(e) => update({ paymentStatus: e.target.value })}
            >
              <option value="未回款">未回款</option>
              <option value="部分回款">部分回款</option>
              <option value="已回款">已回款</option>
            </select>
          ) : (
            item.paymentStatus ?? "未回款"
          )}
        </td>
        <td>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={value.receivableAmount}
              onChange={(e) => update({ receivableAmount: e.target.value })}
              placeholder="应收金额"
            />
          ) : (
            item.receivableAmount ?? "-"
          )}
        </td>
        <td>
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={value.receivedAmount}
              onChange={(e) => update({ receivedAmount: e.target.value })}
              placeholder="已收金额"
            />
          ) : (
            item.receivedAmount ?? "-"
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
      {loading && items.length === 0 ? (
        <p>加载中…</p>
      ) : (
        <table className="payment-collection-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>回款状态</th>
              <th>应收金额</th>
              <th>已收金额</th>
              <th>回款日期</th>
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
