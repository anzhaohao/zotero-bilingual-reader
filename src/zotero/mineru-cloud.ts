// MinerU API adapters. Only the official online API and a self-hosted Docker API are supported.

import { hostFetch as fetch, newTextDecoder, setTimeout } from "./globals";

export type MinerUMode = "official-api" | "self-hosted";

export interface MinerUParsedFigure {
  id: string;
  kind: "figure" | "table";
  caption: string;
  pageIndex: number;
  rect: [number, number, number, number] | null;
  imageName: string;
  bytes: Uint8Array;
}

export interface MinerUConversionResult {
  markdown: string;
  figures: MinerUParsedFigure[];
  archive?: Uint8Array;
  markdownArchivePath?: string;
  contentList?: unknown[];
}

export interface MinerUApiOptions {
  mode: MinerUMode;
  endpoint: string;
  token?: string;
  pdf: Uint8Array;
  name: string;
  tier?: string;
  method?: "auto" | "txt" | "ocr";
  enableFormula?: boolean;
  enableTable?: boolean;
  onProgress?: (p: { state: string; pages?: number; total?: number }) => void;
  signal?: AbortSignal;
  autoStart?: boolean;
  projectDirectory?: string;
  dockerExecutable?: string;
}

const OFFICIAL_API = "https://mineru.net/api/v4";
const POLL_MS = 4000;
const TIMEOUT_MS = 20 * 60_000;

function cleanEndpoint(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readBody(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "MinerU 返回 HTTP " + response.status + "：" + text.slice(0, 240),
    );
  }
}

async function officialRequest(
  token: string,
  endpoint: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const response = await fetch(cleanEndpoint(endpoint) + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await readBody(response);
  if (!response.ok || body.code !== 0)
    throw new Error("MinerU：" + (body.msg ?? "HTTP " + response.status));
  return body.data;
}

async function localJSON(
  endpoint: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const response = await fetch(cleanEndpoint(endpoint) + path, init);
  const body = await readBody(response);
  if (!response.ok) throw new Error("MinerU 本地 API：HTTP " + response.status);
  return body;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

export async function parseOnMineruApi(
  opts: MinerUApiOptions,
): Promise<MinerUConversionResult> {
  if (opts.mode === "official-api") return parseOfficial(opts);
  return parseSelfHosted(opts);
}

export async function parseOnMineruCloud(opts: {
  token: string;
  pdf: Uint8Array;
  name: string;
  onProgress?: MinerUApiOptions["onProgress"];
  signal?: AbortSignal;
}): Promise<MinerUConversionResult> {
  return parseOnMineruApi({
    ...opts,
    mode: "official-api",
    endpoint: OFFICIAL_API,
  });
}

async function parseOfficial(
  opts: MinerUApiOptions,
): Promise<MinerUConversionResult> {
  const token = String(opts.token || "").trim();
  if (!token) throw new Error("还没有填写 MinerU 官方 API Token");
  const name = opts.name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/(\.pdf)?$/i, ".pdf");
  const batch = await officialRequest(
    token,
    opts.endpoint || OFFICIAL_API,
    "/file-urls/batch",
    {
      method: "POST",
      body: JSON.stringify({
        files: [{ name }],
        model_version: "vlm",
        enable_formula: opts.enableFormula ?? true,
        enable_table: opts.enableTable ?? true,
        language: "en",
      }),
    },
  );
  const uploadURL = String(batch.file_urls?.[0] || "");
  if (!batch.batch_id || !uploadURL)
    throw new Error("MinerU 没有返回上传地址或批次 ID");
  opts.onProgress?.({ state: "uploading" });
  const upload = await fetch(uploadURL, {
    method: "PUT",
    body: opts.pdf,
    signal: opts.signal,
  });
  if (!upload.ok) throw new Error("上传 PDF 失败：HTTP " + upload.status);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    opts.signal?.throwIfAborted();
    await sleep(POLL_MS);
    const result = (
      await officialRequest(
        token,
        opts.endpoint || OFFICIAL_API,
        "/extract-results/batch/" + batch.batch_id,
      )
    ).extract_result?.[0];
    if (!result) continue;
    if (result.state === "failed")
      throw new Error("MinerU 解析失败：" + (result.err_msg || "未知原因"));
    if (result.state !== "done") {
      opts.onProgress?.({
        state: result.state,
        pages: result.extract_progress?.extracted_pages,
        total: result.extract_progress?.total_pages,
      });
      continue;
    }
    const zipURL = String(result.full_zip_url || "");
    if (!zipURL) throw new Error("MinerU 任务完成但没有结果下载地址");
    opts.onProgress?.({ state: "downloading" });
    const response = await fetch(zipURL, { signal: opts.signal });
    if (!response.ok)
      throw new Error("下载解析结果失败：HTTP " + response.status);
    return parseMineruZip(new Uint8Array(await response.arrayBuffer()), name);
  }
  throw new Error("MinerU 解析超时（20 分钟），稍后可再试");
}

