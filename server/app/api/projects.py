import logging
import secrets
from collections.abc import Iterable
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, and_, cast, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import bad_request, conflict, not_found
from app.api.dependencies import get_current_user, require_project_role
from app.db.session import get_session
from app.models.project import Project
from app.models.project_link import ProjectLink
from app.models.summary import Summary
from app.models.summary_input import SummaryInput
from app.models.tracked_file import TrackedFile
from app.models.workspace_file import WorkspaceFile
from app.models.project_member import ProjectMember
from app.models.user import User
from app.schemas.ai import SummaryInputResponse
from app.services.collections import build_payment_deliverables
from app.schemas.projects import (
    CollectionOverviewResponse,
    DeliverableSummary,
    LatestSummary,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectLinkCreate,
    ProjectLinkResponse,
    ProjectListResponse,
    ProjectNotesUpdate,
    ProjectResponse,
    ProjectType,
    ProjectUpdate,
    RelatedProjectSummary,
    RenewalChainResponse,
)
from app.schemas.risks import (
    ProjectRiskBatchItem,
    ProjectRiskBatchResponse,
    RiskConfig,
    RiskResponse,
)
from app.services.collections import aggregate_collection_overview, load_collection_documents
from app.services.deliverables import DeliverableService
from app.services.risk_monitor import (
    DeliverableRiskState,
    aggregate_risk,
    evaluate_project,
    load_risk_config,
)
from app.services.statistics import aggregate_project_finance, load_financial_documents

logger = logging.getLogger(__name__)
router = APIRouter(tags=["projects"])
RENEWAL_CHAIN_DEPTH_LIMIT = 20
PROJECT_CODE_CREATE_ATTEMPTS = 5


def _canonical_pair(left_id: int, right_id: int) -> tuple[int, int]:
    if left_id == right_id:
        raise bad_request("项目不能链接到自身", code="PROJECT_LINK_SELF")
    return (left_id, right_id) if left_id < right_id else (right_id, left_id)


def _serialize_parties(parties: Iterable) -> list[dict[str, str | None]]:
    result: list[dict[str, str | None]] = []
    for party in parties:
        contact_person = getattr(party, "contact_person", None)
        contact_info = getattr(party, "contact_info", None)
        contact = getattr(party, "contact", None)
        if not contact_person and not contact_info and contact:
            contact_info = contact
        result.append(
            {
                "role": party.role,
                "name": party.name,
                "contact": contact,
                "contact_person": contact_person,
                "contact_info": contact_info,
            }
        )
    return result


def _validate_dates(
    signed_date: date | None,
    started_date: date | None,
    planned_delivery_date: date | None,
) -> None:
    if signed_date and started_date and started_date < signed_date:
        raise bad_request("开始日期不能早于签约日期", code="INVALID_PROJECT_DATES")
    if started_date and planned_delivery_date and planned_delivery_date < started_date:
        raise bad_request("计划交付日期不能早于开始日期", code="INVALID_PROJECT_DATES")


async def _get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise not_found(f"项目 {project_id} 不存在", code="PROJECT_NOT_FOUND")
    return project


async def _build_link_summaries(
    session: AsyncSession,
    project_ids: Iterable[int],
) -> dict[int, list[RelatedProjectSummary]]:
    ids = list(set(project_ids))
    if not ids:
        return {}

    result = await session.execute(
        select(ProjectLink, Project)
        .join(
            Project,
            or_(
                and_(ProjectLink.source_project_id.in_(ids), Project.id == ProjectLink.target_project_id),
                and_(ProjectLink.target_project_id.in_(ids), Project.id == ProjectLink.source_project_id),
            ),
        )
        .where(
            or_(
                ProjectLink.source_project_id.in_(ids),
                ProjectLink.target_project_id.in_(ids),
            )
        )
        .order_by(ProjectLink.created_at.desc(), ProjectLink.id.desc())
    )

    grouped: dict[int, list[RelatedProjectSummary]] = {project_id: [] for project_id in ids}
    for link, related_project in result.all():
        owner_id = (
            link.source_project_id
            if link.source_project_id in grouped and related_project.id == link.target_project_id
            else link.target_project_id
        )
        grouped.setdefault(owner_id, []).append(
            RelatedProjectSummary(
                id=related_project.id,
                name=related_project.name,
                code=related_project.code,
                customer_name=related_project.customer_name,
                status=related_project.status,
                signed_date=related_project.signed_date,
                link_id=link.id,
                link_type=link.link_type,
            )
        )
    return grouped


