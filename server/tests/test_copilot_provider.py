import asyncio
import json

from app.schemas.copilot import CopilotAnswerOutput
from app.services.llm import MockLlmProvider


def test_mock_copilot_answer_references_real_project_and_reason():
    prompt = json.dumps(
        {
            "question": "哪些项目需要优先复核？",
            "risk_level_counts": {"ok": 0, "warn": 0, "block": 1},
            "projects": [
                {
                    "id": 7,
                    "code": "P-007",
                    "risk_level": "block",
                    "risks": [{"reason": "成本已超过预算"}],
                    "latest_summary": None,
                }
            ],
        },
        ensure_ascii=False,
    )

    result = asyncio.run(MockLlmProvider().generate(prompt, CopilotAnswerOutput))
    output = CopilotAnswerOutput.model_validate(result.data)

    assert "P-007" in output.answer
    assert "成本已超过预算" in output.answer
    assert output.references == ["项目 P-007：成本已超过预算"]


def test_mock_copilot_answer_does_not_invent_projects_for_empty_context():
    prompt = json.dumps(
        {
            "question": "有哪些项目？",
            "risk_level_counts": {"ok": 0, "warn": 0, "block": 0},
            "projects": [],
        },
        ensure_ascii=False,
    )

    result = asyncio.run(MockLlmProvider().generate(prompt, CopilotAnswerOutput))
    output = CopilotAnswerOutput.model_validate(result.data)

    assert output.references == []
    assert "暂无可复核项目" in output.answer
