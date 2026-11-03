/* eslint-disable no-undef */
// Reader UI state (JSON of ReaderPrefs); edited from the reader toolbar.
pref("__prefsPrefix__.readerPrefs", "");
// How the bilingual page opens: "overlay" = a view inside the PDF's tab, "tab" = a tab of its own
pref("__prefsPrefix__.openMode", "overlay");
// OpenAI-compatible API
pref("__prefsPrefix__.apiBase", "https://api.openai.com/v1");
pref("__prefsPrefix__.apiKey", "");
pref("__prefsPrefix__.apiModel", "gpt-4o-mini");
pref("__prefsPrefix__.apiConcurrency", 4);
// API providers (JSON list; replaces the single API above, which is migrated on first use)
pref("__prefsPrefix__.apiProviders", "");
// Local agent CLIs (path empty = auto-detect; model empty = the tool's own default).
// Effort defaults to medium: translation needs little reasoning and "high" is several times slower.
pref("__prefsPrefix__.grokPath", "");
pref("__prefsPrefix__.grokModel", "");
pref("__prefsPrefix__.grokEffort", "medium");
pref("__prefsPrefix__.codexPath", "");
pref("__prefsPrefix__.codexModel", "");
pref("__prefsPrefix__.codexEffort", "medium");
pref("__prefsPrefix__.claudePath", "");
pref("__prefsPrefix__.claudeModel", "");
pref("__prefsPrefix__.claudeEffort", "medium");
pref("__prefsPrefix__.agentConcurrency", 4);
pref("__prefsPrefix__.agentTimeoutSec", 300);
// Translation
pref("__prefsPrefix__.glossary", "");
pref("__prefsPrefix__.batchChars", 2600);
// MinerU shared parse store (must match Zotero Research Database).
pref(
  "__prefsPrefix__.mineruSharedStoreDirectory",
  "E:\\software\\Zotero\\mineru-shared-store",
);
pref("__prefsPrefix__.mineruMode", "official-api");
pref("__prefsPrefix__.mineruOfficialEndpoint", "https://mineru.net/api/v4");
pref("__prefsPrefix__.mineruOfficialToken", "");
pref("__prefsPrefix__.mineruSelfHostedEndpoint", "http://127.0.0.1:8000");
pref("__prefsPrefix__.mineruSelfHostedAutoStart", false);
pref(
  "__prefsPrefix__.mineruSelfHostedProjectDirectory",
  "E:\\software\\DockerProject\\MinerU",
);
pref(
  "__prefsPrefix__.mineruDockerExecutable",
  "E:\\software\\docker\\resources\\bin\\docker.exe",
);
pref("__prefsPrefix__.mineruTier", "standard");
pref("__prefsPrefix__.mineruMethod", "auto");
// Legacy per-attachment parse store, read-only compatibility fallback.
pref("__prefsPrefix__.mineruRoot", "");
// MinerU cloud API token (mineru.net → API 管理); used only when the reader asks for a parse
pref("__prefsPrefix__.mineruToken", "");