def _to_project_response(
    project: Project,
    links: list[RelatedProjectSummary] | None = None,
) -> ProjectResponse:
    return ProjectResponse.model_validate(project).model_copy(update={"links": links})


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    company: str | None = Query(default=None, min_length=1, max_length=200),
    status: str | None = Query(
        default=None,
        pattern="^(项目启动|合同签署|已开票|首款已付|尾款已付|全款已付|项目结项)$",
    ),
    client_name: str | None = Query(default=None, min_length=1, max_length=200),
    expand: str | None = Query(default=None, pattern="^links$"),
    project_type: ProjectType | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectListResponse:
    filters = []
    if status:
        filters.append(Project.status == status)
    if project_type:
        filters.append(Project.project_type == project_type)
    if client_name:
        filters.append(Project.customer_name.ilike(f"%{client_name}%"))
    if company:
        company_filter = f"%{company}%"
        filters.append(
            or_(
                Project.customer_name.ilike(company_filter),
                cast(Project.parties, String).ilike(company_filter),
            )
        )
    if not user.is_admin:
        filters.append(Project.id.in_(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)))

    total_stmt = select(func.count()).select_from(Project)
    list_stmt = select(Project).order_by(Project.created_at.desc(), Project.id.desc())
    if filters:
        total_stmt = total_stmt.where(*filters)
        list_stmt = list_stmt.where(*filters)

    total = await session.scalar(total_stmt)
    result = await session.execute(list_stmt.offset((page - 1) * size).limit(size))
    projects = list(result.scalars().all())
    link_map = await _build_link_summaries(session, [project.id for project in projects]) if expand == "links" else {}

    logger.info("listed projects page=%s size=%s total=%s", page, size, total or 0)
    return ProjectListResponse(
        page=page,
        size=size,
        total=total or 0,
        items=[_to_project_response(project, link_map.get(project.id)) for project in projects],
    )


@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    payload: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectResponse:
    if not user.is_admin:
        from app.api.errors import forbidden
        manager = await session.scalar(select(ProjectMember.id).where(ProjectMember.user_id == user.id, ProjectMember.role == "manager").limit(1))
        if manager is None: raise forbidden()
    # 续签来源校验前置：源项目不存在或无权时直接失败，不产生孤儿项目。
    if payload.renewal_source_id is not None:
        source = await session.get(Project, payload.renewal_source_id)
        if source is None:
            raise not_found("续签来源项目不存在", code="PROJECT_NOT_FOUND")
        if not user.is_admin:
            from app.api.errors import forbidden
            source_manager = await session.scalar(select(ProjectMember.id).where(ProjectMember.project_id == payload.renewal_source_id, ProjectMember.user_id == user.id, ProjectMember.role == "manager").limit(1))
            if source_manager is None: raise forbidden()
    generated_code = payload.code is None
    attempts = PROJECT_CODE_CREATE_ATTEMPTS if generated_code else 1
    for attempt in range(attempts):
        code = payload.code or f"PRJ-{secrets.token_hex(4).upper()}"
        project = Project(
            name=payload.name,
            code=code,
            project_type=payload.project_type,
            customer_name=payload.customer_name,
            parties=_serialize_parties(payload.parties),
            contract_amount=payload.contract_amount,
            signed_date=payload.signed_date,
            started_date=payload.started_date,
            planned_delivery_date=payload.planned_delivery_date,
            status=payload.status,
            progress=payload.progress,
            notes=payload.notes,
            region=payload.region,
        )
        session.add(project)
        try:
            await session.flush()
            if not user.is_admin:
                session.add(ProjectMember(project_id=project.id, user_id=user.id, role="manager"))
            # 续签链接与项目创建同事务提交，任一失败整体回滚。
            if payload.renewal_source_id is not None:
                source_id, target_id = _canonical_pair(payload.renewal_source_id, project.id)
                session.add(ProjectLink(source_project_id=source_id, target_project_id=target_id, link_type="renewal"))
            # 根据付款条款自动生成回款 deliverables，状态固定为未付款。
            for data in build_payment_deliverables(payload.payment_terms, payload.contract_amount):
                session.add(TrackedFile(project_id=project.id, **data))
            await session.commit()
            break
        except IntegrityError as exc:
            await session.rollback()
            logger.warning("project create conflict code=%s attempt=%s", code, attempt + 1)
            if not generated_code or attempt == attempts - 1:
                raise conflict("项目编码已存在", code="PROJECT_CODE_EXISTS") from exc
    await session.refresh(project)
    logger.info("created project id=%s code=%s", project.id, project.code)
    return _to_project_response(project)


