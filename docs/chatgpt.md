# Kiln in ChatGPT

Kiln's local CLI and stdio MCP server share the same collection store and tool registry. ChatGPT web needs a reachable MCP connection: a private Secure MCP Tunnel can carry this existing stdio server without making a public endpoint. The tunnel process must remain running while ChatGPT discovers or calls tools.

## Connect a private development server

1. Build with the supported toolchain: `bun run build:runtime`.
2. Create a tunnel in OpenAI Platform, scoped to the intended ChatGPT workspace. The account needs Tunnels Read and Manage; its runtime API key needs Read and Use. Existing organization roles may already grant these. Do not broaden other permissions.
3. Download a pinned official `openai/tunnel-client` release and verify its release digest. This dogfood used Windows amd64 v0.0.14. Keep credentials in the environment or a supported secret reference, never in the plugin.
4. Configure the tunnel's stdio command to launch `node /absolute/path/dist/mcp-server.mjs` in a dedicated asset workspace. Set `KILN_PROGRAM_STORE` and `KILN_COLLECTIONS` explicitly. The server does not need provider keys. The tunnel control process needs its OpenAI key, which should not be inherited by the MCP child.
5. Run `tunnel-client doctor`, then `tunnel-client run` with the configured profile. In ChatGPT's Plugins page choose Create app, Tunnel, the intended tunnel, and No Auth for the stdio server. Access is still controlled by the private tunnel; this does not create a public unauthenticated service.
6. Verify the seventeen-tool MCP surface appears, including `kiln_discover`, `kiln_renderer`, `kiln_present` and `kiln_project`. Test source submission, actual render-image visibility, save/list, copy, restore/edit, and exact revision export. Refresh connector metadata after changing tools.

Local subprocess evaluation has deadlines and a sanitized environment; it is not the Linux isolated evaluator's OS security boundary. This setup is for an owner-controlled development test. A hosted multi-user deployment needs tenant-scoped storage, authentication, and the isolated evaluator posture.

## Expose the skills

Keep `skills/*/SKILL.md` and their adjacent `references/` directories as the maintained source. Skill descriptions provide discovery; instructions load on selection, and reference files provide modeling detail when needed. Avoid pasting the complete modeling catalog into every tool description or prompt.

The repository contains `.codex-plugin/plugin.json` for local plugin hosts, carrying its MCP server inline with a plugin-root-relative `cwd`. Root `.mcp.json` is separate and serves a different case: a plain `git clone` opened directly in a harness, where no plugin variable is defined. Generated project workspaces continue to receive their own explicit skill copies. No global skills are installed.

For ChatGPT, first register the connector and copy its technical `plugin_asdk_app...` ID from the connector page. Then build a separate package:

```sh
node scripts/package-plugin.mjs /output/kiln-chatgpt plugin_asdk_app_ACTUAL_ID
```

The output contains the standard manifest, all skill references, license, a file-hash inventory, and `.app.json` bound to that specific connector. It contains no server executable, credentials, collections, or local filesystem paths. Output must not already exist. Omit the connector ID to produce a skills-only preparation package; that package does not connect a server by itself.

Install through the support available in the host. On the account tested September 6, 2026, ChatGPT web exposes **Plugins → Skills → Create → Upload from your computer**, accepting a ZIP/`.skill` file or `SKILL.md`. For each skill, zip the contents of its directory so `SKILL.md` and `references/` remain together. A bare markdown upload loses the referenced files. This native uploader can install individual skills separately from the MCP connector; the plugin package binds them for distribution across supporting hosts.

A local desktop marketplace is not automatically a web installation. Attaching skill text to a chat can test its guidance, but is not evidence that a native skill was installed. Private workspace distribution and public directory submission are separate actions.

## Downloads and viewing

MCP save/export replies keep descriptors for the exact GLB, source, preview, and manifest bytes in their JSON results. Every `kiln://` URI remains readable through `resources/read`; configured download URLs may additionally expose the editable ZIP. Set `KILN_MCP_RESOURCE_LINKS=1` only for a host verified to accept core MCP `resource_link` content blocks; core MCP does not expose a capability flag for that content type, and some otherwise compatible hosts reject the whole tool result. The full provenance lives in the manifest resource, while chat replies carry compact revision summaries. A `kiln://` resource URI is not an HTTPS link and should not be presented as one.

`kiln_present` adds an MCP App card for a pinned saved revision. It reuses the local Three.js stage for orbit/zoom, studio lighting, and animation, and offers GLB, editable ZIP, and source downloads through the host's `ui/download-file` bridge. Binary data travels in tool-result `_meta`, separate from model-visible text. The self-contained HTML resource needs no CDN or public asset URL. Chat presentation is bounded to 16 MiB of asset files; larger assets remain available through the local viewer. Host support must be verified: MCP resource links alone do not prove a chat-native download works.

Hosts can inject `KilnToolContext.assetDownloadUrls(collection, assetId, revisionId)` to provide delivery URLs, including expiring links backed by their private artifact store. The local MCP executable accepts `KILN_ASSET_DOWNLOAD_BASE_URL` for a separately running viewer-compatible file service. HTTPS is required except for loopback HTTP. This setting does not start a server, upload files, or publish collections. Loopback links only work on the computer hosting that viewer, and some embedded clients block the handoff.

The card tries the standard download bridge first. When that method is missing, it offers a host-provided URL; otherwise it feature-detects ChatGPT's optional upload/download helpers. It does not bypass a denied download. On September 6, 2026, this ChatGPT web client rendered the interactive 3D card, but returned `Method not found` for `ui/download-file` and `Unsupported file type` for both GLB and ZIP through `window.openai.uploadFile`. Native ChatGPT-stored attachments are therefore **not verified**. An actual file-link download must be proven separately before advertising that path as working in a particular client.

The local viewer (`kiln view`) provides browser downloads, revision selection, collection browsing, animation controls, and source/build records. Both viewers open the exact GLB without executing its source.

The Node and Bun JavaScript runtimes can produce tiny floating-point differences in regenerated GLB JSON. Preserve the original artifact for byte-exact delivery and rebuild with the recorded engine's supported Node toolchain for reproducibility. ZIP import/export preserves original bytes regardless of runtime.

Official references checked September 6, 2026: [Connect ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), and [Package plugins](https://developers.openai.com/plugins/build/plugins). Surface availability can change; verify the actual host before claiming installation or download support.
