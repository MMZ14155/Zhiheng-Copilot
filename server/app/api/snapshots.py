from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.dependencies import get_current_user, require_project_role
from app.db.session import get_session
from app.models.file_version import FileVersion
from app.models.snapshot import Snapshot
from app.models.snapshot_entry import SnapshotEntry
from app.models.user import User
from app.schemas.snapshots import (SkippedFile, SnapshotDetailResponse, SnapshotEntryResponse,
    SnapshotRestoreResponse, SnapshotSummary, SnapshotTimelineResponse)
from app.services.snapshots import SnapshotService

router = APIRouter(tags=["snapshots"])

@router.get("/projects/{project_id}/snapshots", response_model=SnapshotTimelineResponse)
async def list_snapshots(project_id: int, session: AsyncSession = Depends(get_session),
                         user: User = Depends(get_current_user)):
    await require_project_role(session, project_id, user)
    rows = (await session.execute(select(Snapshot, func.count(SnapshotEntry.file_id))
        .outerjoin(SnapshotEntry, SnapshotEntry.snapshot_hash == Snapshot.hash)
        .where(Snapshot.project_id == project_id).group_by(Snapshot.hash)
        .order_by(Snapshot.created_at.desc(), Snapshot.hash.desc()))).all()
    return SnapshotTimelineResponse(project_id=project_id, snapshots=[SnapshotSummary(
        hash=item.hash, parent_hash=item.parent_hash, author=item.author, message=item.message,
        created_at=item.created_at, entry_count=count) for item, count in rows])

@router.get("/snapshots/{snapshot_hash}", response_model=SnapshotDetailResponse)
async def get_snapshot(snapshot_hash: str, session: AsyncSession = Depends(get_session),
                       user: User = Depends(get_current_user)):
    snapshot = await SnapshotService.get(session, snapshot_hash)
    await require_project_role(session, snapshot.project_id, user)
    rows = (await session.execute(select(SnapshotEntry, FileVersion)
        .join(FileVersion, FileVersion.version == SnapshotEntry.version)
        .where(SnapshotEntry.snapshot_hash == snapshot.hash)
        .order_by(SnapshotEntry.path, SnapshotEntry.file_id))).all()
    return SnapshotDetailResponse(hash=snapshot.hash, project_id=snapshot.project_id,
        parent_hash=snapshot.parent_hash, author=snapshot.author, message=snapshot.message,
        created_at=snapshot.created_at, entry_count=len(rows), entries=[SnapshotEntryResponse(
            file_id=entry.file_id, path=entry.path, version=version.version,
            uploader=version.uploaded_by, uploaded_at=version.uploaded_at) for entry, version in rows])

@router.post("/snapshots/{snapshot_hash}/restore", response_model=SnapshotRestoreResponse)
async def restore_snapshot(snapshot_hash: str, session: AsyncSession = Depends(get_session),
                           user: User = Depends(get_current_user)):
    target = await SnapshotService.get(session, snapshot_hash)
    await require_project_role(session, target.project_id, user, {"manager"})
    try:
        snapshot, restored_count, skipped = await SnapshotService.restore(session, target, user.name)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return SnapshotRestoreResponse(snapshot=snapshot.hash, restored_files=restored_count,
                                   skipped=[SkippedFile(**item) for item in skipped])
