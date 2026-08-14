from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PaymentInfo(Base):
    __tablename__ = "payment_info"
    __table_args__ = (
        Index("ix_payment_info_payment_date", "payment_date"),
        Index("ix_payment_info_contract_no", "contract_no"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(
        ForeignKey("file_version.version", ondelete="CASCADE"), nullable=False, unique=True
    )
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    payment_date: Mapped[date | None] = mapped_column(Date)
    payer: Mapped[str | None] = mapped_column(String(255))
    contract_no: Mapped[str | None] = mapped_column(String(120))
    remarks: Mapped[str | None] = mapped_column(Text)
    missing_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    raw_output: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
