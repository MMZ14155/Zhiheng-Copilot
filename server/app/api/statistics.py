import logging
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.api.dependencies import get_current_user
from app.models.contract_info import ContractInfo
from app.models.file_version import FileVersion
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.tracked_file import TrackedFile
from app.models.user import User
from app.models.workspace_file import WorkspaceFile
from app.schemas.statistics import (
    DeliverableStatusCounts,
    FileStatistics,
    ProjectStatistics,
    PaymentStatistics,
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
from app.services.statistics import (
    aggregate_project_finance, empty_status_counts, group_by_stage,
    load_financial_documents, project_averages,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["statistics"])


async def _load_deliverable_states(
    session: AsyncSession,
    project_ids: list[int] | None = None,
) -> dict[int, list[DeliverableRiskState]]:
    tracked_stmt = select(TrackedFile)
    if project_ids is not None:
        tracked_stmt = tracked_stmt.where(TrackedFile.project_id.in_(project_ids))
    tracked_files = list((await session.execute(tracked_stmt)).scalars())
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
    user: User = Depends(get_current_user),
) -> StatisticsOverviewResponse:
    project_ids: list[int] | None = None
    if not user.is_admin:
        project_ids = list(
            (
                await session.scalars(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
                )
            ).all()
        )
    project_stmt = select(Project)
    if project_ids is not None:
        project_stmt = project_stmt.where(Project.id.in_(project_ids))
    projects = list((await session.execute(project_stmt)).scalars())
    file_count_stmt = select(func.count()).select_from(WorkspaceFile)
    if project_ids is not None:
        file_count_stmt = file_count_stmt.where(WorkspaceFile.project_id.in_(project_ids))
    workspace_file_total = await session.scalar(file_count_stmt) or 0
    deliverables = await _load_deliverable_states(session, project_ids)
    financial_documents = await load_financial_documents(session, project_ids)

    risk_counts = Counter({"block": 0, "warn": 0, "ok": 0})
    deliverable_counts = empty_status_counts()
    type_counts: Counter[str] = Counter()
    deadline_counts = Counter({"overdue": 0, "due_soon": 0, "normal": 0, "excluded": 0})
    contract_total = invoiced = receivable = received = overdue = Decimal("0")
    incomplete_projects = 0
    for project in projects:
        states = deliverables.get(project.id, [])
        finance = aggregate_project_finance(financial_documents.get(project.id, []))
        risk_counts[aggregate_risk(evaluate_project(
            project, states, load_risk_config(project), finance,
        ))] += 1
        deliverable_counts.update(item.status for item in states)
        type_counts[project.project_type or "未分类"] += 1
        if project.status in {"completed", "archived"} or project.planned_delivery_date is None:
            deadline_counts["excluded"] += 1
        else:
            remaining = (project.planned_delivery_date - date.today()).days
            key = "overdue" if remaining < 0 else "due_soon" if remaining <= load_risk_config(project).thresholds.delivery_warn_days else "normal"
            deadline_counts[key] += 1
        receivable += finance.receivable_amount
        contract_total += finance.contract_amount
        invoiced += finance.invoiced_amount
        received += finance.received_amount
        overdue += finance.overdue_amount
        incomplete_projects += int(finance.data_incomplete)

    cost, schedule, satisfaction = project_averages(projects)
    logger.info(
        "calculated statistics overview projects=%s workspace_files=%s deliverables=%s "
        "receivable=%s received=%s overdue=%s incomplete_projects=%s",
        len(projects),
        workspace_file_total,
        sum(deliverable_counts.values()),
        receivable,
        received,
        overdue,
        incomplete_projects,
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
        project_type_distribution=dict(type_counts),
        delivery_deadline_distribution=dict(deadline_counts),
        payment=PaymentStatistics(
            contract_amount=contract_total, invoiced_amount=invoiced,
            receivable_amount=receivable, received_amount=received, overdue_amount=overdue,
            outstanding_amount=max(contract_total - received, Decimal("0")),
            collection_rate=(received / receivable if receivable > 0 else None),
            data_incomplete_projects=incomplete_projects,
        ),
    )
