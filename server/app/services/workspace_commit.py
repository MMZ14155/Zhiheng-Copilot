import base64
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import bad_request, not_found
from app.models.file_version import FileVersion
from app.models.project import Project
from app.services.file_versions import FileVersionService
from app.services.snapshots import SnapshotService

logger = logging.getLogger(__name__)

WorkspaceOperation = dict[str, object]


class WorkspaceCommitService:
    @staticmethod
    def _decode_content(data: str) -> bytes:
        try:
            return base64.b64decode(data, validate=True)
        except Exception as exc:
            raise bad_request("文件内容 base64 格式错误", code="INVALID_BASE64") from exc

    @staticmethod
    async def commit(
        session: AsyncSession,
        project: Project,
        author: str,
        message: str,
        operations: list[WorkspaceOperation],
    ) -> str:
        if not operations:
            raise bad_request("工作区没有待提交的改动", code="EMPTY_WORKSPACE")

        parent = await SnapshotService.latest(session, project.id)
        modified_versions: list[FileVersion] = []

        for index, op in enumerate(operations, start=1):
            op_type = op.get("op")
            if op_type == "add":
                name = str(op.get("name", ""))
                content = WorkspaceCommitService._decode_content(str(op.get("content", "")))
                doc_type = op.get("doc_type")
                changelog = str(op.get("changelog", "") or "")
                _, fv = await FileVersionService.create_file_with_first_version(
                    session=session,
                    project_id=project.id,
                    name=name,
                    doc_type=doc_type if doc_type else None,
                    content=content,
                    uploaded_by=author,
                    changelog=changelog,
                )
                modified_versions.append(fv)
            elif op_type == "update":
                file_id = int(op.get("file_id", 0))  # type: ignore[arg-type]
                content = WorkspaceCommitService._decode_content(str(op.get("content", "")))
                changelog = str(op.get("changelog", "") or "")
                wf = await FileVersionService.get_workspace_file(session, file_id)
                if wf.is_deleted:
                    raise not_found(f"文件 {file_id} 已被删除", code="FILE_DELETED")
                fv = await FileVersionService.append_version(
                    session=session,
                    file_id=file_id,
                    content=content,
                    uploaded_by=author,
                    changelog=changelog,
                )
                modified_versions.append(fv)
            elif op_type == "remove":
                file_id = int(op.get("file_id", 0))  # type: ignore[arg-type]
                wf = await FileVersionService.get_workspace_file(session, file_id)
                if wf.is_deleted:
                    raise not_found(f"文件 {file_id} 已被删除", code="FILE_DELETED")
                wf.is_deleted = True
                session.add(wf)
                logger.info("marked workspace file deleted project_id=%s file_id=%s", project.id, file_id)
            else:
                raise bad_request(f"不支持的操作类型 {op_type}", code="INVALID_WORKSPACE_OP")

        await session.flush()
        snapshot = await SnapshotService.create_snapshot(session, project, parent, author, message)
        for fv in modified_versions:
            fv.snapshot_hash = snapshot.hash
        await session.flush()
        logger.info("workspace committed project_id=%s snapshot=%s operations=%s", project.id, snapshot.hash, len(operations))
        return snapshot.hash
