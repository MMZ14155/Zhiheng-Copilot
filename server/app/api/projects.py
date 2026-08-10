import logging
from collections.abc import Iterable
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, and_, cast, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import bad_request, conflict, not_found
from app.db.session import get_session
from app.models.project import Project
from app.models.project_link import ProjectLink
from app.models.summary import Summary
from app.models.workspace_file import WorkspaceFile
from app.schemas.projects import (
    DeliverableSummary,
    LatestSummary,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectLinkCreate,
    ProjectLinkResponse,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    RelatedProjectSummary,
    RenewalChainResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["projects"])
RENEWAL_CHAIN_DEPTH_LIMIT = 20


def _canonical_pair(left_id: int, right_id: int) -> tuple[int, int]:
    if left_id == right_id:
        raise bad_request("项目不能链接到自身", code="PROJECT_LINK_SELF")
    return (left_id, right_id) if left_id < right_id else (right_id, left_id)


def _serialize_parties(parties: Iterable) -> list[dict[str, str | None]]:
    return [
        {
            "role": party.role,
            "name": party.name,
            "contact": party.contact,
        }
        for party in parties
    ]


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
    status: str | None = Query(default=None, pattern="^(active|archived|completed)$"),
    client_name: str | None = Query(default=None, min_length=1, max_length=200),
    expand: str | None = Query(default=None, pattern="^links$"),
    session: AsyncSession = Depends(get_session),
) -> ProjectListResponse:
    filters = []
    if status:
        filters.append(Project.status == status)
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
) -> ProjectResponse:
    project = Project(
        name=payload.name,
        code=payload.code,
        customer_name=payload.customer_name,
        parties=_serialize_parties(payload.parties),
        contract_amount=payload.contract_amount,
        signed_date=payload.signed_date,
        started_date=payload.started_date,
        planned_delivery_date=payload.planned_delivery_date,
        status=payload.status,
        progress=payload.progress,
        notes=payload.notes,
    )
    session.add(project)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        logger.warning("project create conflict code=%s error=%s", payload.code, exc)
        raise conflict("项目编码已存在", code="PROJECT_CODE_EXISTS") from exc
    await session.refresh(project)
    logger.info("created project id=%s code=%s", project.id, project.code)
    return _to_project_response(project)


@router.get("/projects/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: int,
    session: AsyncSession = Depends(get_session),
) -> ProjectDetailResponse:
    project = await _get_project_or_404(session, project_id)
    deliverables_result = await session.execute(
        select(WorkspaceFile)
        .where(WorkspaceFile.project_id == project_id, WorkspaceFile.is_deliverable.is_(True))
        .order_by(WorkspaceFile.updated_at.desc(), WorkspaceFile.id.desc())
    )
    summary = await session.scalar(
        select(Summary)
        .where(Summary.project_id == project_id)
        .order_by(Summary.created_at.desc(), Summary.id.desc())
        .limit(1)
    )

    response = ProjectDetailResponse.model_validate(project)
    response.deliverables = [
        DeliverableSummary.model_validate(deliverable)
        for deliverable in deliverables_result.scalars().all()
    ]
    response.latest_summary = LatestSummary.model_validate(summary) if summary else None
    logger.info("fetched project detail id=%s", project_id)
    return response


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
) -> ProjectResponse:
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


@router.post("/projects/{project_id}/links", response_model=ProjectLinkResponse, status_code=201)
async def create_project_link(
    project_id: int,
    payload: ProjectLinkCreate,
    session: AsyncSession = Depends(get_session),
) -> ProjectLinkResponse:
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
) -> None:
    link = await session.get(ProjectLink, link_id)
    if link is None:
        raise not_found(f"项目链接 {link_id} 不存在", code="PROJECT_LINK_NOT_FOUND")
    await session.delete(link)
    await session.commit()
    logger.info("deleted project link id=%s", link_id)


@router.get("/projects/{project_id}/renewal-chain", response_model=RenewalChainResponse)
async def get_renewal_chain(
    project_id: int,
    session: AsyncSession = Depends(get_session),
) -> RenewalChainResponse:
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
