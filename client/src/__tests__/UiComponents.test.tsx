// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Alert,
  Badge,
  Button,
  Empty,
  Input,
  Modal,
  Skeleton,
  Tabs,
} from "../components/ui";
afterEach(cleanup);
describe("基础 UI 组件", () => {
  it("Button、Badge、Alert 与 Empty 渲染语义内容", async () => {
    const click = vi.fn();
    render(
      <>
        <Button onClick={click}>确认</Button>
        <Badge tone="success">正常</Badge>
        <Alert>加载失败</Alert>
        <Empty title="暂无内容" description="请稍后再试" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText("正常")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("加载失败");
    expect(screen.getByText("暂无内容")).toBeTruthy();
  });
  it("Input、Tabs 与 Skeleton 支持关键交互和加载语义", async () => {
    const change = vi.fn();
    render(
      <>
        <Input aria-label="关键词" />
        <Tabs
          active="a"
          onChange={change}
          tabs={[
            { key: "a", label: "概览" },
            { key: "b", label: "文件" },
          ]}
        />
        <Skeleton rows={2} />
      </>,
    );
    await userEvent.type(screen.getByLabelText("关键词"), "项目");
    await userEvent.click(screen.getByRole("tab", { name: "文件" }));
    expect((screen.getByLabelText("关键词") as HTMLInputElement).value).toBe(
      "项目",
    );
    expect(change).toHaveBeenCalledWith("b");
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("Modal 支持自定义 className 并响应关闭", async () => {
    const close = vi.fn();
    render(
      <Modal title="标题" className="custom-modal" onClose={close}>
        内容
      </Modal>,
    );
    expect(screen.getByRole("dialog").classList.contains("custom-modal")).toBe(
      true,
    );
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
