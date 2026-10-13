// 补全源（单一源版）：
//   Pyright LSP 就绪 → 以 LSP 候选为主，本地函数提示表（PY_FN）的签名/中文说明/示例嫁接到同名项；
//   LSP 未就绪/失败 → 本地表 + 关键字 + 本文件自定义名整包兜底（离线机房也有完整提示）。
// 按 label 去重，消灭「两条 print」。签名/参数卡弹窗（打 "(" 触发）在 usePyEditor 里实现。
// ⚠️ autocompletion 的 override 是「替换」默认源：必须保证任何情况下都有本地兜底。
import { PY_KEYWORDS, PY_FN, PY_FN_MAP } from "./constants.js";
import { cmToLspPos } from "./pyright.js";

const KIND = {
  2: "method", 3: "function", 4: "constructor", 5: "field", 6: "variable", 7: "class",
  8: "interface", 9: "module", 14: "keyword", 21: "constant",
};

// 函数提示信息面板（候选选中时展示）：签名行 + 中文说明 + 可照抄示例
export function buildFnInfoDom(fn) {
  const dom = document.createElement("div");
  dom.className = "fn-info";
  const sig = document.createElement("div");
  sig.className = "fn-info-sig";
  const name = document.createElement("span");
  name.className = "fn-info-name";
  name.textContent = fn.label;
  const sigText = document.createElement("span");
  sigText.textContent = fn.sig.slice(fn.label.length);
  sig.append(name, sigText);
  const desc = document.createElement("div");
  desc.className = "fn-info-desc";
  desc.textContent = fn.desc;
  dom.append(sig, desc);
  if (fn.example) {
    const ex = document.createElement("div");
    ex.className = "fn-info-ex";
    const tag = document.createElement("span");
    tag.className = "fn-info-ex-tag";
    tag.textContent = "例";
    const code = document.createElement("code");
    code.textContent = fn.example;
    ex.append(tag, code);
    dom.appendChild(ex);
  }
  return dom;
}

// 本文件自定义名（def/class/赋值/for 变量），供兜底补全
function docNames(src) {
  return [
    ...new Set([
      ...[...src.matchAll(/(?:def|class)\s+(\w+)/g)].map((m) => m[1]),
      ...[...src.matchAll(/^[ \t]*(\w+)\s*=[^=]/gm)].map((m) => m[1]),
      ...[...src.matchAll(/for\s+([\w,\s]+?)\s+in\s/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean)),
    ]),
  ].filter(Boolean);
}

export function makeCompletionSources(pyr) {
  const complete = async (context) => {
    const word = context.matchBefore(/[\w.]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;

    // ① Pyright 候选（就绪才问，失败静默）
    let lspOpts = [];
    if (pyr.ready) {
      try {
        const doc = context.state.doc;
        pyr.pushDoc(doc.toString());
        const res = await pyr.request("textDocument/completion", {
          textDocument: { uri: pyr.DOC_URI },
          position: cmToLspPos(doc, context.pos),
        });
        const items = (res.result && (res.result.items || res.result)) || [];
        lspOpts = items.slice(0, 200).map((it) => ({
          label: it.label,
          detail: it.detail || "",
          type: KIND[it.kind] || null,
          apply: it.insertText && it.insertText !== it.label ? it.insertText : undefined,
          boost: BUILTIN_BOOST(it.label),
        }));
      } catch (e) { lspOpts = []; }
    }

    // ② 合并去重：LSP 优先；本地表信息嫁接到同名项；本文件名/关键字/函数表补缺
    const seen = new Set();
    const options = [];
    for (const o of lspOpts) {
      seen.add(o.label);
      const fn = PY_FN_MAP.get(o.label);
      if (fn) {
        o.detail = fn.desc;           // 候选行右侧直接给中文用途（打印提示不再藏进信息面板）
        o.info = () => ({ dom: buildFnInfoDom(fn) }); // 信息面板：签名+说明+示例
        o.type = o.type || "function";
        o.boost = 4;                  // 常用函数置顶
      } else if (/^_/.test(o.label)) {
        o.boost = -1;
      }
      options.push(o);
    }
    for (const n of docNames(context.state.doc.toString())) {
      if (seen.has(n)) continue;
      seen.add(n);
      options.push({ label: n, type: "variable", boost: 3 });
    }
    for (const f of PY_FN) {
      if (seen.has(f.label)) continue;
      seen.add(f.label);
      options.push({ label: f.label, detail: f.desc, info: () => ({ dom: buildFnInfoDom(f) }), type: "function", boost: 4 });
    }
    for (const k of PY_KEYWORDS) {
      if (seen.has(k)) continue;
      seen.add(k);
      options.push({ label: k, type: "keyword", boost: 1 });
    }
    if (!options.length) return null;
    return { from: word.from, options, validFor: /^[\w.]*$/ };
  };
  return [complete];
}

const BUILTIN_BOOST = (label) => (PY_FN_MAP.has(label) ? 4 : /^_/.test(label) ? -1 : /^[A-Z]/.test(label) ? 0 : 1);
