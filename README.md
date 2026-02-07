# Red Ledger

**A local-first desktop command center for issuing LLM API requests, managing workspace files, and editing persistent context prompts.**

Red Ledger runs entirely on your machine. No telemetry, no cloud sync, no accounts. API keys live in a local `settings.json` file and never leave the main process.

---

## Features

- **Multi-provider chat** — Stream responses from OpenAI, OpenRouter, or Ollama with tool-calling support. Switch providers and models on the fly. Providers and tools self-register via a registry pattern, making the system extensible without central switch statements.
- **Workspace file access** — Point the app at any folder. The LLM can read, write, append, and list files within it. An optional strict mode requires your approval for every file operation.
- **File attachments** — Attach `.txt` or `.md` files directly to a message via the paperclip button. Contents are inlined into the request so the LLM can reference them.
- **Persistent context editing** — Three markdown files (System, User, Organization) are injected into every request as the system prompt. Edit them in-app with a full CodeMirror 6 editor, load content from an external file, and reset to defaults at any time.
- **Web search** — The LLM can search the web via Tavily or SerpAPI and incorporate results into its responses.
- **Conversation history** — All conversations are stored locally in SQLite. Rename, delete, or pick up where you left off. First messages auto-title the conversation.
- **Message actions** — Retry any assistant response or copy message content with one click.
- **Timestamp injection** — Each user message is tagged with an ISO 8601 timestamp so the LLM has accurate real-time context.
- **Portable mode** — Drop a `settings.json` next to the executable and the app stores everything alongside the binary instead of in `%APPDATA%`.

## Screenshot

