from pydantic import BaseModel, Field


class CopilotAskRequest(BaseModel):
    question: str = Field(max_length=2000)
    project_id: int | None = Field(default=None, gt=0)


class CopilotAnswerOutput(BaseModel):
    answer: str
    references: list[str]
