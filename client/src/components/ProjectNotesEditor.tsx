import { useState } from "react";
import { projectsApi } from "../api";
import { Button, Modal } from "./ui";

interface ProjectNotesEditorProps {
  projectId: number;
  notes: string | null;
  canEdit: boolean;
  onUpdate: (notes: string | null) => void;
}

export default function ProjectNotesEditor({
  projectId,
  notes,
  canEdit,
  onUpdate,
}: ProjectNotesEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setDraft(notes ?? "");
    setIsEditing(true);
  };

  const closeEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmed = draft.trim() || null;
      await projectsApi.updateProjectNotes(projectId, trimmed);
      onUpdate(trimmed);
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-notes-editor">
      <div className="project-notes-header">
        <h4>备注</h4>
        {canEdit && (
          <Button variant="secondary" type="button" onClick={openEdit}>
            编辑备注
          </Button>
        )}
      </div>
      {notes ? (
        <p className="project-notes-body detail-wrap">{notes}</p>
      ) : (
        <p className="project-notes-empty detail-wrap">暂无备注</p>
      )}

      {isEditing && (
        <Modal
          title="编辑项目备注"
          onClose={closeEdit}
          footer={
            <>
              <Button
                variant="secondary"
                type="button"
                disabled={saving}
                onClick={closeEdit}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <textarea
            className="project-notes-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={8}
            maxLength={10000}
            placeholder="填写项目备注..."
          />
        </Modal>
      )}
    </div>
  );
}
