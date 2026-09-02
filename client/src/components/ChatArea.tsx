import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiApi, ApiError } from "../api";
import { ROUTES } from "../constants/routes";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  references?: string[];
}

export interface RiskSummary {
  materialCount: number;
  deliveryCount: number;
  paymentCount: number;
}

const DEFAULT_QUESTION = "当前项目风险概况";
const FALLBACK_WELCOME =
  "你好，我是智衡Copilot。你可以向我询问项目风险、关键节点和阻塞原因。";

const QUICK_QUESTIONS = [
  "哪些项目需要优先复核？",
  "本周关键节点",
  "阻塞项目原因",
];

interface ChatAreaProps {
  projectId?: number;
  riskSummary?: RiskSummary;
}

function buildAutoQuestions(summary: RiskSummary): ChatMessage[] {
  const parts: string[] = [];
  if (summary.materialCount > 0) {
    parts.push(`${summary.materialCount} 个项目存在材料缺失`);
  }
  if (summary.deliveryCount > 0) {
    parts.push(`${summary.deliveryCount} 个项目临近或已逾期交付`);
  }
  if (summary.paymentCount > 0) {
    parts.push(`${summary.paymentCount} 个项目回款未结清`);
  }
  if (parts.length === 0) return [];
  const intro = "根据风险引擎最新计算结果，我发现以下需要关注的情况：";
  const ask = "是否需要我帮你生成跟进建议，或跳转到对应项目筛选？";
  const body = parts.map((part, index) => `${index + 1}. ${part}`).join("\n");
  return [
    {
      role: "bot",
      content: `${intro}\n${body}\n\n${ask}`,
    },
  ];
}

export default function ChatArea({ projectId, riskSummary }: ChatAreaProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);
  const autoAskedRef = useRef(false);
  const lastProjectIdRef = useRef<number | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // projectId 变化时清空会话并重新加载欢迎消息；同项目重复触发（如 StrictMode）则跳过。
    const projectChanged = lastProjectIdRef.current !== projectId;
    lastProjectIdRef.current = projectId;
    if (initializedRef.current && !projectChanged) return;
    initializedRef.current = true;
    if (projectChanged) setMessages([]);
    setIsLoading(true);

    void aiApi
      .askCopilot(DEFAULT_QUESTION, projectId)
      .then(({ answer, references }) => {
        setMessages([{ role: "bot", content: answer, references }]);
      })
      .catch(() => {
        setMessages([{ role: "bot", content: FALLBACK_WELCOME }]);
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // 风险引擎结果满足条件时，自动在左侧对话框追加询问。
  useEffect(() => {
    if (isLoading || !riskSummary || autoAskedRef.current) return;
    autoAskedRef.current = true;
    const autoQuestions = buildAutoQuestions(riskSummary);
    if (autoQuestions.length) {
      setMessages((prev) => [...prev, ...autoQuestions]);
    }
  }, [isLoading, riskSummary]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsLoading(true);

    try {
      const { answer, references } = await aiApi.askCopilot(trimmed, projectId);
      setMessages((prev) => [
        ...prev,
        { role: "bot", content: answer, references },
      ]);
    } catch (error) {
      const content =
        error instanceof ApiError
          ? error.message
          : "请求失败，请检查网络后重试";
      setMessages((prev) => [...prev, { role: "bot", content }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void sendMessage(input);
  };

  return (
    <div className="chat-area">
      <div className="chat-history" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`msg ${message.role}`}
          >
            <div className="bubble">
              {message.role === "bot"
                ? message.content
                    .split(/[。；]+/)
                    .map((sentence) =>
                      sentence.trim().replace(/^[），、：.\s]+/, ""),
                    )
                    .filter(Boolean)
                    .map((sentence, sentenceIndex) => (
                      <p key={sentenceIndex}>{sentence}。</p>
                    ))
                : message.content}
            </div>
            {message.references && message.references.length > 0 && (
              <details className="source">
                <summary>查看 {message.references.length} 条来源</summary>
                <ul>
                  {message.references.map((reference, referenceIndex) => (
                    <li key={`${reference}-${referenceIndex}`}>{reference}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="msg bot pending">
            <div className="bubble">思考中…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="quick-q">
        {QUICK_QUESTIONS.map((question) => (
          <button
            key={question}
            disabled={isLoading}
            onClick={() => void sendMessage(question)}
          >
            {question}
          </button>
        ))}
        <button onClick={() => navigate(ROUTES.resourceCenter)}>
          项目资料中心
        </button>
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题..."
          disabled={isLoading}
        />
        <button
          disabled={isLoading || !input.trim()}
          onClick={() => void sendMessage(input)}
        >
          发送
        </button>
      </div>
    </div>
  );
}