async function parseSelfHosted(
  opts: MinerUApiOptions,
): Promise<MinerUConversionResult> {
  const endpoint = cleanEndpoint(opts.endpoint);
  if (!endpoint) throw new Error("请配置 MinerU 本地 API 地址");
  await ensureSelfHostedReady(endpoint, opts);
  opts.onProgress?.({ state: "connecting" });
  const fileName = opts.name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/(\.pdf)?$/i, ".pdf");
  const deadline = Date.now() + TIMEOUT_MS;
  const createdResponse = await fetch(endpoint + "/v1/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: fileName,
      bytes: opts.pdf.byteLength,
      mime_type: "application/pdf",
      purpose: "parse",
    }),
    signal: opts.signal,
  });
  if (![404, 405].includes(createdResponse.status)) {
    if (!createdResponse.ok)
      throw new Error(
        "MinerU 本地上传初始化失败：HTTP " + createdResponse.status,
      );
    const created = await readBody(createdResponse);
    const upload = (created.data ?? created) as Record<string, any>;
    const uploadID = String(upload.id || upload.upload_id || "");
    if (!uploadID) throw new Error("MinerU 本地上传初始化没有返回 id");
    const uploadURL = String(
      upload.upload_url ||
        endpoint + "/v1/uploads/" + encodeURIComponent(uploadID) + "/content",
    );
    const put = await fetch(uploadURL, {
      method: String(upload.upload_method || "PUT"),
      headers: upload.upload_headers || { "content-type": "application/pdf" },
      body: opts.pdf,
      signal: opts.signal,
    });
    if (!put.ok) throw new Error("MinerU 本地上传失败：HTTP " + put.status);
    const complete = await localJSON(
      endpoint,
      "/v1/uploads/" + encodeURIComponent(uploadID) + "/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    const file = (complete.data?.file ??
      complete.file ??
      complete.data ??
      complete) as Record<string, any>;
    const fileID = String(file.id || file.file_id || "");
    if (!fileID) throw new Error("MinerU 本地上传完成但没有返回 file_id");
    const submitted = await localJSON(endpoint, "/v1/parse/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: [{ source: { type: "file_id", file_id: fileID } }],
        tier: opts.tier || "standard",
        ocr_mode: opts.method || "auto",
        output_formats: ["markdown", "zip"],
      }),
    });
    const job = (submitted.data ?? submitted) as Record<string, any>;
    const jobID = String(job.job_id || job.id || "");
    if (!jobID) throw new Error("MinerU 本地解析任务没有返回 job_id");
    while (Date.now() < deadline) {
      opts.signal?.throwIfAborted();
      await sleep(1500);
      const statusResponse = await fetch(
        endpoint + "/v1/parse/jobs/" + encodeURIComponent(jobID),
        { signal: opts.signal },
      );
      if (!statusResponse.ok)
        throw new Error(
          "MinerU 本地任务查询失败：HTTP " + statusResponse.status,
        );
      const statusBody = await readBody(statusResponse);
      const status = (statusBody.data ?? statusBody) as Record<string, any>;
      const state = String(status.status || status.state || "").toLowerCase();
      opts.onProgress?.({ state });
      if (["failed", "canceled", "error"].includes(state))
        throw new Error(
          "MinerU 本地解析失败：" +
            (status.error || status.message || "未知错误"),
        );
      if (!["completed", "partial", "done", "success"].includes(state))
        continue;
      const outputs =
        status.outputs || status.output_files || status.files || [];
      const output = Array.isArray(outputs)
        ? outputs.find(
            (x: any) =>
              String(x.type || x.format || "").toLowerCase() === "zip",
          ) || outputs[0]
        : outputs;
      const outputID = String(
        status.zip_file_id || output?.id || output?.file_id || "",
      );
      if (outputID) {
        const result = await fetch(
          endpoint + "/v1/files/" + encodeURIComponent(outputID) + "/content",
          { signal: opts.signal },
        );
        if (!result.ok)
          throw new Error("MinerU 本地结果下载失败：HTTP " + result.status);
        return parseMineruZip(
          new Uint8Array(await result.arrayBuffer()),
          fileName,
        );
      }
      const markdown = String(status.markdown || status.full_md || "");
      if (markdown.trim()) return { markdown, figures: [] };
      throw new Error("MinerU 本地任务完成但没有可下载结果");
    }
    throw new Error("MinerU 本地解析任务超时");
  }
  return parseSelfHostedLegacy(opts, endpoint, fileName, deadline);
}

