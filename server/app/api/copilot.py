import json
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import bad_request, not_found
from app.api.dependencies import get_current_user, require_project_role
from app.db.session import get_session
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.models.summary import Summary
from app.models.user import User
from app.schemas.copilot import CopilotAnswerOutput, CopilotAskRequest
from app.services.deliverables import DeliverableService
from app.services.llm import LoggedLlmClient
from app.services.risk_monitor import DeliverableRiskState, aggregate_risk, evaluate_project, load_risk_config


logger = logging.getLogger(__name__)
router = APIRouter(tags=["copilot"])


def _build_context(
    project: Project,
    deliverables: list[DeliverableRiskState],
    latest_summary: Summary | None,
) -> dict:
    risks = evaluate_project(project, deliverables, load_risk_config(project))
    return {
        "id": project.id,
        "code": project.code,
        "name": project.name,
        "risk_level": aggregate_risk(risks),
        "risks": [risk.model_dump(mode="json") for risk in risks],
        "latest_summary": (
            {
                "content": latest_summary.content,
                "core_info": latest_summary.core_info,
                "missing_materials": latest_summary.missing_materials,
                "pending_questions": latest_summary.pending_questions,
            }
            if latest_summary
            else None
        ),
    }


async def _project_contexts(
    session: AsyncSession, projects: list[Project]
) -> list[dict]:
    """批量加载项目上下文：交付物状态与最新总结各一次查询，避免逐项目 N+1。"""
    ids = [project.id for project in projects]
    if not ids:
        return []
    states_map = await DeliverableService.list_states_by_projects(session, ids)
    latest_summaries: dict[int, Summary] = {}
    summary_rows = (
        await session.scalars(
            select(Summary)
            .where(Summary.project_id.in_(ids))
            .order_by(Summary.project_id, Summary.version_no.desc())
        )
    ).all()
    for summary in summary_rows:
        latest_summaries.setdefault(summary.project_id, summary)
    return [
        _build_context(
            project,
            states_map.get(project.id, []),
            latest_summaries.get(project.id),
        )
        for project in projects
    ]


@router.post("/copilot/ask", response_model=CopilotAnswerOutput)
async def ask_copilot(
    payload: CopilotAskRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CopilotAnswerOutput:
    if not payload.question.strip():
        raise bad_request("问题不能为空", code="QUESTION_EMPTY")

    if payload.project_id is not None:
        project = await session.get(Project, payload.project_id)
        if project is None:
            raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
        await require_project_role(session, project.id, user)
        projects = [project]
    else:
        stmt = select(Project).order_by(Project.id)
        if not user.is_admin:
            stmt = stmt.where(
                Project.id.in_(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
                )
            )
        projects = list((await session.scalars(stmt)).all())

    contexts = await _project_contexts(session, projects)
    counts = {"ok": 0, "warn": 0, "block": 0}
    for context in contexts:
        counts[context["risk_level"]] += 1

    prompt_data = {
        "question": payload.question,
        "scope_project_id": payload.project_id,
        "risk_level_counts": counts,
        "projects": [
            {
                **context,
                "risks": context["risks"]
                if payload.project_id is not None or context["risk_level"] == "block"
                else [],
            }
            for context in contexts
        ],
    }
    prompt = json.dumps(prompt_data, ensure_ascii=False, sort_keys=True)
    answer = await LoggedLlmClient().call(
        project_id=payload.project_id,
        scene="copilot_answer",
        prompt=prompt,
        output_schema=CopilotAnswerOutput,
        request_meta={"project_id": payload.project_id, "project_count": len(contexts)},
    )
    logger.info(
        "answered copilot question project_id=%s projects=%s references=%s",
        payload.project_id,
        len(contexts),
        len(answer.references),
    )
    return answer
