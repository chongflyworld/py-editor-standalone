// Skulpt 运行时：本地自托管（public/skulpt.min.js + skulpt-stdlib.js），
// 机房离线可用。仅加载一次（全局单例 window.Sk）。
let _loading = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("加载失败：" + src));
    document.head.appendChild(el);
  });
}

export function loadSkulpt() {
  if (window.Sk && window.Sk.importMainWithBody) return Promise.resolve(window.Sk);
  if (_loading) return _loading;
  _loading = (async () => {
    await injectScript("skulpt.min.js");
    await injectScript("skulpt-stdlib.js");
    if (!window.Sk || !window.Sk.importMainWithBody) throw new Error("Skulpt 未就绪");
    return window.Sk;
  })();
  return _loading;
}

// 运行时报错 → 中文（行内 / 反馈区复用）
export function formatSkError(err) {
  let text = (err && err.toString) ? err.toString() : String(err);
  if (typeof text !== "string") text = String(text);
  const lineM = text.match(/line (\d+)/);
  const lines = text.trim().split("\n");
  const lastM = lines[lines.length - 1].match(/^([\w.]+Error|[\w.]+Exception):\s*(.*)$/);
  let head = "";
  let lineNo = null;
  if (lineM) { lineNo = parseInt(lineM[1], 10); head += "第 " + lineNo + " 行"; }
  if (lastM) {
    const en = lastM[1];
    const msg = lastM[2];
    // ERR_CN 在 constants 中
    const { ERR_CN } = window.__PYE_CONST || {};
    const cn = (ERR_CN && ERR_CN[en]) || en;
    head += (head ? "\n" : "") + "❌ " + cn + (cn !== en ? " (" + en + ")" : "") + (msg ? ": " + msg : "");
  }
  return { text: (head ? head + "\n\n" : "") + text, lineNo };
}

// 海龟隐藏目标（画布区 S1 未做，先用隐藏容器兜底，保证 turtle 代码可运行不崩）
function ensureTurtleTarget() {
  let t = document.getElementById("pye-turtle-hidden");
  if (!t) {
    t = document.createElement("div");
    t.id = "pye-turtle-hidden";
    t.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:320px;height:320px;overflow:hidden;";
    document.body.appendChild(t);
  }
  return t;
}

// 运行 Python 源码。回调式输出/输入。返回 Promise<{ ok, text, lineNo, timeout }>。
// opts: { stdin: string[], onOutput(t), onErrorLine(lineNo), onInput(prompt), timeoutMs }
//   stdin   预填输入行（input() 到达时优先消费，消费完才回调 onInput 请求交互输入）
//   onInput 程序执行到 input() 需要键入时调用，返回 Promise<string>（UI 提交后 resolve）；
//           不传则退化为纯预填模式（预填耗尽返回空串）
//   timeoutMs 判题用墙钟超时（毫秒）：映射到 Sk.execLimit。超时抛 TimeLimitError 中断 VM
//           （返回 timeout:true）。⚠️ execStart 只初始化一次，每次运行前 delete 换新鲜预算；
//           不传 timeoutMs 时显式恢复 Infinity，避免上次判题的限额泄漏到交互运行。
// ⚠️ importMainWithBody 第 4 参 canSuspend 必须为真，否则 input() 挂起会抛 SuspensionError。
export async function runPython(src, opts = {}) {
  const Sk = await loadSkulpt();
  const { onOutput, onErrorLine, onInput } = opts;
  const stdin = opts.stdin || [];
  let si = 0;
  const takeStdin = () => (si < stdin.length ? stdin[si++] : null);

  function builtinRead(filename) {
    if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[filename] === undefined)
      throw "File not found: '" + filename + "'";
    return Sk.builtinFiles.files[filename];
  }

  Sk.configure({
    output: (t) => { if (onOutput) onOutput(t); },
    read: builtinRead,
    inputfun: (prompt) => {
      const pre = takeStdin();
      if (pre !== null) return pre;               // 预填行直接消费（同步）
      if (onInput) return onInput(prompt || "");  // 交互输入：Promise，程序挂起等学生键入
      return "";
    },
    inputfunTakesPrompt: true,
    __future__: Sk.python3,
  });
  // 墙钟超时（判题）。必须在 importMainWithBody 编译前设好——编译期决定是否注入计时检查。
  if (opts.timeoutMs) {
    Sk.execLimit = opts.timeoutMs;
    delete Sk.execStart; // execStart 只初始化一次；删除后本次运行重新计时
  } else {
    Sk.execLimit = Number.POSITIVE_INFINITY;
    delete Sk.execStart;
  }
  Sk.TurtleGraphics = Sk.TurtleGraphics || {};
  Sk.TurtleGraphics.target = "pye-turtle-hidden";
  Sk.TurtleGraphics.width = 320;
  Sk.TurtleGraphics.height = 320;
  const tEl = ensureTurtleTarget();
  if (tEl) tEl.innerHTML = "";

  // Skulpt 1.2.0 的 importMainWithBody 出错时同步 throw、成功时可能返回 Promise 或 undefined，
  // 故同时兼容「同步抛错」与「Promise」两种形态。
  // ⚠️ canSuspend=true 时程序挂起（如 input() 等学生键入）会返回 Suspension 对象而非跑完，
  //    必须用 asyncToPromise 包裹驱动，否则 run() 会提前返回、输出丢失。
  try {
    const result = Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, src, true));
    if (result && typeof result.then === "function") {
      await result;
    }
    return { ok: true, text: null, lineNo: null, timeout: false };
  } catch (errObj) {
    const f = formatSkError(errObj);
    const isTimeout = /TimeLimitError|exceeded run time limit/.test(String(errObj));
    if (f.lineNo && onErrorLine) onErrorLine(f.lineNo);
    return { ok: false, text: f.text, lineNo: f.lineNo, timeout: isTimeout };
  }
}

// 让 composable 注入常量表（避免 constants 循环依赖）
export function bindConstants(constObj) {
  window.__PYE_CONST = constObj;
}