```
 Sidebar (20%)          Chat (50%)                Context (30%)
 ┌──────────────┬───────────────────────────┬──────────────────┐
 │ Conversations│                           │ System Prompt    │
 │ Workspace    │   Message feed +          │ ────────────     │
 │ Settings     │   streaming input +       │ User Context     │
 │              │   file attachments        │ ────────────     │
 │              │                           │ Org Context      │
 └──────────────┴───────────────────────────┴──────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 33 |
| Frontend | React 18, TypeScript 5, Vite 5 |
| Styling | Tailwind CSS 3, DaisyUI 4, custom `red-ledger` theme |
| Editor | CodeMirror 6 with markdown support |
| State | Zustand |
| Database | better-sqlite3 (SQLite, WAL mode) |
| HTTP | Axios |
| Markdown | marked + DOMPurify |
| Icons | Lucide React |
| Animations | @formkit/auto-animate |
| Layout | react-resizable-panels |
| Testing | Vitest |
| Linting | ESLint + typescript-eslint |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Git**
- For Ollama support: a running [Ollama](https://ollama.ai) instance (`ollama serve`)

### Install

```bash
git clone https://github.com/domwxyz/red-ledger.git
cd red-ledger
npm install
```

> **Windows (Git Bash / MSYS):** npm may resolve optional native binaries for Linux due to MSYS platform detection. If the build fails, swap the platform packages manually:
>
> ```bash
> # esbuild
> rm -rf node_modules/@esbuild/linux-x64
> npm install @esbuild/win32-x64
>
> # rollup
> rm -rf node_modules/@rollup/rollup-linux-x64-gnu node_modules/@rollup/rollup-linux-x64-musl
> npm install @rollup/rollup-win32-x64-msvc
> ```
>
> `better-sqlite3` may also require a prebuilt binary if ClangCL is unavailable:
>
> ```bash
> npm install better-sqlite3 --ignore-scripts
> npx prebuild-install --runtime electron --target 33.3.1
> ```

### Rebuild Native Modules

Recompile `better-sqlite3` against Electron's Node ABI:

```bash
npm run rebuild
```

### Development

```bash
npm run dev
```

Opens the app with Vite HMR. The renderer loads from `localhost:5173` and DevTools open automatically.

### Production Build

```bash
npm run build
```

Compiled output lands in `out/` (main, preload, renderer).

### Package for Distribution

```bash
npx electron-builder --win    # NSIS installer + portable .exe
npx electron-builder --mac    # .dmg + .zip
npx electron-builder --linux  # .AppImage + .deb
```

---

## Project Structure

```
red-ledger/
├── electron/                          # Main process
│   ├── main.ts                        # App lifecycle, window, dependency wiring
│   ├── preload.ts                     # contextBridge → window.redLedger API
│   ├── ipc/                           # Thin IPC adapters (validate + delegate to services)
│   │   ├── contract.ts                # Single source of truth for all IPC channel types
│   │   ├── typedIpc.ts                # Type-safe ipcMain.handle wrapper
│   │   ├── validate.ts                # Runtime validators for IPC boundary values
│   │   ├── db.ts                      # Conversation/message CRUD
│   │   ├── fs.ts                      # Workspace file operations
│   │   ├── context.ts                 # Context file load/save
│   │   ├── llm.ts                     # LLM streaming orchestration
│   │   ├── settings.ts                # Settings load/save
│   │   └── search.ts                  # Web search dispatch
│   ├── services/                      # Domain logic (Electron-free, testable)
│   │   ├── ConversationService.ts     # SQLite DB lifecycle + conversation/message CRUD
│   │   ├── SettingsService.ts         # JSON settings persistence + sanitization
│   │   ├── WorkspaceService.ts        # Jailed file I/O + strict mode + .gitignore
│   │   ├── ContextService.ts          # System/User/Org prompt assembly
│   │   ├── SearchService.ts           # Tavily / SerpAPI web search
│   │   ├── LlmService.ts             # Multi-round streaming + tool orchestration
│   │   ├── pathJail.ts                # Pure path traversal/symlink validator
│   │   ├── gitignore.ts              # Pure .gitignore parser
│   │   └── __tests__/                 # Service unit tests
│   │       ├── pathJail.test.ts
│   │       ├── gitignore.test.ts
│   │       └── SettingsService.test.ts
│   └── lib/
│       ├── providers/                 # LLM provider implementations
│       │   ├── base.ts                # BaseLLMProvider interface
│       │   ├── registry.ts            # Self-registration provider registry
│       │   ├── openai.ts              # OpenAI SSE streaming
│       │   ├── openrouter.ts          # OpenRouter (extends OpenAI)
│       │   └── ollama.ts              # Ollama NDJSON streaming
│       └── tools/                     # LLM tool implementations
│           ├── registry.ts            # Self-registration tool registry
│           ├── executor.ts            # Dispatches tool calls via registry
│           ├── readFile.ts            # read_file tool
│           ├── writeFile.ts           # write_file tool
│           ├── appendFile.ts          # append_file tool
│           ├── listFiles.ts           # list_files tool
│           ├── webSearch.ts           # web_search tool
│           └── __tests__/
│               └── registry.test.ts
├── src/                               # Renderer process
│   ├── main.tsx                       # React entry, ErrorBoundary wrapper
│   ├── App.tsx                        # Root component, settings bootstrap
│   ├── components/
│   │   ├── Layout.tsx                 # Three-pane resizable layout
│   │   ├── ErrorBoundary.tsx          # Catch-all render error boundary
│   │   ├── Sidebar/
│   │   │   ├── index.tsx              # Tab container (Conversations / Workspace / Settings)
│   │   │   ├── ConversationList.tsx
│   │   │   ├── WorkspaceTree.tsx      # Directory picker + file tree
│   │   │   ├── FileViewer.tsx         # Read-only CodeMirror viewer for workspace files
│   │   │   └── SettingsPanel.tsx      # Provider, model dropdown, API keys, toggles
│   │   ├── Chat/
│   │   │   ├── ChatPanel.tsx          # Message list + input
│   │   │   ├── MessageList.tsx        # Scrollable feed (auto-animate)
│   │   │   ├── MessageBubble.tsx      # Markdown rendering (marked + DOMPurify)
│   │   │   ├── MessageActions.tsx     # Retry + copy buttons per message
│   │   │   ├── ToolCallCard.tsx       # Expandable tool invocation display
│   │   │   └── ChatInput.tsx          # Textarea, send/cancel, attach files
│   │   ├── Context/
│   │   │   ├── ContextPanel.tsx       # Three stacked editors
│   │   │   └── ContextEditor.tsx      # Single CodeMirror instance + save/reset/load
│   │   ├── Editor/
│   │   │   ├── Editor.tsx             # CodeMirror 6 wrapper component
│   │   │   └── redLedgerTheme.ts      # Custom CM6 theme (paper, red accents)
│   │   ├── FileTree/
│   │   │   ├── FileTree.tsx           # Recursive directory tree
│   │   │   └── FileTreeItem.tsx       # Single node (click to view)
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── Toast.tsx              # Toast notifications (auto-animate)
│   ├── store/                         # Zustand state management
│   │   ├── index.ts                   # Re-exports all stores
│   │   ├── uiStore.ts                 # Sidebar tab, workspace path, toasts
│   │   ├── conversationStore.ts       # Conversations, messages, active selection
│   │   └── settingsStore.ts           # Settings CRUD, debounced save
│   ├── hooks/
│   │   └── useStreaming.ts            # LLM stream lifecycle
│   ├── lib/
│   │   ├── notify.ts                  # Notification bus (decouples stores from UI)
│   │   ├── utils.ts                   # cn() helper
│   │   └── errors.ts                  # formatError() for user-facing messages
│   ├── types/
│   │   └── index.ts                   # All shared TypeScript types
│   └── styles/
│       └── index.css                  # Tailwind directives, CM6 styles, scrollbar
├── contexts/                          # Seed files (bundled into resources)
│   ├── system.md
│   ├── user.md
│   └── org.md
├── electron.vite.config.ts
├── eslint.config.js
├── vitest.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
├── index.html
└── package.json
```

---

## Architecture

Red Ledger follows Electron's strict two-process model with a **service-oriented main process**:

```
┌──────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │  Services    │  │  IPC Adapters   │  │  Registries         │  │
│  │  ─────────── │  │  ─────────────  │  │  ───────────────    │  │
│  │  Conversation│  │  contract.ts    │  │  Provider registry  │  │
│  │  Settings    │←─│  typedIpc.ts    │  │  Tool registry      │  │
│  │  Workspace   │  │  validate.ts    │  │  (self-registering) │  │
│  │  Context     │  │  db / fs / llm  │  │                     │  │
│  │  Search      │  │  settings ...   │  │                     │  │
│  │  LLM         │  │                 │  │                     │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│                          ▲                                       │
│                          │  IPC via contextBridge                │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Renderer Process (Chromium)                              │    │
│  │  React 18 / Zustand / CodeMirror 6 / Tailwind / DaisyUI  │    │
│  │  Notification bus decouples stores from UI                │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### Design principles

