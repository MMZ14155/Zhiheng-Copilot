import type {
  DeliverableCategory,
  ExtraFile,
  FileStatus,
  FileVersion,
  Tag,
  TrackedFile,
  WorkspaceFile,
} from "../types/project";

/**
 * 将 ArrayBuffer 或 Uint8Array 转换为十六进制字符串。
 * @param buffer 二进制数据
 * @returns 十六进制字符串
 */
/** @deprecated 版本哈希已由服务端生成，仅为兼容现有 mock 流程保留。 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 使用 Web Crypto API 计算给定字符串的 SHA-256 哈希值。
 * @param input 输入字符串
 * @returns 64 位十六进制哈希字符串
 */
/** @deprecated 版本哈希已由服务端生成，仅为兼容现有 mock 流程保留。 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * 将 Uint8Array 或 ArrayBuffer 转换为 Uint8Array，便于统一处理。
 * @param content 二进制内容
 * @returns Uint8Array
 */
function normalizeContent(content: ArrayBuffer | Uint8Array): Uint8Array {
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

/**
 * 将 Uint8Array 转换为可参与字符串拼接的表示形式。
 * 这里使用十六进制编码，避免二进制数据被错误解释。
 * @param content 二进制内容
 * @returns 十六进制字符串
 */
function contentToHex(content: Uint8Array): string {
  return Array.from(content)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 计算单个文件的 SHA-256 哈希值。
 * 算法：SHA-256(文件名 + 文件内容十六进制)。
 * @param name 文件名
 * @param content 二进制内容
 * @returns 单个文件哈希
 */
async function hashSingleFile(
  name: string,
  content: ArrayBuffer | Uint8Array,
): Promise<string> {
  const normalized = normalizeContent(content);
  const source = `${name}:${contentToHex(normalized)}`;
  return sha256(source);
}

/**
 * 生成文件集合的快照哈希。
 * 算法步骤：
 * 1. 按文件名字符串 Unicode 编码严格升序排序；
 * 2. 对每个文件计算 singleFileHash = SHA-256(name + contentHex)；
 * 3. 聚合 bundleHash = SHA-256(拼接所有 singleFileHash)；
 * 4. 最终 versionHash = SHA-256(bundleHash + uploadedBy + changelog)。
 *
 * @param files 文件集合，每项包含文件名和二进制内容
 * @param uploadedBy 上传人标识
 * @param changelog 变更日志
 * @returns 64 位版本哈希字符串
 */
/** @deprecated 请上传文件并使用服务端响应中的 version。 */
export async function generateVersionHash(
  files: { name: string; content: ArrayBuffer | Uint8Array }[],
  uploadedBy: string,
  changelog: string,
): Promise<string> {
  const sorted = [...files].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  const singleHashes: string[] = [];
  for (const file of sorted) {
    const singleHash = await hashSingleFile(file.name, file.content);
    singleHashes.push(singleHash);
  }

  const bundleSource = singleHashes.join("");
  const bundleHash = await sha256(bundleSource);

  const versionSource = `${bundleHash}:${uploadedBy}:${changelog}`;
  return sha256(versionSource);
}

/**
 * 将过程性文件升格为被追踪的交付物。
 * 初始 currentVersion 取该文件的最新版本号；若不存在版本则使用空字符串。
 *
 * @param file 过程性文件
 * @param category 交付物分类
 * @param required 是否为必须交付物
 * @returns 被追踪的交付物
 */
export function promoteToDeliverable(
  file: WorkspaceFile,
  category: DeliverableCategory,
  required: boolean,
): TrackedFile {
  const latestVersion = file.versions[file.versions.length - 1];

  const trackedVersions: FileVersion[] = file.versions.map((v) => ({
    ...v,
    isFrozen: true,
  }));

  const status: FileStatus = trackedVersions.length > 0 ? "ok" : "missing";

  return {
    id: file.id,
    name: file.name,
    category,
    currentVersion: latestVersion?.version ?? "",
    versions: trackedVersions,
    required,
    status,
  };
}

/**
 * 为一批文件创建一个已锁定的新版本（isFrozen = true）。
 * 版本号使用 generateVersionHash 生成的完整 SHA-256 哈希，uploadedAt 使用当前 ISO 时间。
 *
 * @param files 文件集合，每项包含文件引用和二进制内容
 * @param uploadedBy 上传人标识
 * @param changelog 变更日志
 * @returns 锁定后的文件版本
 */
/** @deprecated 请上传文件并使用服务端响应中的 version。 */
export async function createFrozenVersion(
  files: { fileRef: WorkspaceFile; content: ArrayBuffer | Uint8Array }[],
  uploadedBy: string,
  changelog: string,
): Promise<FileVersion> {
  const hashInputs = files.map((f) => ({
    name: f.fileRef.name,
    content: f.content,
  }));

  const versionHash = await generateVersionHash(
    hashInputs,
    uploadedBy,
    changelog,
  );

  return {
    version: versionHash,
    filePath: "",
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    size: files.reduce(
      (sum, f) => sum + normalizeContent(f.content).byteLength,
      0,
    ),
    hash: versionHash,
    changelog,
    isFrozen: true,
  };
}

/**
 * 为 Tag 创建额外文件快照，仅记录引用信息，不复制文件实体。
 *
 * @param tag 目标标签
 * @param sourceFileId 源文件 ID
 * @param version 源文件版本号
 * @param note 可选备注
 * @returns 额外文件快照
 */
export function createTagSnapshot(
  tag: Tag,
  sourceFileId: string,
  version: string,
  note?: string,
): ExtraFile {
  return {
    id: `${tag.id}-${sourceFileId}-${version}`,
    name: `${tag.name} 快照`,
    sourceFileId,
    snapshotVersion: version,
    note:
      note ?? `由标签 ${tag.name} 在 ${new Date().toISOString()} 创建的快照`,
  };
}

/**
 * 返回交付物的当前生效版本。
 *
 * @param file 被追踪的交付物
 * @returns 当前生效版本
 * @throws 当找不到对应版本时抛出错误
 */
export function getEffectiveVersion(file: TrackedFile): FileVersion {
  const version = file.versions.find((v) => v.version === file.currentVersion);
  if (!version) {
    throw new Error(
      `Effective version ${file.currentVersion} not found for file ${file.id}`,
    );
  }
  return version;
}

/**
 * 根据版本号查找文件对应版本。
 *
 * @param file 被追踪交付物或过程性文件
 * @param version 版本号
 * @returns 对应版本，若不存在则返回 undefined
 */
export function getFileVersionById(
  file: TrackedFile | WorkspaceFile,
  version: string,
): FileVersion | undefined {
  return file.versions.find((v) => v.version === version);
}

/**
 * 将完整 64 位哈希版本号截取为展示用的前 7 位短版本号。
 *
 * @param version 完整版本哈希
 * @returns 前 7 位短版本号
 */
export function displayVersion(version: string): string {
  return version.slice(0, 7);
}
