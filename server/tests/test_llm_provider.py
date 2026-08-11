import asyncio
import json

from app.schemas.ai import ContractExtractionOutput, SummaryGenerationOutput
from app.services.llm import MockLlmProvider


def test_mock_provider_returns_valid_contract_schema():
    result = asyncio.run(
        MockLlmProvider().generate("extract contract", ContractExtractionOutput)
    )

    output = ContractExtractionOutput.model_validate(result.data)
    assert output.contract_no == "MOCK-CONTRACT-001"
    assert result.input_tokens > 0
    assert result.output_tokens > 0
    assert result.cost == 0


def test_mock_provider_summary_asks_for_missing_context():
    result = asyncio.run(
        MockLlmProvider().generate("summarize project", SummaryGenerationOutput)
    )

    output = SummaryGenerationOutput.model_validate(result.data)
    assert len(output.pending_questions) == 2
    assert "项目当前进度" in output.pending_questions[1]


def test_mock_provider_summary_absorbs_answers_and_keeps_unanswered_questions():
    prompt = json.dumps(
        {
            "previous_summary": {
                "pending_questions": ["是否仍有缺失材料？", "项目当前进度如何？"],
                "core_info": {},
            },
            "question_answers": [
                {"question": "项目当前进度如何？", "answer": "已完成联调，进度 80%"}
            ],
        },
        ensure_ascii=False,
    )
    result = asyncio.run(MockLlmProvider().generate(prompt, SummaryGenerationOutput))

    output = SummaryGenerationOutput.model_validate(result.data)
    assert "已完成联调，进度 80%" in output.content
    assert output.pending_questions == ["是否仍有缺失材料？"]
    assert output.core_info["answered_questions"][0]["answer"] == "已完成联调，进度 80%"


def test_mock_provider_does_not_restore_resolved_questions():
    prompt = json.dumps(
        {"previous_summary": {"pending_questions": [], "core_info": {}}, "question_answers": []}
    )
    result = asyncio.run(MockLlmProvider().generate(prompt, SummaryGenerationOutput))

    output = SummaryGenerationOutput.model_validate(result.data)
    assert output.pending_questions == []
