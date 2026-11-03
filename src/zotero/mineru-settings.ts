import type { MinerUMode } from "./mineru-cloud";
import { getPref } from "./prefs";

const RESEARCH_PREFS_PREFIX = "extensions.zotero.zoteroResearchDatabase";
const DEFAULT_SHARED_ROOT = "E:\\software\\Zotero\\mineru-shared-store";
const DEFAULT_DOCKER_PROJECT = "E:\\software\\DockerProject\\MinerU";
const DEFAULT_DOCKER_EXECUTABLE = "E:\\software\\docker\\resources\\bin\\docker.exe";

const KEYS = [
  "mineruMode",
  "mineruSharedStoreDirectory",
  "mineruOfficialEndpoint",
  "mineruOfficialToken",
  "mineruOfficialTokenEnvironment",
  "mineruSelfHostedEndpoint",
  "mineruSelfHostedAutoStart",
  "mineruSelfHostedProjectDirectory",
  "mineruDockerExecutable",
  "mineruDockerDesktopExecutable",
  "mineruBackend",
  "mineruTier",
  "mineruMethod",
  "mineruModelVersion",
  "mineruLanguage",
  "mineruEnableFormula",
  "mineruEnableTable",
  "mineruTimeoutMs",
] as const;

type MinerUValues = Partial<Record<(typeof KEYS)[number], unknown>>;

export interface SharedMinerUSettings {
  mode: MinerUMode;
  sharedStoreDirectory: string;
  officialEndpoint: string;
  officialToken: string;
  officialTokenEnvironment: string;
  selfHostedEndpoint: string;
  selfHostedAutoStart: boolean;
  selfHostedProjectDirectory: string;
  dockerExecutable: string;
  dockerDesktopExecutable: string;
  backend: string;
  tier: string;
  method: "auto" | "txt" | "ocr";
  modelVersion: "pipeline" | "vlm";
  language: string;
  enableFormula: boolean;
  enableTable: boolean;
  timeoutMs: number;
}

const endpoint = (value: unknown, fallback = "") =>
  String(value ?? fallback).trim().replace(/\/+$/, "");

/** Resolve the single Research Database configuration, with read-only legacy fallback. */
export function resolveSharedMinerUSettings(
  research: MinerUValues,
  legacy: MinerUValues = {},
): SharedMinerUSettings {
  const value = (key: (typeof KEYS)[number], fallback: unknown) =>
    research[key] !== undefined
      ? research[key]
      : legacy[key] !== undefined
        ? legacy[key]
        : fallback;
  const mode = String(value("mineruMode", "self-hosted"));
  const method = String(value("mineruMethod", "auto"));
  const timeout = Number(value("mineruTimeoutMs", 3_600_000));
  return {
    mode: mode === "official-api" ? "official-api" : "self-hosted",
    sharedStoreDirectory:
      String(value("mineruSharedStoreDirectory", DEFAULT_SHARED_ROOT)).trim() ||
      DEFAULT_SHARED_ROOT,
    officialEndpoint: endpoint(value("mineruOfficialEndpoint", "")),
    officialToken: String(value("mineruOfficialToken", "")).trim(),
    officialTokenEnvironment:
      String(value("mineruOfficialTokenEnvironment", "MINERU_API_TOKEN")).trim() ||
      "MINERU_API_TOKEN",
    selfHostedEndpoint:
      endpoint(value("mineruSelfHostedEndpoint", "http://127.0.0.1:8000")) ||
      "http://127.0.0.1:8000",
    selfHostedAutoStart: Boolean(value("mineruSelfHostedAutoStart", true)),
    selfHostedProjectDirectory:
      String(value("mineruSelfHostedProjectDirectory", DEFAULT_DOCKER_PROJECT)).trim() ||
      DEFAULT_DOCKER_PROJECT,
    dockerExecutable:
      String(value("mineruDockerExecutable", DEFAULT_DOCKER_EXECUTABLE)).trim() ||
      DEFAULT_DOCKER_EXECUTABLE,
    dockerDesktopExecutable: String(value("mineruDockerDesktopExecutable", "")).trim(),
    backend: String(value("mineruBackend", "pipeline")).trim() || "pipeline",
    tier: String(value("mineruTier", "standard")).trim() || "standard",
    method: ["auto", "txt", "ocr"].includes(method)
      ? (method as SharedMinerUSettings["method"])
      : "auto",
    modelVersion: String(value("mineruModelVersion", "vlm")) === "pipeline" ? "pipeline" : "vlm",
    language: String(value("mineruLanguage", "ch")).trim() || "ch",
    enableFormula: Boolean(value("mineruEnableFormula", true)),
    enableTable: Boolean(value("mineruEnableTable", true)),
    timeoutMs: Number.isFinite(timeout) && timeout >= 10_000 ? timeout : 3_600_000,
  };
}

export function readSharedMinerUSettings(): SharedMinerUSettings {
  const research: MinerUValues = {};
  const legacy: MinerUValues = {};
  for (const key of KEYS) {
    const value = Zotero.Prefs.get(RESEARCH_PREFS_PREFIX + "." + key, true);
    if (value !== undefined) research[key] = value;
    const old = getPref(key);
    if (old !== undefined) legacy[key] = old;
  }
  // The old cloud-only token predates the unified officialToken field.
  if (legacy.mineruOfficialToken === undefined) {
    legacy.mineruOfficialToken = getPref("mineruToken");
  }
  return resolveSharedMinerUSettings(research, legacy);
}

export function resolveMinerUToken(settings: SharedMinerUSettings): string {
  if (settings.officialToken) return settings.officialToken;
  const name = settings.officialTokenEnvironment;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "";
  return String(Services.env.get(name) || "").trim();
}

export function minerUConnectionOptions(settings: SharedMinerUSettings) {
  return {
    mode: settings.mode,
    endpoint:
      settings.mode === "self-hosted"
        ? settings.selfHostedEndpoint
        : settings.officialEndpoint,
    token: resolveMinerUToken(settings),
    autoStart: settings.selfHostedAutoStart,
    projectDirectory: settings.selfHostedProjectDirectory,
    dockerExecutable: settings.dockerExecutable,
  };
}

export async function openResearchMineruPreferences(): Promise<void> {
  const internal = (Zotero.Utilities as any)?.Internal;
  if (typeof internal?.openPreferences !== "function") {
    throw new Error("无法打开 Zotero 设置，请手动进入 Research Database → MinerU。");
  }
  let win = internal.openPreferences("zrdb-preferences", {}) as Window | null | undefined;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!win) win = Services.wm.getMostRecentWindow("zotero:pref") as unknown as Window;
    if (win && !win.closed) {
      const tab = win.document.querySelector<HTMLElement>('[data-pref-tab="mineru"]');
      const bound = win.document
        .getElementById("zrdb-preferences-root")
        ?.getAttribute("data-zrdb-bound") === "1";
      if (tab && bound) {
        tab.click();
        tab.focus();
        return;
      }
    }
    await Zotero.Promise.delay(50);
  }
  throw new Error("未找到 Research Database 的 MinerU 统一设置，请确认插件已安装并启用。");
}
