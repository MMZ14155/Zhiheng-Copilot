from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.ai import _serialize_summaries
from app.schemas.projects import LatestSummary


def summary(summary_id: int):
    return SimpleNamespace(
        id=summary_id,
        project_id=1,
        version_no=summary_id,
        core_info={},
        contract_invoice_progress={},
        missing_materials=[],
        pending_questions=[],
        content="总结",
        created_by=None,
        created_at=datetime.now(timezone.utc),
    )


def test_summary_response_groups_inputs_and_keeps_hashes():
    item = summary(2)
    first_hash = "a" * 64
    second_hash = "b" * 64
    rows = [
        (item, SimpleNamespace(tracked_file_id=10, file_version=first_hash), "合同.pdf"),
        (item, SimpleNamespace(tracked_file_id=11, file_version=second_hash), "验收单.pdf"),
    ]

    response = _serialize_summaries(rows)[0]

    assert [entry.file_version for entry in response.inputs] == [first_hash, second_hash]
    assert [entry.tracked_file_name for entry in response.inputs] == [
        "合同.pdf",
        "验收单.pdf",
    ]


def test_summary_without_input_returns_empty_array():
    response = _serialize_summaries([(summary(1), None, None)])[0]

    assert response.inputs == []


def test_latest_summary_defaults_to_empty_inputs():
    response = LatestSummary.model_validate(summary(1))

    assert response.inputs == []
