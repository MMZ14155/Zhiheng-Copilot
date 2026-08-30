// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatArea from "../components/ChatArea";
import { aiApi } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    aiApi: { ...actual.aiApi, askCopilot: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatArea 风险自动询问", () => {
  beforeEach(() => {
    vi.mocked(aiApi.askCopilot).mockResolvedValue({
      answer: "你好，我是智衡Copilot。",
      references: [],
    });
  });

  it("无风险时不追加自动询问", async () => {
    render(
      <MemoryRouter>
        <ChatArea
          riskSummary={{
            blockCount: 0,
            warnCount: 0,
            okCount: 1,
            deliveryCount: 0,
            paymentCount: 0,
            incompleteCount: 0,
          }}
        />
      </MemoryRouter>,
    );
    await screen.findByText("你好，我是智衡Copilot。");
    expect(
      screen.queryByText(/根据风险引擎/),
    ).toBeNull();
  });

  it("存在阻塞风险时自动在对话框触发询问", async () => {
    render(
      <MemoryRouter>
        <ChatArea
          riskSummary={{
            blockCount: 2,
            warnCount: 0,
            okCount: 0,
            deliveryCount: 1,
            paymentCount: 1,
            incompleteCount: 0,
          }}
        />
      </MemoryRouter>,
    );
    await screen.findByText("你好，我是智衡Copilot。");
    await screen.findByText(/根据风险引擎/);
    expect(
      screen.getByText(/2 个项目存在阻塞风险/),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 个项目临近或已逾期交付/),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 个项目回款逾期/),
    ).toBeTruthy();
  });

  it("只有预警时也会触发自动询问", async () => {
    render(
      <MemoryRouter>
        <ChatArea
          riskSummary={{
            blockCount: 0,
            warnCount: 3,
            okCount: 0,
            deliveryCount: 0,
            paymentCount: 0,
            incompleteCount: 2,
          }}
        />
      </MemoryRouter>,
    );
    await screen.findByText("你好，我是智衡Copilot。");
    await waitFor(() =>
      expect(screen.queryByText(/3 个项目存在预警/)).toBeTruthy(),
    );
    expect(
      screen.getByText(/2 个项目回款数据不完整/),
    ).toBeTruthy();
  });
});
