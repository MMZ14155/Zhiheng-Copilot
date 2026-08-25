import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiApi, ApiError } from "../api";
import { ROUTES } from "../constants/routes";

interface ChatMessage {
  role: "bot" | "user";
  content: string;
  references?: string[];
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
}

export default function ChatArea({ projectId }: ChatAreaProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);
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
