import asyncio

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
