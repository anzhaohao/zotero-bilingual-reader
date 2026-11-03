// MinerU parsing uses the single configuration owned by Research Database.

import type { ZbrHost } from "../core/host-api";
import { modal } from "./handoff";

const SITE = "https://mineru.net/apiManage/token";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export async function openMineruDialog(
  host: ZbrHost,
  toast: (msg: string) => void,
  onDone: () => void,
  hasExisting = false,
) {
  let configured = (await host.mineruReady?.()) ?? false;
  const back = modal("用 MinerU 解析这篇论文");
  const body = back.querySelector(".ho-body")!;
  body.append(
    el(
      "p",
      "ho-intro",
      "解析方式和 API 统一在 Research Database → MinerU 中配置。本窗口和 Research Database 使用同一份设置与共享产物，不需要在这里重复填写 Token。",
    ),
  );
  const steps = el("ol", "mn-steps");
  const s1 = el("li");
  const link = el("a", "", "mineru.net");
  link.href = SITE;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    host.openUrl?.(SITE);
  });
  s1.append("官方 API 用户可在 ", link, " 创建 Token；本地 Docker 用户只需配置本地 API 地址。");
  steps.append(
    s1,
    el("li", "", "普通解析优先复用已有产物，不会重复解析相同 PDF。"),
    el("li", "", "需要更新时勾选“重新解析并覆盖”，新产物验证成功后才会替换旧缓存。"),
  );
  body.append(steps);
  const readiness = el(
    "p",
    "ho-intro",
    configured
      ? "已读取 Research Database 的统一 MinerU 配置。"
      : "统一配置尚不完整，请先打开设置并测试连接。",
  );
  body.append(readiness);

  const go = el("button", "", hasExisting ? "重新解析" : "开始解析");
  const settings = el("button", "", "打开统一 MinerU 设置");
  const status = el("p", "ho-status");
  status.hidden = true;
  const actions = el("div", "ho-actions");
  actions.append(settings, go);
  const force = el("input", "mn-force") as HTMLInputElement;
  force.type = "checkbox";
  force.checked = hasExisting;
  const forceLabel = el("label", "", "重新解析并覆盖共享产物");
  forceLabel.prepend(force);
  body.append(forceLabel, actions, status);

  settings.addEventListener("click", async () => {
    settings.disabled = true;
    status.hidden = false;
    status.textContent = "正在打开 Research Database → MinerU…";
    try {
      await host.openMineruSettings?.();
      configured = (await host.mineruReady?.()) ?? false;
      readiness.textContent = configured
        ? "已读取 Research Database 的统一 MinerU 配置。"
        : "请完成统一配置并点击连接测试，然后返回这里解析。";
      status.textContent = "设置完成后返回本窗口，点击开始解析。";
    } catch (e: any) {
      status.textContent = e?.message ?? String(e);
    } finally {
      settings.disabled = false;
    }
  });

  go.addEventListener("click", async () => {
    configured = (await host.mineruReady?.()) ?? false;
    if (!configured) {
      status.hidden = false;
      status.textContent = "请先打开统一 MinerU 设置，完成配置并通过连接测试。";
      return;
    }
    go.disabled = true;
    settings.disabled = true;
    status.hidden = false;
    status.textContent = "已提交，进度显示在工具栏；可以关闭这个窗口继续阅读。";
    try {
      await host.parseMineru!(force.checked);
      toast(
        force.checked
          ? "MinerU 新产物已验证并覆盖共享缓存"
          : "MinerU 解析完成并已写入共享缓存",
      );
      back.remove();
      onDone();
    } catch (e: any) {
      status.textContent = e?.message ?? String(e);
      go.disabled = false;
      settings.disabled = false;
    }
  });
}
