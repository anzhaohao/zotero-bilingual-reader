// "MinerU 解析…": for readers without a MinerU setup of their own. Explains what MinerU adds,
// how to get a free API token, and runs the cloud parse through the host.

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
  const configured = (await host.mineruReady?.()) ?? false;
  const back = modal("用 MinerU 解析这篇论文");
  const body = back.querySelector(".ho-body")!;
  body.append(
    el(
      "p",
      "ho-intro",
      "使用设置中选择的 MinerU 官方在线 API 或本地 Docker API。已有共享产物会直接复用；重新解析会生成新产物，验证成功后覆盖共享缓存，旧版本保留为历史。",
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
  s1.append(
    "官方 API 用户打开 ",
    link,
    " 注册登录并创建 Token；本地 Docker 用户直接在设置中填写本地 API 地址。",
  );
  steps.append(
    s1,
    el(
      "li",
      "",
      "在设置 → 双语阅读 → MinerU 中选择解析方式，填写共享目录和对应 API 配置。",
    ),
    el(
      "li",
      "",
      "普通解析会复用已有产物；需要更新时勾选下面的“重新解析并覆盖”。",
    ),
  );
  body.append(steps);
  body.append(
    el(
      "p",
      "ho-intro",
      "官方 API 会上传 PDF 到 MinerU 服务器；本地 Docker API 只访问你配置的本机服务。",
    ),
  );
  const input = el("input", "mn-token");
  input.type = "password";
  input.placeholder = configured
    ? "已配置（留空沿用）"
    : "官方 API Token（本地 Docker 可留空）";
  input.autocomplete = "off";
  const go = el("button", "", "保存并解析");
  const status = el("p", "ho-status");
  status.hidden = true;
  const actions = el("div", "ho-actions");
  actions.append(go);
  body.append(input, actions, status);
  const force = el("input", "mn-force") as HTMLInputElement;
  force.type = "checkbox";
  force.checked = hasExisting;
  const forceLabel = el("label", "", "重新解析并覆盖共享产物");
  forceLabel.prepend(force);
  body.insertBefore(forceLabel, actions);
  input.focus();

  go.addEventListener("click", async () => {
    const token = input.value.trim();
    if (!token && !configured) {
      input.focus();
      toast("先粘贴 API Token");
      return;
    }
    if (token) await host.setMineruToken?.(token);
    go.disabled = true;
    input.disabled = true;
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
      input.disabled = false;
    }
  });
}