# 批量风险评估：一次请求返回当前用户可见全部项目的风险，避免首页/统计页 N+1 请求。
# 注意必须注册在 "/projects/{project_id}" 之前，否则 "risks" 会被当作路径参数。
@router.get("/projects/risks", response_model=ProjectRiskBatchResponse)
async def list_project_risks(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectRiskBatchResponse:
    stmt = select(Project)
    if not user.is_admin:
        stmt = stmt.where(
            Project.id.in_(
                select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
            )
        )
    projects = list((await session.execute(stmt)).scalars().all())
    documents = await load_financial_documents(session, [p.id for p in projects])
    states_map = await DeliverableService.list_states_by_projects(
        session, [p.id for p in projects]
    )
    items: list[ProjectRiskBatchItem] = []
    for project in projects:
        config = load_risk_config(project)
        finance = aggregate_project_finance(documents.get(project.id, []))
        risks = evaluate_project(
            project, states_map.get(project.id, []), config, finance,
        )
        items.append(
            ProjectRiskBatchItem(
                project_id=project.id, level=aggregate_risk(risks), risks=risks,
            )
        )
    logger.info("evaluated project risks in batch count=%s", len(items))
    return ProjectRiskBatchResponse(items=items)


@router.get("/projects/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectDetailResponse:
    await require_project_role(session, project_id, user)
    project = await _get_project_or_404(session, project_id)
    deliverables_result = await session.execute(
        select(WorkspaceFile)
        .where(WorkspaceFile.project_id == project_id, WorkspaceFile.is_deliverable.is_(True), WorkspaceFile.is_deleted == False)
        .order_by(WorkspaceFile.updated_at.desc(), WorkspaceFile.id.desc())
    )
    latest_summary_id = (
        select(Summary.id)
        .where(Summary.project_id == project_id)
        .order_by(Summary.created_at.desc(), Summary.id.desc())
        .limit(1)
        .scalar_subquery()
    )
    summary_rows = (
        await session.execute(
            select(Summary, SummaryInput, TrackedFile.name)
            .outerjoin(SummaryInput, SummaryInput.summary_id == Summary.id)
            .outerjoin(TrackedFile, TrackedFile.id == SummaryInput.tracked_file_id)
            .where(Summary.id == latest_summary_id)
            .order_by(SummaryInput.id)
        )
    ).all()
    summary = summary_rows[0][0] if summary_rows else None
    summary_inputs = [
        SummaryInputResponse(
            tracked_file_id=summary_input.tracked_file_id,
            tracked_file_name=tracked_file_name,
            file_version=summary_input.file_version,
        )
        for _, summary_input, tracked_file_name in summary_rows
        if summary_input is not None
    ]

    response = ProjectDetailResponse.model_validate(project)
    response.deliverables = [
        DeliverableSummary.model_validate(deliverable)
        for deliverable in deliverables_result.scalars().all()
    ]
    response.latest_summary = (
        LatestSummary.model_validate(summary).model_copy(update={"inputs": summary_inputs})
        if summary
        else None
    )
    manager_ids = (
        await session.scalars(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.role == "manager",
            )
        )
    ).all()
    response.manager_ids = list(manager_ids)
    logger.info("fetched project detail id=%s", project_id)
    return response


@router.post("/projects/{project_id}/dismiss-delivery-warning", response_model=ProjectResponse)
async def dismiss_delivery_warning(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectResponse:
    await require_project_role(session, project_id, user, {"manager"})
    project = await _get_project_or_404(session, project_id)
    project.delivery_warning_dismissed = True
    await session.commit()
    await session.refresh(project)
    logger.info("dismissed delivery warning project_id=%s user_id=%s", project_id, user.id)
    return ProjectResponse.model_validate(project)


@router.get("/projects/{project_id}/collection-overview", response_model=CollectionOverviewResponse)
async def get_collection_overview(project_id: int, session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user)) -> CollectionOverviewResponse:
    await require_project_role(session, project_id, user)
    await _get_project_or_404(session, project_id)
    overview = aggregate_collection_overview(await load_collection_documents(session, project_id))
    logger.info("calculated collection overview project_id=%s status=%s", project_id, overview.data_status)
    payload = overview.__dict__ | {"incomplete_reasons": list(overview.incomplete_reasons)}
    return CollectionOverviewResponse(**payload)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectResponse:
    await require_project_role(session, project_id, user, {"manager"})
    project = await _get_project_or_404(session, project_id)
    update_data = payload.model_dump(exclude_unset=True)
    signed_date = update_data.get("signed_date", project.signed_date)
    started_date = update_data.get("started_date", project.started_date)
    planned_delivery_date = update_data.get("planned_delivery_date", project.planned_delivery_date)
    _validate_dates(signed_date, started_date, planned_delivery_date)

    if "parties" in update_data and update_data["parties"] is not None:
        update_data["parties"] = _serialize_parties(payload.parties or [])
    for field, value in update_data.items():
        setattr(project, field, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        logger.warning("project update conflict id=%s error=%s", project_id, exc)
        raise conflict("项目编码已存在", code="PROJECT_CODE_EXISTS") from exc
    await session.refresh(project)
    logger.info("updated project id=%s", project_id)
    return _to_project_response(project)


@router.patch("/projects/{project_id}/notes", response_model=ProjectResponse)
async def update_project_notes(
    project_id: int,
    payload: ProjectNotesUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectResponse:
    await require_project_role(session, project_id, user, {"manager"})
    project = await _get_project_or_404(session, project_id)
    project.notes = payload.notes
    await session.commit()
    await session.refresh(project)
    logger.info("updated project notes id=%s", project_id)
    return _to_project_response(project)


async def _risk_deliverables(
    session: AsyncSession, project_id: int
) -> list[DeliverableRiskState]:
    states = await DeliverableService.list_with_state(session, project_id)
    return [
        DeliverableRiskState(
            name=tracked.name,
            category=tracked.category,
            required=tracked.required,
            status=status,
            unfrozen_versions=sum(not version.is_frozen for version in versions),
        )
        for tracked, versions, status in states
    ]


@router.get("/projects/{project_id}/risks", response_model=RiskResponse)
async def get_project_risks(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RiskResponse:
    await require_project_role(session, project_id, user)
    project = await _get_project_or_404(session, project_id)
    config = load_risk_config(project)
    documents = await load_financial_documents(session, [project_id])
    finance = aggregate_project_finance(documents.get(project_id, []))
    risks = evaluate_project(
        project, await _risk_deliverables(session, project_id), config, finance,
    )
    level = aggregate_risk(risks)
    logger.info("evaluated project risks id=%s level=%s count=%s", project_id, level, len(risks))
    return RiskResponse(level=level, risks=risks, config=config)


@router.get("/projects/{project_id}/risk-config", response_model=RiskConfig)
async def get_project_risk_config(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RiskConfig:
    await require_project_role(session, project_id, user)
    project = await _get_project_or_404(session, project_id)
    return load_risk_config(project)


@router.patch("/projects/{project_id}/risk-config", response_model=RiskConfig)
async def update_project_risk_config(
    project_id: int,
    payload: RiskConfig,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RiskConfig:
    await require_project_role(session, project_id, user, {"manager"})
    project = await _get_project_or_404(session, project_id)
    config = payload.model_copy(update={"project_id": str(project_id)})
    project.risk_config = config.model_dump(by_alias=True, mode="json")
    await session.commit()
    logger.info("updated project risk config id=%s", project_id)
    return config


@router.post("/projects/{project_id}/links", response_model=ProjectLinkResponse, status_code=201)
async def create_project_link(
    project_id: int,
    payload: ProjectLinkCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ProjectLinkResponse:
    await require_project_role(session, project_id, user, {"manager"})
    await require_project_role(session, payload.target_project_id, user, {"manager"})
    source_id, target_id = _canonical_pair(project_id, payload.target_project_id)
    existing_projects = await session.scalar(
        select(func.count())
        .select_from(Project)
        .where(Project.id.in_([source_id, target_id]))
    )
    if existing_projects != 2:
        raise not_found("待链接项目不存在", code="PROJECT_NOT_FOUND")

    existing_link = await session.scalar(
        select(ProjectLink).where(
            ProjectLink.source_project_id == source_id,
            ProjectLink.target_project_id == target_id,
        )
    )
    if existing_link is not None:
        raise conflict("项目链接已存在", code="PROJECT_LINK_EXISTS")

    link = ProjectLink(
        source_project_id=source_id,
        target_project_id=target_id,
        link_type=payload.link_type,
        note=payload.note,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    logger.info("created project link id=%s type=%s", link.id, link.link_type)
    return ProjectLinkResponse.model_validate(link)


@router.delete("/links/{link_id}", status_code=204)
async def delete_project_link(
    link_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    link = await session.get(ProjectLink, link_id)
    if link is None:
        raise not_found(f"项目链接 {link_id} 不存在", code="PROJECT_LINK_NOT_FOUND")
    await require_project_role(session, link.source_project_id, user, {"manager"})
    await session.delete(link)
    await session.commit()
    logger.info("deleted project link id=%s", link_id)


@router.get("/projects/{project_id}/renewal-chain", response_model=RenewalChainResponse)
async def get_renewal_chain(
    project_id: int,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> RenewalChainResponse:
    await require_project_role(session, project_id, user)
    await _get_project_or_404(session, project_id)
    result = await session.execute(
        text(
            """
            WITH RECURSIVE renewal_chain(id, depth, path) AS (
                SELECT CAST(:project_id AS bigint), 0, ARRAY[CAST(:project_id AS bigint)]
                UNION ALL
                SELECT
                    CASE
                        WHEN pl.source_project_id = renewal_chain.id THEN pl.target_project_id
                        ELSE pl.source_project_id
                    END,
                    renewal_chain.depth + 1,
                    renewal_chain.path || CASE
                        WHEN pl.source_project_id = renewal_chain.id THEN pl.target_project_id
                        ELSE pl.source_project_id
                    END
                FROM renewal_chain
                JOIN project_link pl
                    ON pl.link_type = 'renewal'
                   AND (
                        pl.source_project_id = renewal_chain.id
                        OR pl.target_project_id = renewal_chain.id
                   )
                WHERE renewal_chain.depth < :depth_limit
                  AND NOT (
                    CASE
                        WHEN pl.source_project_id = renewal_chain.id THEN pl.target_project_id
                        ELSE pl.source_project_id
                    END = ANY(renewal_chain.path)
                  )
            )
            SELECT DISTINCT p.*
            FROM project p
            JOIN renewal_chain rc ON rc.id = p.id
            ORDER BY p.signed_date NULLS LAST, p.id
            """
        ),
        {"project_id": project_id, "depth_limit": RENEWAL_CHAIN_DEPTH_LIMIT},
    )
    projects = [Project(**dict(row._mapping)) for row in result]
    logger.info("fetched renewal chain project_id=%s count=%s", project_id, len(projects))
    return RenewalChainResponse(
        project_id=project_id,
        depth_limit=RENEWAL_CHAIN_DEPTH_LIMIT,
        items=[_to_project_response(project) for project in projects],
    )
