"""文本提取与多模态降级相关的核心异常与常量。

文件上传后会尝试抽取纯文本并落盘为 `{content_hash}.md`。
若抽取结果无效（过短、无信息熵等），则抛出 MultimodalRequiredError，
由调用方捕获后标记为需要多模态模型处理；真正的多模态实现后续再接入。
"""


class TextExtractionError(Exception):
    """文本提取阶段的基础异常。"""


class MultimodalRequiredError(TextExtractionError):
    """文本提取未获得有效信息，需要转由多模态模型分析。

    目前作为占位：抛出后任务会失败，并在失败原因中提示需要多模态处理。
    """
