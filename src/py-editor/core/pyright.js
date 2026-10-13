// Pyright LSP 单例客户端（@typefox/pyright-browser 1.1.299 worker）。
// 协议要点（实测）：
// 1) boot: worker.postMessage({type:'browser/boot', mode:'foreground'})
// 2) stubs 必须在 initialize 的 initializationOptions.files 里一次性注入（key 为绝对路径），
//    pyright/createFile 在后台 worker 未就绪时会被 enqueueRequest 静默丢弃 —— 不能用！
// 3) 之后走标准 LSP：didChange 全量同步 / publishDiagnostics / completion / hover。
// 单例：跨路由/主题切换只 boot 一次，避免重复加载 WASM。

const DOC_URI = "file:///main.py";
let client = null;

export function getPyright() {
  if (client) return client;
  client = createClient();
  return client;
}

function createClient() {
  const state = {
    worker: null,
    ready: false,
    failed: false,
    version: 1,
    reqId: 1,
    pending: new Map(),
    onDiagnostics: null,
    onStatus: null,
    diags: [], // 最近一次诊断（CM 坐标 + 中文文案），供 hover 统一展示
  };

  const notify = (method, params) => {
    if (state.worker) state.worker.postMessage({ jsonrpc: "2.0", method, params });
  };
  const request = (method, params) =>
    new Promise((res) => {
      const id = state.reqId++;
      state.pending.set(id, res);
      state.worker.postMessage({ jsonrpc: "2.0", id, method, params });
    });

  const pushDoc = (text) => {
    if (!state.ready) return;
    state.version++;
    notify("textDocument/didChange", {
      textDocument: { uri: DOC_URI, version: state.version },
      contentChanges: [{ text }],
    });
  };

  let timer = null;
  const schedulePush = (getDoc) => {
    clearTimeout(timer);
    timer = setTimeout(() => pushDoc(getDoc()), 400);
  };

  async function boot(initialText) {
    try {
      const worker = new Worker("pyright.worker.js");
      worker.onerror = () => { state.failed = true; if (state.onStatus) state.onStatus("failed"); };
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (!m || typeof m !== "object" || m.type) return;
        if (m.id && state.pending.has(m.id)) {
          const r = state.pending.get(m.id);
          state.pending.delete(m.id);
          r(m);
          return;
        }
        if (m.method === "textDocument/publishDiagnostics" && state.onDiagnostics)
          state.onDiagnostics(m.params.diagnostics || []);
      };
      state.worker = worker;
      worker.postMessage({ type: "browser/boot", mode: "foreground" });

      const bundle = await fetch("typeshed-bundle.json").then((r) => r.json());
      const files = {};
      for (const [p, t] of Object.entries(bundle)) files["/" + p] = t;
      await request("initialize", {
        processId: null,
        rootUri: null,
        capabilities: { textDocument: { completion: { completionItem: { documentationFormat: ["plaintext"] } } } },
        initializationOptions: { files },
      });
      notify("initialized", {});
      notify("workspace/didChangeConfiguration", {
        settings: {
          python: {
            pythonVersion: "3.10",
            typeshedPath: "/typeshed-fallback",
            stubPath: "/stubs",
            analysis: { typeCheckingMode: "basic", diagnosticSeverityOverrides: { reportMissingModuleSource: "none" } },
          },
        },
      });
      state.version = 1;
      notify("textDocument/didOpen", {
        textDocument: { uri: DOC_URI, languageId: "python", version: state.version, text: initialText },
      });
      state.ready = true;
      if (state.onStatus) state.onStatus("ready");
    } catch (e) {
      console.warn("pyright boot failed:", e);
      state.failed = true;
      if (state.onStatus) state.onStatus("failed");
    }
  }

  return {
    DOC_URI,
    get ready() { return state.ready; },
    get failed() { return state.failed; },
    get diags() { return state.diags; },
    set diags(v) { state.diags = v; },
    set onDiagnostics(fn) { state.onDiagnostics = fn; },
    set onStatus(fn) { state.onStatus = fn; },
    notify, request, pushDoc, schedulePush, boot,
  };
}

// CM 位置 → LSP 位置（LSP 用 UTF-16 code units，中文注释会偏移，需换算）
export function cmToLspPos(doc, cmPos) {
  const lineObj = doc.lineAt(cmPos);
  return { line: lineObj.number - 1, character: lineObj.text.slice(0, cmPos - lineObj.from).length };
}
export function lspCharToCmCol(lineText, character) {
  return [...lineText.slice(0, Math.min(character, lineText.length))].length;
}