- **Services own domain logic.** Each service (`ConversationService`, `SettingsService`, etc.) is Electron-free and testable with plain Node.
- **IPC adapters are thin.** They validate inputs at the boundary and delegate to the appropriate service. No business logic lives in the IPC layer.
- **Type-safe IPC contract.** A single `IpcContract` interface in `contract.ts` defines every channel's param and return types. The `handleIpc()` wrapper enforces these types at compile time.
- **Self-registering registries.** Providers and tools register themselves at import time — adding a new provider or tool requires one file and one `registerProvider()`/`registerTool()` call.
- **Dependency injection.** Services accept interfaces (`DialogAdapter`, `StreamSink`) rather than concrete Electron APIs, enabling isolated unit tests.
- **Explicit wiring.** Dependencies between services are wired via callbacks in `main.ts` — no hidden imports between services or IPC handlers.
- **Notification bus.** A tiny pub-sub in `src/lib/notify.ts` lets stores emit toasts without importing `uiStore`, eliminating circular dependencies.

### Hard rules enforced

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` — always.
- The renderer never touches the filesystem, database, network, or API keys directly. Everything goes through IPC.
- A single `window.redLedger` API object (defined in `preload.ts`) is the only surface the renderer can call.
- Native modules run in the main process only.
- Single instance lock prevents multiple app windows.

---

## LLM Providers

| Provider | Streaming | Tool Use | Auth |
|----------|-----------|----------|------|
| **OpenAI** | SSE (`/chat/completions`) | Yes | API key |
| **OpenRouter** | SSE (OpenAI-compatible) | Yes | API key |
| **Ollama** | NDJSON (`/api/chat`) | Limited | None (local) |

- Base URLs are configurable per provider in Settings.
- The model dropdown fetches available models from the provider's list endpoint.
- Streaming uses a unique per-call IPC channel to prevent collisions.
- Tool calls are interleaved with surrounding text so the LLM can narrate its actions mid-response.
- Tool rounds are capped at 10 to prevent infinite loops.
- Providers self-register via the provider registry — adding a new provider requires one file.

---

## Tool System

The LLM can invoke these tools during a conversation:

| Tool | Description |
|------|-------------|
| `read_file` | Read a file from the workspace |
| `write_file` | Write or overwrite a workspace file |
| `append_file` | Append content to a workspace file |
| `list_files` | List the workspace directory tree |
| `web_search` | Search the web (Tavily or SerpAPI) |

Tools self-register via the tool registry. All file tools are routed through the jailed file system. Strict mode shows a native confirmation dialog before each operation. Overwriting an existing file always prompts for confirmation, regardless of strict mode. Tool errors are caught and returned in the result so the LLM can self-correct without crashing the stream.

---

## File System Security

All LLM-initiated file operations are confined to the user-selected workspace directory:

- Path traversal patterns (`../`, `~/`, absolute paths, UNC paths) are rejected
- Symbolic links are rejected at every path component
- Windows-invalid characters are blocked
- Null bytes and control characters are rejected
- `.gitignore` patterns are parsed and applied to directory listings
- Hardcoded skips for `node_modules`, `.git`, `.DS_Store`, `Thumbs.db`

The path jail (`pathJail.ts`) and gitignore parser (`gitignore.ts`) are extracted as pure utilities with no Electron imports, making them directly testable.

---

## Context Files

Three persistent markdown files are injected as the system prompt for every LLM request:

| File | Purpose |
|------|---------|
| **System** | Core behavioral instructions |
| **User** | Personal info, preferences, writing style |
| **Organization** | Mission, key terms, style guidelines |

These are stored in the OS `userData` directory (or alongside the binary in portable mode), independent of any workspace. Each editor can load content from an external `.txt` or `.md` file, and has a bundled seed file that can be restored via the Reset button.

---

## Testing

Tests run with **Vitest** in Node environment. Test files live alongside production code in `__tests__/` directories.

```bash
npm run test          # Run all tests once
npm run test:watch    # Watch mode
```

**Current test coverage:**

| Test file | Covers |
|-----------|--------|
| `pathJail.test.ts` | Path traversal rejection, symlink detection, Windows-specific cases |
| `gitignore.test.ts` | Glob-to-regex conversion, negation rules, directory-only patterns |
| `SettingsService.test.ts` | Input sanitization, clamping, portable mode path resolution |
| `registry.test.ts` | Tool registration and dispatch |

Services are testable in isolation because they accept injected dependencies (`DialogAdapter`, `StreamSink`) rather than importing Electron directly.

---

## Design

Custom DaisyUI theme inspired by vintage ledger books:

| Token | Hex | Usage |
|-------|-----|-------|
| RCA Red | `#DB1E1E` | Primary actions, cursor, active accents |
| Soft Charcoal | `#2C2C2C` | Text, secondary backgrounds |
| Paper | `#FDFCF8` | Main background |
| Paper Stack | `#F4F1EA` | Sidebar, gutters |
| Weathered | `#E5E0D5` | Borders, dividers |
| Leather | `#8B4513` | Accent (sparingly) |

Typography: **Inter** for body text, **JetBrains Mono** for code and editors.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Electron + Vite HMR dev server |
| `npm run build` | Production compile (all targets) |
| `npm run preview` | Preview production build locally |
| `npm run rebuild` | Rebuild native modules for Electron |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run lint` | ESLint on `src/` and `electron/` |
| `npm run test` | Run Vitest tests once |
| `npm run test:watch` | Vitest watch mode |

---

## Portable Mode

Place a `settings.json` file in the `resources/` directory next to the executable. When detected, Red Ledger stores settings and the SQLite database alongside the binary instead of in the OS user data path. Useful for USB deployments.

---

## License

[MIT](LICENSE) &copy; domwxyz
