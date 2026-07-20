import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { useNavigate } from 'react-router-dom';

const INITIAL_MESSAGE: ChatMessage = {
  role: 'bot',
  content: `你好，我是智衡Copilot。我已读取项目经营样例数据，当前识别出 3 个阻塞级、1 个预警级、4 个健康级项目。你可以问我：<br>• 哪些项目需要优先复核？<br>• P002 为什么被标红？<br>• 本周应该关注哪些关键节点？`,
  source: '项目经营样例数据.md、项目风险判断口径.md',
};

const QUICK_QUESTIONS = [
  '哪些项目需要优先复核？',
  'P002 为什么被标红？',
  '本周关键节点',
  '同类型均值参照',
  '生成月报初稿',
];

function botReply(text: string): { content: string; source: string } {
  if (text.includes('优先复核') || text.includes('阻塞')) {
    return {
      content:
        '当前阻塞级项目为 <strong>P002、P005、P006</strong>，均需人工复核。P002 因成本超预算且质量/满意度双低最优先；P005 因进度+质量+验收三重风险叠加；P006 因验收材料版本不一致触发规则冲突。',
      source: '项目风险判断口径.md、项目经营样例数据.md、客户反馈',
    };
  }
  if (text.includes('P002')) {
    return {
      content:
        'P002 被标红的原因：<br>1. 成本使用率 110.7%，已超预算；<br>2. 周期使用率 93.3%，接近上限；<br>3. 质量问题数 5、满意度 3.1，交付质量明显偏离；<br>4. 客户反馈指出“成本超预算仍未提前预警”。',
      source: '项目经营样例数据.md / P002、项目风险判断口径.md',
    };
  }
  if (text.includes('关键节点') || text.includes('本周')) {
    return {
      content:
        '本周需关注的关键节点：<br>• P001 剩余 5 天进入验收，需确认验收材料；<br>• P005 剩余 5 天，关键节点已延期；<br>• P006 仅剩 1 天到达计划周期，且验收材料版本不一致。',
      source: '项目经营样例数据.md / 计划周期与已用天数',
    };
  }
  if (text.includes('同类型') || text.includes('均值')) {
    return {
      content:
        '按客户类型横向对比：<br>• 科技服务（P001/P005/P008）：平均成本使用率 81.2%，平均周期使用率 82.2%，平均满意度 3.9<br>• 咨询交付（P002/P006）：平均成本使用率 95.7%，平均周期使用率 95.4%，平均满意度 3.5<br>• 检测服务（P003/P007）：平均成本使用率 36.8%，平均满意度 4.6<br><br>建议重点关注咨询交付类项目，其成本和周期使用率均偏高。',
      source: 'outputs/需求A_数据与规则处理.md / 同类型项目均值参照',
    };
  }
  if (text.includes('月报') || text.includes('诊断报告')) {
    return {
      content:
        '已生成月度诊断报告初稿，包含：项目风险分级表、阻塞级项目归因与处置建议、同类型项目均值参照、人工复核记录。报告初稿需项目经理/审核人确认后方可对外发送。',
      source: 'outputs/需求A_诊断报告.md、outputs/需求A_人工复核记录.md',
    };
  }
  if (text.includes('资料') || text.includes('文件夹') || text.includes('分散')) {
    return {
      content:
        'Copilot 已将原本分散在个人文件夹中的项目资料按统一结构归集到“项目资料中心”。每个项目自动生成编号，归档合同、成本、进度、验收、反馈五类资料，并识别版本缺失/冲突。',
      source: '项目资料中心',
    };
  }
  return {
    content:
      '我已理解你的问题。当前原型仅展示基于样例数据的风险判断能力。如需深入分析某个项目，请点击右侧卡片查看详情。',
    source: '智衡Copilot 原型能力范围',
  };
}

export default function ChatArea() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);

    setTimeout(() => {
      const reply = botReply(trimmed);
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: reply.content, source: reply.source },
      ]);
    }, 400);
  };

  const handleSend = () => {
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="chat-area">
      <div className="chat-history">
        {messages.map((m, idx) => (
          <div key={idx} className={`msg ${m.role}`}>
            <div className="bubble" dangerouslySetInnerHTML={{ __html: m.content }} />
            {m.source && <div className="source">来源：{m.source}</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="quick-q">
        {QUICK_QUESTIONS.map((q) => (
          <button key={q} onClick={() => sendMessage(q)}>
            {q}
          </button>
        ))}
        <button onClick={() => navigate('/resource-center')}>项目资料中心</button>
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题..."
        />
        <button onClick={handleSend}>发送</button>
      </div>
    </div>
  );
}
