import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, ApiError, type LlmConfig } from "../api";
import { Alert, Badge, Button, Card, Empty, Input, Skeleton } from "./ui";
import "./LlmConfigSection.css";
const sourceLabels = {
  db: "数据库配置",
  env: "环境变量",
  default: "默认配置",
} as const;
const message = (reason: unknown, fallback: string) =>
  reason instanceof ApiError ? reason.message : fallback;
export default function LlmConfigSection() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [timeout, setTimeout] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [source, setSource] = useState<LlmConfig["source"]>("default");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);
  const apply = (config: LlmConfig) => {
    setProvider(config.provider);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setTimeout(String(config.timeoutSeconds));
    setInputPrice(config.inputPricePerMtok);
    setOutputPrice(config.outputPricePerMtok);
    setApiKey("");
    setApiKeySet(config.apiKeySet);
    setMasked(config.apiKeyMasked);
    setSource(config.source);
    setLoaded(true);
  };
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      apply(await adminApi.getLlmConfig());
    } catch (reason) {
      console.error("AI 配置加载失败", reason);
      setLoadError(message(reason, "AI 配置加载失败，请稍后重试"));
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaveResult(null);
    setTestResult(null);
    if (
      !provider.trim() ||
      !baseUrl.trim() ||
      !model.trim() ||
      !timeout ||
      !inputPrice ||
      !outputPrice
    ) {
      setSaveResult({ ok: false, detail: "请完整填写 AI 配置" });
      return;
    }
    setSaving(true);
    try {
      apply(
        await adminApi.updateLlmConfig({
          provider: provider.trim(),
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          timeoutSeconds: Number(timeout),
          inputPricePerMtok: inputPrice,
          outputPricePerMtok: outputPrice,
          ...(apiKey ? { apiKey } : {}),
        }),
      );
      setSaveResult({ ok: true, detail: "AI 配置已保存" });
    } catch (reason) {
      console.error("AI 配置保存失败", reason);
      setSaveResult({
        ok: false,
        detail: message(reason, "AI 配置保存失败，请稍后重试"),
      });
    } finally {
      setSaving(false);
    }
  };
  const clearKey = async () => {
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);
    try {
      apply(await adminApi.updateLlmConfig({ apiKey: "" }));
      setSaveResult({ ok: true, detail: "已清除存储的 Key，当前配置已回退" });
    } catch (reason) {
      console.error("AI Key 清除失败", reason);
      setSaveResult({
        ok: false,
        detail: message(reason, "AI Key 清除失败，请稍后重试"),
      });
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await adminApi.testLlmConfig());
    } catch (reason) {
      console.error("AI 配置连接测试失败", reason);
      setTestResult({
        ok: false,
        detail: message(reason, "连接测试失败，请稍后重试"),
      });
    } finally {
      setTesting(false);
    }
  };
  return (
    <Card className="admin-section llm-config-section">
      <div className="admin-section-title">
        <div>
          <h3>AI 配置</h3>
          <p>维护当前生效的 LLM 服务参数并验证连接。</p>
        </div>
        {loaded && <Badge tone="role">{sourceLabels[source]}</Badge>}
      </div>
      {loading && <Skeleton rows={3} />}
      {!loading && loadError && (
        <Alert
          action={
            <Button
              variant="secondary"
              type="button"
              onClick={() => void load()}
            >
              重试
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}
      {!loading && !loadError && !loaded && (
        <Empty
          title="暂无 AI 配置"
          description="暂未读取到有效配置，请刷新后重试。"
          action={
            <Button type="button" onClick={() => void load()}>
              刷新配置
            </Button>
          }
        />
      )}
      {!loading && !loadError && loaded && (
        <form
          className="llm-config-form"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <div className="llm-config-grid">
            <label>
              Provider
              <Input
                aria-label="Provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </label>
            <label>
              Model
              <Input
                aria-label="Model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label className="wide">
              Base URL
              <Input
                aria-label="Base URL"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
            <label>
              超时时间（秒）
              <Input
                aria-label="超时时间"
                type="number"
                min="1"
                max="600"
                value={timeout}
                onChange={(event) => setTimeout(event.target.value)}
              />
            </label>
            <label>
              输入单价（每百万 Token）
              <Input
                aria-label="输入单价"
                type="number"
                min="0"
                step="any"
                value={inputPrice}
                onChange={(event) => setInputPrice(event.target.value)}
              />
            </label>
            <label>
              输出单价（每百万 Token）
              <Input
                aria-label="输出单价"
                type="number"
                min="0"
                step="any"
                value={outputPrice}
                onChange={(event) => setOutputPrice(event.target.value)}
              />
            </label>
            <label className="wide">
              API Key
              <Input
                aria-label="API Key"
                type="password"
                autoComplete="new-password"
                value={apiKey}
                placeholder={masked ?? "留空则保持当前配置不变"}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <span className="field-hint">
                {apiKeySet
                  ? `当前 Key ${masked ?? "已设置"}，留空不会修改`
                  : "当前未设置 Key"}
              </span>
            </label>
          </div>
          {saveResult && (
            <Alert tone={saveResult.ok ? "success" : "danger"}>
              {saveResult.detail}
            </Alert>
          )}
          {testResult && (
            <Alert tone={testResult.ok ? "success" : "danger"}>
              {testResult.detail}
            </Alert>
          )}
          <div className="llm-config-actions">
            <Button
              variant="danger"
              type="button"
              disabled={saving || !apiKeySet}
              onClick={() => void clearKey()}
            >
              清除已存 Key
            </Button>
            <span />
            <Button
              variant="secondary"
              type="button"
              disabled={testing || saving}
              onClick={() => void test()}
            >
              {testing ? "测试中…" : "测试连接"}
            </Button>
            <Button type="submit" disabled={saving || testing}>
              {saving ? "保存中…" : "保存配置"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