async function ensureSelfHostedReady(
  endpoint: string,
  opts: MinerUApiOptions,
): Promise<void> {
  const healthy = async () => {
    for (const path of ["/v1/health", "/health"]) {
      try {
        const response = await fetch(endpoint + path, { signal: opts.signal });
        if (response.ok) return true;
      } catch {
        // Try the next health endpoint.
      }
    }
    return false;
  };
  if (await healthy()) return;
  if (!opts.autoStart) throw new Error(`MinerU 本地服务未运行：${endpoint}`);
  const project = String(opts.projectDirectory || "").trim();
  if (!project)
    throw new Error("已开启自动启动，但没有配置 MinerU Docker 项目目录");
  const docker = String(opts.dockerExecutable || "docker").trim();
  const subprocess = (
    ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    ) as any
  ).Subprocess;
  const process = await subprocess.call({
    command: docker,
    arguments: [
      "compose",
      "--profile",
      "api",
      "up",
      "-d",
      "--no-build",
      "mineru-api",
    ],
    workdir: project,
    environmentAppend: true,
    stderr: "pipe",
  });
  await process.stdin.close();
  const result = await process.wait();
  if (result.exitCode !== 0)
    throw new Error(`启动 MinerU Docker 服务失败（退出码 ${result.exitCode}）`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await healthy()) return;
    await sleep(2000);
  }
  throw new Error(`MinerU Docker 服务启动后仍未就绪：${endpoint}`);
}

