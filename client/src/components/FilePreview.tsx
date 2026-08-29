import { useEffect, useState } from "react";
import { errorMessage, filesApi } from "../api";
import type { VersionPreview } from "../api/files";
import { Alert, Modal, Skeleton } from "./ui";
import "./FilePreview.css";

const previewableExtension = /\.(?:pdf|png|jpe?g|gif|bmp|webp|txt|md|log)$/i;

export const isPreviewableFile = (name: string) =>
  previewableExtension.test(name.trim());

export default function FilePreview({
  name,
  version,
  onClose,
}: {
  name: string;
  version: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let loadedUrl: string | null = null;
    setPreview(null);
    setError(null);

    void filesApi
      .previewVersion(version)
      .then((result) => {
        loadedUrl = result.objectUrl;
        if (disposed) {
          URL.revokeObjectURL(result.objectUrl);
          return;
        }
        setPreview(result);
      })
      .catch((reason) => {
        if (disposed) return;
        console.error("文件预览加载失败", reason);
        setError(errorMessage(reason, "预览加载失败，请稍后重试"));
      });

    return () => {
      disposed = true;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [retryKey, version]);

  const normalizedType = preview?.contentType.toLowerCase() ?? "";

  return (
    <Modal
      title={`预览 ${name}`}
      className="file-preview-modal"
      onClose={onClose}
    >
      {!preview && !error && <Skeleton rows={3} />}
      {error && (
        <Alert
          action={
            <button type="button" onClick={() => setRetryKey((key) => key + 1)}>
              重试
            </button>
          }
        >
          {error}
        </Alert>
      )}
      {preview && normalizedType.startsWith("application/pdf") && (
        <iframe
          className="file-preview-frame"
          src={preview.objectUrl}
          title={`${name} PDF 预览`}
        />
      )}
      {preview && normalizedType.startsWith("image/") && (
        <img
          className="file-preview-image"
          src={preview.objectUrl}
          alt={`${name} 预览`}
        />
      )}
      {preview && normalizedType.startsWith("text/") && (
        <pre className="file-preview-text">{preview.textContent ?? ""}</pre>
      )}
    </Modal>
  );
}
