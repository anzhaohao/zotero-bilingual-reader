# Bilingual Reader 的 MinerU 共享产物

Bilingual Reader 与 Zotero Research Database 共用同一套 MinerU 产物。默认目录为 `E:\software\Zotero\mineru-shared-store`，可在两个插件的设置中改成同一个路径。

## 目录

```text
<共享目录>/
├── papers/<PDF SHA-256>/
│   ├── parse.json
│   ├── full.md
│   └── raw/
├── index/<libraryID>-<attachmentKey>.json
└── locks/<PDF SHA-256>.lock
```

插件先用 PDF 内容计算 SHA-256，再检查 `parse.json`、`full.md` 和 ZIP/原始文件是否完整。解析结果只会用于完全匹配当前 PDF 的缓存。

## 解析方式

设置 → 双语阅读 → MinerU 中只保留两种方式：

1. **官方在线 API**：填写 `https://mineru.net/api/v4` 和 Token。PDF 会上传到 MinerU 服务器。
2. **本地 Docker API**：填写本地 MinerU API 地址，默认 `http://127.0.0.1:8000`。支持 MinerU 4.x 的 `/v1` 接口，并兼容旧版 `/file_parse` 和 `/tasks` 协议。

MinerU Desktop/客户端模式已经移除。Bilingual Reader 只调用 API，不启动 MinerU 客户端。

## 复用与覆盖

普通解析会按以下顺序复用：共享缓存、旧版按附件目录的有效产物。共享缓存通过 PDF SHA-256 文件锁协调两个插件；一个插件正在解析时，另一个插件等待并读取新缓存，因此不会重复上传或解析同一 PDF。

阅读页中点击“MinerU 解析…”或“重新解析 MinerU…”可以勾选“重新解析并覆盖共享产物”。强制模式绕过缓存，但仍使用同一把 PDF 锁。新 ZIP 先写入临时目录并做完整性校验，然后替换当前缓存；提交失败时恢复旧目录。旧的 Zotero Markdown 附件不会删除，新的共享版本成为当前版本。

## 兼容旧产物

旧目录 `<Zotero 数据目录>/mineru-paper-store/attachments/<附件key>/` 仍会读取 `parse.json` 和 `content_list.json`。读取到旧产物后不会再次解析；下一次显式转换可以把结果写入共享目录。

共享缓存中的 `raw` 可以包含 MinerU ZIP 解包出的 `*_content_list.json`、图片和原始 ZIP。阅读器只读取结构化内容清单，公式和表格仍使用现有 MinerU 阅读渲染逻辑。

## 直接使用

设置好 API 后，打开 PDF 的双语阅读页，点工具栏的 MinerU 按钮。已有缓存会直接完成；需要刷新时勾选覆盖选项。解析完成后切换“来源：MinerU”即可使用结构化正文。


````
