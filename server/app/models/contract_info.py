from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ContractInfo(Base):
    __tablename__ = "contract_info"
    __table_args__ = (
        Index("ix_contract_info_contract_no", "contract_no"),
        Index("ix_contract_info_signed_date", "signed_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(
        ForeignKey("file_version.version", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    contract_no: Mapped[str | None] = mapped_column(String(120))
    party_a: Mapped[str | None] = mapped_column(String(255))
    party_b: Mapped[str | None] = mapped_column(String(255))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    signed_date: Mapped[date | None] = mapped_column(Date)
    payment_terms: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    missing_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    raw_output: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
