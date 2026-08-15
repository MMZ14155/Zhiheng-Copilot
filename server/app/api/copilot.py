import json
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import bad_request, not_found
from app.db.session import get_session
from app.models.project import Project
from app.models.summary import Summary
from app.schemas.copilot import CopilotAnswerOutput, CopilotAskRequest
from app.services.deliverables import DeliverableService
from app.services.llm import LoggedLlmClient
from app.services.risk_monitor import DeliverableRiskState, aggregate_risk, evaluate_project, load_risk_config


logger = logging.getLogger(__name__)
router = APIRouter(tags=["copilot"])


async def _project_context(session: AsyncSession, project: Project) -> dict:
    states = await DeliverableService.list_with_state(session, project.id)
    deliverables = [
        DeliverableRiskState(
            name=tracked.name,
            category=tracked.category,
            required=tracked.required,
            status=status,
            unfrozen_versions=sum(not version.is_frozen for version in versions),
        )
        for tracked, versions, status in states
    ]
    risks = evaluate_project(project, deliverables, load_risk_config(project))
    latest_summary = await session.scalar(
        select(Summary)
        .where(Summary.project_id == project.id)
        .order_by(Summary.version_no.desc())
        .limit(1)
    )
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


@router.post("/copilot/ask", response_model=CopilotAnswerOutput)
async def ask_copilot(
    payload: CopilotAskRequest,
    session: AsyncSession = Depends(get_session),
) -> CopilotAnswerOutput:
    if not payload.question.strip():
        raise bad_request("问题不能为空", code="QUESTION_EMPTY")

    if payload.project_id is not None:
        project = await session.get(Project, payload.project_id)
        if project is None:
            raise not_found("项目不存在", code="PROJECT_NOT_FOUND")
        projects = [project]
    else:
        projects = list((await session.scalars(select(Project).order_by(Project.id))).all())

    contexts = [await _project_context(session, project) for project in projects]
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
