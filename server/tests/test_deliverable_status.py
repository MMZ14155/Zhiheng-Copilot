from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.deliverables import DeliverableService


def version(name, frozen, uploaded_at):
    return SimpleNamespace(version=name, is_frozen=frozen, uploaded_at=uploaded_at)


def test_status_rules():
    now = datetime.now(timezone.utc)
    assert (
        DeliverableService.calculate_status(
            SimpleNamespace(required=True, current_version=None), [], None
        )
        == "missing"
    )
    versions = [
        version("v1", False, now),
        version("v2", False, now + timedelta(seconds=1)),
    ]
    assert (
        DeliverableService.calculate_status(
            SimpleNamespace(required=False, current_version="v2"), versions, None
        )
        == "conflict"
    )
    versions = [
        version("v1", True, now),
        version("v2", True, now + timedelta(seconds=1)),
    ]
    assert (
        DeliverableService.calculate_status(
            SimpleNamespace(required=True, current_version="v2"), versions, versions[0]
        )
        == "old"
    )
    assert (
        DeliverableService.calculate_status(
            SimpleNamespace(required=True, current_version="v2"), versions, versions[1]
        )
        == "ok"
    )
