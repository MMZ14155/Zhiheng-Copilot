import logging
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.tracked_file import TrackedFile
from app.models.workspace_file import WorkspaceFile
from app.schemas.statistics import (
    DeliverableStatusCounts,
    FileStatistics,
    ProjectStatistics,
    RiskCounts,
    StatisticsOverviewResponse,
)
from app.services.deliverables import DeliverableService
from app.services.risk_monitor import (
    DeliverableRiskState,
    aggregate_risk,
    evaluate_project,
    load_risk_config,
)
from app.services.statistics import empty_status_counts, group_by_stage, project_averages

logger = logging.getLogger(__name__)
router = APIRouter(tags=["statistics"])


async def _load_deliverable_states(
    session: AsyncSession,
) -> dict[int, list[DeliverableRiskState]]:
    tracked_files = list((await session.execute(select(TrackedFile))).scalars())
    source_ids = [item.source_file_id for item in tracked_files if item.source_file_id is not None]

    versions: dict[int, list[FileVersion]] = defaultdict(list)
    contract_pins: dict[int, FileVersion] = {}
    if source_ids:
        version_rows = (
            await session.execute(
                select(FileVersion)
                .where(FileVersion.file_id.in_(source_ids))
                .order_by(FileVersion.uploaded_at, FileVersion.version)
            )
        ).scalars()
        for version in version_rows:
            versions[version.file_id].append(version)

        pin_rows = await session.execute(
            select(FileVersion, ContractInfo)
            .join(ContractInfo, ContractInfo.version == FileVersion.version)
            .where(FileVersion.file_id.in_(source_ids))
            .order_by(ContractInfo.created_at.desc(), ContractInfo.id.desc())
        )
        for version, _ in pin_rows.all():
            contract_pins.setdefault(version.file_id, version)

    grouped: dict[int, list[DeliverableRiskState]] = defaultdict(list)
    for tracked in tracked_files:
        file_versions = versions.get(tracked.source_file_id or -1, [])
        status = DeliverableService.calculate_status(
            tracked,
            file_versions,
            contract_pins.get(tracked.source_file_id or -1),
        )
        grouped[tracked.project_id].append(
            DeliverableRiskState(
                name=tracked.name,
                category=tracked.category,
                required=tracked.required,
                status=status,
                unfrozen_versions=sum(not version.is_frozen for version in file_versions),
            )
        )
    return grouped


@router.get("/statistics/overview", response_model=StatisticsOverviewResponse)
async def get_statistics_overview(
    session: AsyncSession = Depends(get_session),
) -> StatisticsOverviewResponse:
    projects = list((await session.execute(select(Project))).scalars())
    workspace_file_total = await session.scalar(select(func.count()).select_from(WorkspaceFile)) or 0
    deliverables = await _load_deliverable_states(session)

    risk_counts = Counter({"block": 0, "warn": 0, "ok": 0})
    deliverable_counts = empty_status_counts()
    for project in projects:
        states = deliverables.get(project.id, [])
        risk_counts[aggregate_risk(evaluate_project(project, states, load_risk_config(project)))] += 1
        deliverable_counts.update(item.status for item in states)

    cost, schedule, satisfaction = project_averages(projects)
    logger.info(
        "calculated statistics overview projects=%s workspace_files=%s deliverables=%s",
        len(projects),
        workspace_file_total,
        sum(deliverable_counts.values()),
    )
    return StatisticsOverviewResponse(
        projects=ProjectStatistics(
            total=len(projects),
            risks=RiskCounts(**risk_counts),
            average_cost_usage_rate=cost,
            average_schedule_usage_rate=schedule,
            average_satisfaction=satisfaction,
        ),
        files=FileStatistics(
            workspace_file_total=workspace_file_total,
            deliverables=DeliverableStatusCounts(**deliverable_counts),
        ),
        by_stage=group_by_stage(projects),
    )