async function parseSelfHostedLegacy(
  opts: MinerUApiOptions,
  endpoint: string,
  fileName: string,
  deadline: number,
): Promise<MinerUConversionResult> {
  const boundary = "----zbr-mineru-" + Date.now().toString(16);
  const encoder = new TextEncoder();
  const head = encoder.encode(
    "--" +
      boundary +
      '\r\nContent-Disposition: form-data; name="files"; filename="' +
      fileName +
      '"\r\nContent-Type: application/pdf\r\n\r\n',
  );
  const tail = encoder.encode("\r\n--" + boundary + "--\r\n");
  const body = new Uint8Array(head.length + opts.pdf.length + tail.length);
  body.set(head);
  body.set(opts.pdf, head.length);
  body.set(tail, head.length + opts.pdf.length);
  let response = await fetch(endpoint + "/file_parse", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=" + boundary },
    body,
    signal: opts.signal,
  });
  if ([404, 405].includes(response.status)) {
    response = await fetch(endpoint + "/tasks", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      body,
      signal: opts.signal,
    });
    if (!response.ok)
      throw new Error("MinerU 本地任务提交失败：HTTP " + response.status);
    const submitted = await readBody(response);
    const taskID = String(submitted.task_id || submitted.data?.task_id || "");
    if (!taskID) throw new Error("MinerU 本地服务没有返回 task_id");
    while (Date.now() < deadline) {
      await sleep(1500);
      const status = await localJSON(
        endpoint,
        "/tasks/" + encodeURIComponent(taskID),
      );
      const state = String(
        status.status || status.data?.status || "",
      ).toLowerCase();
      if (["failed", "error"].includes(state))
        throw new Error("MinerU 本地解析失败：" + (status.error || "未知错误"));
      if (["completed", "done", "success"].includes(state)) {
        const result = await fetch(
          endpoint + "/tasks/" + encodeURIComponent(taskID) + "/result",
          { signal: opts.signal },
        );
        if (!result.ok)
          throw new Error("MinerU 本地结果下载失败：HTTP " + result.status);
        return parseMineruZip(
          new Uint8Array(await result.arrayBuffer()),
          fileName,
        );
      }
    }
    throw new Error("MinerU 本地解析任务超时");
  }
  if (!response.ok)
    throw new Error("MinerU 本地解析失败：HTTP " + response.status);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    const value = await readBody(response);
    const markdown = String(
      value.markdown || value.data?.markdown || value.full_md || "",
    );
    if (!markdown.trim()) throw new Error("MinerU 本地结果没有 Markdown");
    return { markdown, figures: [] };
  }
  return parseMineruZip(new Uint8Array(await response.arrayBuffer()), fileName);
}

export async function parseMineruZip(
  bytes: Uint8Array,
  preferredName = "",
): Promise<MinerUConversionResult> {
  const reader = (Components.classes as any)[
    "@mozilla.org/libjar/zip-reader;1"
  ].createInstance(Components.interfaces.nsIZipReader);
  const zipPath = PathUtils.join(
    PathUtils.tempDir,
    "zbr-mineru-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2) +
      ".zip",
  );
  await IOUtils.write(zipPath, bytes);
  reader.open(Zotero.File.pathToFile(zipPath));
  try {
    let listEntry = "";
    let markdownEntry = "";
    const entries = reader.findEntries("*");
    while (entries.hasMore()) {
      const entry = entries.getNext();
      if (
        !entry.endsWith("/") &&
        !/content_list_v2\.json$/i.test(entry) &&
        /(^|\/)content_list\.json$|_content_list\.json$/i.test(entry)
      )
        listEntry ||= entry;
      if (!entry.endsWith("/") && /\.md$/i.test(entry)) {
        if (
          !markdownEntry ||
          entry
            .toLowerCase()
            .includes(preferredName.toLowerCase().replace(/\\.pdf$/i, ""))
        )
          markdownEntry = entry;
      }
    }
    if (!listEntry) throw new Error("解析结果里没有 content_list.json");
    if (!markdownEntry) throw new Error("解析结果里没有 Markdown");
    const readEntry = async (entry: string): Promise<string> => {
      const out = PathUtils.join(
        PathUtils.tempDir,
        "zbr-mineru-entry-" +
          Date.now() +
          "-" +
          Math.random().toString(16).slice(2),
      );
      reader.extract(entry, Zotero.File.pathToFile(out));
      try {
        return newTextDecoder().decode(await IOUtils.read(out));
      } finally {
        await IOUtils.remove(out).catch(() => undefined);
      }
    };
    const markdown = await readEntry(markdownEntry);
    const contentList = JSON.parse(await readEntry(listEntry));
    return {
      markdown,
      figures: [],
      archive: bytes,
      markdownArchivePath: markdownEntry,
      contentList: Array.isArray(contentList)
        ? contentList
        : contentList.data || [],
    };
  } finally {
    reader.close();
    await IOUtils.remove(zipPath).catch(() => undefined);
  }
}
