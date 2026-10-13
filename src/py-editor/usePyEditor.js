// usePyEditor：把内核（CM6 + Skulpt + Pyright + 中文全角扫描 + 中文诊断）接到 Vue 响应式状态。
// 组件侧只需：const ed = usePyEditor(); <div ref="ed.editorHost">；onMounted(ed.mount); onUnmounted(ed.destroy)。
import { ref, computed, reactive, watch } from "vue";

import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars,
  hoverTooltip, Decoration, ViewPlugin,
} from "@codemirror/view";
import {
  EditorState, Prec, Compartment,
} from "@codemirror/state";
import {
  indentOnInput, bracketMatching, indentUnit,
} from "@codemirror/language";
import {
  defaultKeymap, history, historyKeymap, indentMore, indentLess,
} from "@codemirror/commands";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, acceptCompletion,
} from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";

import { getPyright, cmToLspPos, lspCharToCmCol } from "./core/pyright.js";
import { buildCmTheme, buildHighlight } from "./core/cmTheme.js";
import { buildErrMark, buildLintMark, buildFwMark, fwYieldEffect } from "./core/cmMarks.js";
import { makeCompletionSources } from "./core/completion.js";
import { cnDiagEx, classifyDiag, diagParts, TIER_LABEL, TIER_SUG, PY_FN_MAP } from "./core/constants.js";
import { loadSkulpt, runPython, bindConstants } from "./core/skulpt.js";
import { ERR_CN } from "./core/constants.js";
import { message } from "ant-design-vue";

bindConstants({ ERR_CN });

export function usePyEditor() {
  const editorHost = ref(null);
  const engineReady = ref(false);   // Skulpt + CM 就绪（Pyright 可能仍在 boot）
  const pyrStatus = ref("loading"); // loading | ready | failed
  const fwCount = ref(0);
  const diagnostics = ref([]);        // [{ from, to, line, sev, cn }]
  const output = ref("");            // 运行输出（含报错）
  const running = ref(false);
  const caretLine = ref(1);
  const caretCol = ref(1);
  const statusText = ref("初始化中…");
  const isDark = ref(false); // 暗色状态：由 :class 响应式接管，禁止命令式 toggle（会被 Vue patch 覆盖）
  const editorFocused = ref(false);  // 编辑区聚焦（方案 A 呼吸光环触发条件）
  const outputFocused = ref(false);  // 输出区高亮（运行后转移，驻留到下次操作）
  const awaitingInput = ref(false);  // 程序执行到 input()，等待学生键入（控制台聚焦+流光）
  const inputPrompt = ref("");       // 当前 input() 的提示语（S7.26 起与输入框同行常驻，不再进输出流）
  const inputPromptNonStr = ref(false); // S7.26：提示语非字符串（input(134) 忘加引号）→ 输入行显示 ⚠ 弱标记
  // 控制台状态机：idle 等待运行 / running 运行中 / awaiting 等待输入 / done 完成 / err 出错
  // / stopped 已停止 / judging 判分中 / scored 判题完成（S7）
  const runState = ref("idle");
  // ── S7 判题状态 ──
  const judging = ref(false);      // 判分中（按钮 loading + 状态栏）
  const judgeResult = ref(null);   // { score, passed, total, cases:[{name,ok,timeout,input,expected,actual,err}], durationMs, at }
  let inputResolver = null;          // 挂起的 input() Promise resolve
  let inputRejector = null;          // 挂起的 input() Promise reject（S7.31 停止用：reject → Skulpt 抛异常中止）
  let userStopped = false;           // S7.31：用户主动停止标志（区分"已停止"与"运行出错"）
  let runId = 0;                     // S7.31：运行编号，防旧执行收尾污染停止后启动的新运行

  // ── 外观自定义（S4：L1 预设 + L2 主色/字号/行高/字体）──
  // 单一真源 = 这些 ref；applyVars 把它们写进 .code-host 的 --cm-* 内联变量；
  // 主色/暗色同时喂给 antd ConfigProvider（组件 themeObj 读 ed.accent / ed.isDark）。
  const fontSize = ref(24);        // 14–36px，代码+输出联动（默认24，可调到30+）
  const lineHeight = ref(1.6);     // 1.3–2.0
  const fontFamily = ref("Cascadia Code");
  const accent = ref("#1F5F4F");   // 主色
  const preset = ref("mint");      // mint | classic | contrast | sepia
  const APPEAR_KEY = "pye-appearance-v1";
  const PRESETS = {
    mint:     { dark: false, primary: "#1F5F4F", name: "薄荷亮色" },
    classic:  { dark: true,  primary: "#4EC9B0", name: "经典暗色" },
    contrast: { dark: false, primary: "#0F3D33", name: "高对比度" },
    sepia:    { dark: false, primary: "#8A6A2F", name: "暖纸" },
  };
  const FONT_STACKS = {
    "Cascadia Code": '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
    "Consolas": 'Consolas, "Courier New", monospace',
    "JetBrains Mono": '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    "Fira Code": '"Fira Code", "Cascadia Mono", Consolas, monospace',
    "微软雅黑": '"Microsoft YaHei", "微软雅黑", Consolas, monospace',
  };
  const tint = (hex, w) => { // 与白色混合，w=0 白 ↔ w=1 原色
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (!isFinite(n)) return hex;
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * w); g = Math.round(g + (255 - g) * w); b = Math.round(b + (255 - b) * w);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  const shade = (hex, w) => { // 与暗底 #12211c 混合，w=1 全暗底
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (!isFinite(n)) return hex;
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (0x12 - r) * w); g = Math.round(g + (0x21 - g) * w); b = Math.round(b + (0x1c - b) * w);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  // 渠道②：自写外壳（顶栏/面板/ghost 按钮/问题卡/提示）用的主色派生变量。
  // 跟随主色 + 明暗（亮=与白混出浅底，暗=与暗底混出深底），注入到 .py-page :style。
  const chromeVars = computed(() => {
    const a = accent.value;
    const dark = isDark.value;
    return {
      "--pg-primary": a,
      /* S7.25：前景「墨水」主色。⚠️ --pg-primary 切明暗不变（保留用户自定义强调色），
         暗色下深绿压 #1a2622 实测仅 ~2:1 —— 激活 tab 文字比未激活白字还暗（语义反转）、
         状态栏运行态/示例标签同样糊。→ 凡「文字/下划线/光标」一律改用 ink：
         亮=主色本身；暗=与白混 55% 提亮（约 #95C3B5 量级，>7:1）。 */
      "--pg-primary-ink": dark ? tint(a, 0.55) : a,
      /* S7.25：控制台统一字号口径 = 编辑器字号 - 2px。
         print 输出（.stdout-pre 内联样式）与输入框/占位层（本变量）同源，缩放时一起变。 */
      "--pg-console-font": (fontSize.value - 2) + "px",
      /* S7.28：输入行行高与 print 输出同源（原写死 1.7，与 pre 的 lineHeight 差 1.2px 基线） */
      "--pg-console-lh": String(lineHeight.value),
      "--pg-primary-bg": dark ? shade(a, 0.82) : tint(a, 0.90),
      "--pg-primary-soft": dark ? shade(a, 0.55) : tint(a, 0.55),
    };
  });
  const loadAppearance = () => {
    try {
      const raw = localStorage.getItem(APPEAR_KEY);
      if (!raw) return;
      const a = JSON.parse(raw);
      if (a.fontSize) fontSize.value = Math.min(36, Math.max(14, a.fontSize));
      if (a.lineHeight) lineHeight.value = Math.min(2, Math.max(1.3, a.lineHeight));
      if (a.fontFamily && FONT_STACKS[a.fontFamily]) fontFamily.value = a.fontFamily;
      if (a.accent) accent.value = a.accent;
      if (a.preset && PRESETS[a.preset]) preset.value = a.preset;
      isDark.value = PRESETS[preset.value].dark;
    } catch (e) { /* 忽略损坏的本地缓存 */ }
  };
  const persist = () => {
    try {
      localStorage.setItem(APPEAR_KEY, JSON.stringify({
        fontSize: fontSize.value, lineHeight: lineHeight.value, fontFamily: fontFamily.value,
        accent: accent.value, preset: preset.value,
      }));
    } catch (e) { /* 隐私模式等场景忽略 */ }
  };
  const applyVars = () => {
    const h = editorHost.value;
    if (!h) return;
    h.style.setProperty("--cm-font", fontSize.value + "px");
    h.style.setProperty("--cm-line-height", String(lineHeight.value));
    h.style.setProperty("--cm-font-family", FONT_STACKS[fontFamily.value] || FONT_STACKS["Cascadia Code"]);
    h.style.setProperty("--cm-accent", accent.value);
    // ⚠️ accent-soft 必须跟随明暗：亮色混白、暗色混暗底。
    // 内联样式优先级高于 .is-dark 类定义，若恒用亮色值，暗色下选中行/参数卡高亮条会被刷成浅色（S7.9 用户实测踩坑）。
    h.style.setProperty("--cm-accent-soft", isDark.value ? shade(accent.value, 0.82) : tint(accent.value, 0.88));
  };

  let view = null;
  let errApi = null;   // { setErrEffect }
  let lintApi = null;  // { setLintsEffect }
  let fwRef = { current: [] };
  let diagRef = { current: [] }; // 当前 Pyright 诊断区间（供 fw 让位判断）
  let runRef = null;
  let starterCode = "";
  let stdinValue = null; // 由组件通过 setStdin 注入（读取 stdin textarea）
  const pyr = getPyright();

  // 数量变化才更新，避免每敲一字符都触发重渲染
  let _fwN = 0;
  const onFwCount = (n) => {
    if (n === _fwN) return;
    _fwN = n;
    fwCount.value = n;
  };
  const jumpFw = () => {
    const hits = fwRef.current || [];
    if (!hits.length || !view) return;
    const h = hits[0];
    view.dispatch({ selection: { anchor: h.from, head: h.to }, scrollIntoView: true });
    view.focus();
  };

  // ── 统一 hover（单一提示源：全角符号 > 本地诊断 > Pyright LSP）──
  // 弹窗版式（学生低心智负担）：D 为主（一句诊断 + 错→对示例），C 兜底（一句诊断 + 改法）。
  // 弹窗内不出现 Pyright 英文原文（决策 2026-10-12）；英文只留在「问题」面板。
  const mkTip = (cls, parts) => {
    const dom = document.createElement("div");
    dom.className = "lint-tip " + cls;
    // 第一行：档位徽章 + 一句诊断
    const head = document.createElement("div");
    head.className = "tip-head";
    if (parts.tier && TIER_LABEL[parts.tier]) {
      const badge = document.createElement("span");
      badge.className = "tip-tier";
      badge.textContent = TIER_LABEL[parts.tier];
      head.appendChild(badge);
    }
    const short = document.createElement("span");
    short.className = "tip-short";
    short.textContent = String(parts.short || "").slice(0, 80);
    head.appendChild(short);
    // 符号芯片：代码底色块单独展示闯祸的符号（加中文回退字体，全角字形才不渲染错）
    if (parts.chip) {
      const chip = document.createElement("span");
      chip.className = "tip-chip";
      chip.textContent = parts.chip;
      head.appendChild(chip);
    }
    dom.appendChild(head);
    // 第二行：D（错→对代码对照）优先，没有示例则退 C（改法一句话）
    if (parts.demo && parts.demo.bad && parts.demo.good) {
      const demo = document.createElement("div");
      demo.className = "tip-demo";
      const bad = document.createElement("code");
      bad.className = "tip-demo-bad";
      bad.textContent = parts.demo.bad;
      const arrow = document.createElement("span");
      arrow.className = "tip-demo-arrow";
      arrow.textContent = "→";
      const good = document.createElement("code");
      good.className = "tip-demo-good";
      good.textContent = parts.demo.good;
      demo.append(bad, arrow, good);
      dom.appendChild(demo);
    } else if (parts.fix) {
      const fix = document.createElement("div");
      fix.className = "tip-fix";
      const label = document.createElement("span");
      label.className = "tip-fix-label";
      label.textContent = "改法";
      const body = document.createElement("span");
      body.textContent = String(parts.fix).slice(0, 80);
      fix.append(label, body);
      dom.appendChild(fix);
    }
    return { dom };
  };
  const lspHover = async (v, pos) => {
    const doc = v.state.doc;
    const at = Math.min(Math.max(0, pos), doc.length);
    // ⓿ 实时中文全角符号（最高优先）
    for (const h of fwRef.current || []) {
      if (h.to <= doc.length && at >= h.from && at <= h.to) {
        return { pos: at, create: () => mkTip("is-fw", diagParts(null, true, h.ch, doc.lineAt(at).text)) };
      }
    }
    // ① 本地诊断优先：命中红/黄波浪线区间 → 中文错误提示
    for (const d of diagnostics.value) {
      if (d.to > doc.length) continue;
      if (at >= d.from && at <= d.to) {
        return { pos: at, create: () => mkTip(d.sev === 1 ? "is-err" : "is-warn", d.parts || { tier: d.tier, short: d.cn, fix: d.suggestion, demo: null }) };
      }
    }
    // ② 回退 Pyright LSP hover：类型/签名信息
    if (!pyr.ready) return null;
    try {
      const res = await pyr.request("textDocument/hover", {
        textDocument: { uri: pyr.DOC_URI },
        position: cmToLspPos(v.state.doc, pos),
      });
      const c = res.result && res.result.contents;
      const text = c && (typeof c === "string" ? c : c.value || "");
      if (!text) return null;
      return { pos, create: () => mkTip("is-info", text, "typ") };
    } catch (e) {
      return null;
    }
  };

  // ── 参数卡弹窗（打 "(" 后）：光标落在函数提示表内函数的括号里 → 显示签名 + 参数逐条说明 ──
  // 与补全列表天然互斥：CM 的 completion 弹层在打 "(" 时因词边界自动收起。
  let sigEl = null;
  let sigRetry = 0;
  const hideSigTip = () => { if (sigEl) { sigEl.remove(); sigEl = null; } };
  const renderSigTip = (fn, active, parenPos) => {
    const host = editorHost.value;
    if (!host || !view) return;
    if (!sigEl) { sigEl = document.createElement("div"); sigEl.className = "sig-tip"; host.appendChild(sigEl); }
    sigEl.textContent = "";
    const sig = document.createElement("div");
    sig.className = "fn-info-sig";
    const name = document.createElement("span");
    name.className = "fn-info-name";
    name.textContent = fn.label;
    sig.appendChild(name);
    const names = fn.params.map((p) => p.name);
    const open = document.createElement("span");
    open.textContent = "(";
    sig.appendChild(open);
    names.forEach((n, i) => {
      const s = document.createElement("span");
      s.textContent = n;
      if (i === active) s.className = "sig-active";
      sig.appendChild(s);
      if (i < names.length - 1) {
        const comma = document.createElement("span");
        comma.textContent = ", ";
        sig.appendChild(comma);
      }
    });
    const close = document.createElement("span");
    close.textContent = ")";
    sig.appendChild(close);
    sigEl.appendChild(sig);
    if (fn.params.length) {
      const list = document.createElement("div");
      list.className = "sig-params";
      fn.params.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "sig-param" + (i === active ? " on" : "");
        const code = document.createElement("code");
        code.textContent = p.name;
        const desc = document.createElement("span");
        desc.textContent = p.desc;
        row.append(code, desc);
        list.appendChild(row);
      });
      sigEl.appendChild(list);
    }
    // 定位：对准 "("，防止越出编辑区
    try {
      const r = view.coordsAtPos(Math.min(parenPos, view.state.doc.length));
      const hr = host.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.left - hr.left), Math.max(8, host.clientWidth - 340));
      sigEl.style.left = left + "px";
      sigEl.style.top = (r.bottom - hr.top + 4) + "px";
    } catch (e) { /* 坐标越界等忽略，保持上次位置 */ }
  };
  const updateSigTip = () => {
    if (!view) return hideSigTip();
    const _dbg = (import.meta.env && import.meta.env.DEV) ? (window.__sigDbg = window.__sigDbg || []) : null;
    const _d = (why) => { if (_dbg) { _dbg.push(why); if (_dbg.length > 40) _dbg.shift(); } };
    try {
      // 补全弹层/信息面板打开时不抢屏（⚠️ 不用 completionStatus：异步源下它长期返回 active，
      // 弹层早关了状态仍为真，会把参数卡永久压住 —— 以 DOM 为准）。
      // 弹层关闭与打 "(" 同帧竞态：关着时安排短重试，直到弹层真正从 DOM 消失后再弹参数卡。
      if (view.dom.querySelector(".cm-tooltip-autocomplete")) {
        if (sigRetry < 6) { sigRetry++; setTimeout(updateSigTip, 150); }
        _d("comp-dom");
        return hideSigTip();
      }
      sigRetry = 0;
      const state = view.state;
      const head = state.selection.main.head;
      const base = Math.max(0, head - 400);
      const before = state.doc.sliceString(base, head);
      // 找光标前最后一个未闭合的 "("（跳过配对括号）
      let depth = 0, openRel = -1;
      for (let i = before.length - 1; i >= 0; i--) {
        const c = before[i];
        if (c === ")" || c === "]" || c === "}") depth++;
        else if (c === "(") { if (depth === 0) { openRel = i; break; } depth--; }
        else if ((c === "]" || c === "}") && depth > 0) depth--;
      }
      if (openRel < 0) { _d("no-open:" + JSON.stringify(before.slice(-8))); return hideSigTip(); }
      const m = before.slice(0, openRel).match(/([A-Za-z_]\w*)\s*$/);
      if (!m) { _d("no-name"); return hideSigTip(); }
      const fn = PY_FN_MAP.get(m[1]);
      if (!fn) { _d("no-fn:" + m[1]); return hideSigTip(); }
      // 当前参数序号：数 "(" 到光标之间的顶层逗号（跳过字符串与嵌套括号）
      const inner = before.slice(openRel + 1);
      let d = 0, idx = 0, inStr = null, over = false;
      for (let i = 0; i < inner.length; i++) {
        const c = inner[i];
        if (inStr) { if (c === inStr) inStr = null; continue; }
        if (c === '"' || c === "'") { inStr = c; continue; }
        if (c === "(" || c === "[" || c === "{") d++;
        else if (c === ")" || c === "]" || c === "}") { if (d === 0) { over = true; break; } d--; }
        else if (c === "," && d === 0) idx++;
      }
      if (over) { _d("over"); return hideSigTip(); }
      _d("show:" + fn.label + "#" + idx);
      renderSigTip(fn, Math.min(idx, Math.max(0, fn.params.length - 1)), base + openRel);
    } catch (e) { hideSigTip(); }
  };
  const scrollerScroll = () => { if (sigEl) updateSigTip(); };

  // 聚焦互斥：编辑区一聚焦，输出区高亮撤下（「驻留到下次操作」= 直到点回编辑区或再运行）
  watch(editorFocused, (v) => { if (v) outputFocused.value = false; });

  async function mount(initialDoc = "") {
    starterCode = initialDoc;
    if (!editorHost.value) return;
    const host = editorHost.value;
    loadAppearance(); // 读本地保存的外观（字号/行高/字体/主色/预设）

    const { errField, setErrEffect } = buildErrMark();
    errApi = { setErrEffect };
    const { lintField, setLintsEffect } = buildLintMark();
    lintApi = { setLintsEffect };
    fwRef.current = [];
    const fwPlugin = buildFwMark(fwRef, onFwCount, diagRef);

    const [completeSource] = makeCompletionSources(pyr);

    const basicSetup = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentUnit.of("    "),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [completeSource], activateOnTyping: true, icons: true }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
    ];

    const themeComp = new Compartment();

    view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          basicSetup,
          python(),
          themeComp.of([buildCmTheme(), buildHighlight()]),
          errField,
          lintField,
          fwPlugin,
          hoverTooltip(lspHover, { hoverTime: 400 }),
          Prec.highest(keymap.of([{
            key: "Mod-Enter",
            run: () => { if (runRef) runRef(); return true; },
            preventDefault: true,
          }])),
          // 字号快捷键：Ctrl/Cmd + = 放大、- 缩小、0 复位
          Prec.highest(keymap.of([
            { key: "Mod-=", run: () => { adjustFont(1); return true; }, preventDefault: true },
            { key: "Mod-+", run: () => { adjustFont(1); return true; }, preventDefault: true },
            { key: "Mod--", run: () => { adjustFont(-1); return true; }, preventDefault: true },
            { key: "Mod-0", run: () => { resetFont(); return true; }, preventDefault: true },
          ])),
          keymap.of([
            { key: "Tab", run: (v) => acceptCompletion(v) || indentMore(v) },
            { key: "Shift-Tab", run: indentLess },
          ]),
          // 编辑区聚焦/失焦：驱动呼吸光环与输出区高亮互斥
          EditorView.domEventHandlers({
            focus: () => { editorFocused.value = true; return false; },
            blur: () => { editorFocused.value = false; return false; },
          }),
          EditorView.updateListener.of((u) => {
            // 运行时改代码 → 清除红标
            if (u.docChanged && errApi && view) view.dispatch({ effects: errApi.setErrEffect.of(null) });
            // 文档变更 → 推送 Pyright（防抖 400ms）+ 丢弃越界陈旧诊断 + fw 让位重算
            if (u.docChanged && view) {
              const len = u.state.doc.length;
              if (pyr.diags.some((d) => d.to > len)) pyr.diags = pyr.diags.filter((d) => d.to <= len);
              diagRef.current = pyr.diags;
              view.dispatch({ effects: fwYieldEffect.of(null) });
              pyr.schedulePush(() => view.state.doc.toString());
              // 改代码 → 上次运行结果作废，状态栏回 idle（运行中/等待输入不受影响）
              // S7：scored（判题完成）同样作废——得分是旧代码的，且判题结果卡不得停留误导学生
              if (runState.value === "scored") {
                judgeResult.value = null;
                runState.value = "idle";
                statusText.value = "就绪";
                outputFocused.value = false;
              } else if (runState.value === "done" || runState.value === "err") {
                runState.value = "idle";
                outputFocused.value = false;
              }
            }
            // 光标 → 行列号 + 参数卡刷新（直接刷一次 + 延迟补刷：
            // 打 "(" 的事务里 completionStatus 瞬时为真会跳过，弹层关闭后靠补刷弹出）
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              caretLine.value = line.number;
              caretCol.value = head - line.from + 1;
              updateSigTip();
              setTimeout(updateSigTip, 60);
            }
          }),
        ],
      }),
      parent: host,
    });

    // ── Pyright 诊断 → 四色波浪线 + 质感块高亮 + 中文诊断列表 ──
    pyr.onDiagnostics = (diags) => {
      if (!view || !lintApi) return;
      const doc = view.state.doc;
      const b = [];
      const dlist = [];
      const D = doc.length;
      for (const d of diags) {
        try {
          const l0 = doc.line(Math.min(d.range.start.line + 1, doc.lines));
          const l1 = doc.line(Math.min(d.range.end.line + 1, doc.lines));
          let from = Math.max(0, Math.min(l0.from + lspCharToCmCol(l0.text, d.range.start.character), D));
          let to = Math.min(l1.from + lspCharToCmCol(l1.text, d.range.end.character), D);
          if (to <= from) to = Math.min(from + 1, D);
          if (to <= from) from = Math.max(0, to - 1);
          if (to <= from) continue;
          const { cn, hasFw, fwCh } = cnDiagEx(doc, from, d.message, d.severity);
          const { tier, gran } = classifyDiag(d.message, d.severity, hasFw);
          // 粒度分档：token(涂块+波浪线) 仅当区间 ≤30 字符；否则退化为 expr(只画线)
          const isToken = gran === "token" && (to - from) <= 30;
          const cls = "cm-e-" + tier + (isToken ? " cm-e-tok" : "");
          b.push(Decoration.mark({ class: cls }).range(from, to));
          dlist.push({
            from, to, line: l0.number, sev: d.severity, cn,
            tier, gran: isToken ? "token" : "expr",
            suggestion: hasFw ? TIER_SUG.sym : TIER_SUG[tier],
            parts: diagParts(d.message, hasFw, fwCh, l0.text), // hover 弹窗要素（D 主 C 兜底，无英文）
          });
        } catch (e) {
          /* 越界等异常忽略单条 */
        }
      }
      b.sort((x, y) => x.from - y.from);
      dlist.sort((x, y) => x.from - y.from);
      pyr.diags = dlist;
      diagnostics.value = dlist;
      diagRef.current = dlist; // 供 fw 让位判断
      view.dispatch({ effects: lintApi.setLintsEffect.of(b.length ? Decoration.set(b, true) : Decoration.none) });
      if (fwPlugin) view.dispatch({ effects: fwYieldEffect.of(null) }); // 通知 fw 重扫让位
    };
    pyr.onStatus = (s) => { pyrStatus.value = s; };

    // Skulpt（同步）；Pyright（单例，跨路由不重复 boot）
    try {
      await loadSkulpt();
      engineReady.value = true;
      statusText.value = "就绪";
    } catch (e) {
      statusText.value = "Skulpt 加载失败";
    }
    if (!pyr.ready && !pyr.failed) pyr.boot(view.state.doc.toString());
    else if (pyr.ready) pyr.pushDoc(view.state.doc.toString());

    setTimeout(() => { if (view) view.requestMeasure(); }, 0);
    applyVars(); // 把本地/默认外观写进 .code-host（此时 host 已带预设 class）
    view.focus();
    const scroller = host.querySelector(".cm-scroller");
    if (scroller) scroller.addEventListener("scroll", scrollerScroll, { passive: true });

    // 仅 dev：暴露调试钩子，供 headless 实测驱动（生产构建 import.meta.env.DEV 为 false，不暴露）
    if (import.meta.env && import.meta.env.DEV) {
      window.__pye = {
        run, reset, stopRun, setProblem, currentCode, focusAt, setDark, setFontSize,
        adjustFont, resetFont, setLineHeight, setFontFamily, setAccent, applyPreset, toggleTheme,
        runJudge, // S7：headless 驱动判题（需传题目对象：__pyv.getProblem()）
        getView: () => view,
        diag: () => diagnostics.value,
        sigTip: () => (sigEl ? sigEl.innerText : null),
        host: () => (editorHost.value ? editorHost.value.className : "NULL"),
        appear: () => ({ fontSize: fontSize.value, lineHeight: lineHeight.value, fontFamily: fontFamily.value, accent: accent.value, preset: preset.value, isDark: isDark.value }),
        state: () => ({ engineReady: engineReady.value, pyrStatus: pyrStatus.value, fwCount: fwCount.value, output: output.value, running: running.value, statusText: statusText.value, runState: runState.value, judging: judging.value, judge: judgeResult.value }),
      };
    }
  }

  function currentCode() {
    return view ? view.state.doc.toString() : starterCode;
  }

  async function run() {
    if (running.value || judging.value) return;
    const myRun = ++runId; // S7.31：本次运行的编号。收尾时若已被更新的 run 取代则跳过，防旧执行污染新状态
    const src = currentCode();
    running.value = true;
    runState.value = "running";
    output.value = "";
    statusText.value = "运行中…";
    judgeResult.value = null; // S7：旧判题结果随新运行作废
    editorFocused.value = false; // 点运行=注意力离开编辑区，光环先撤
    if (view && errApi) view.dispatch({ effects: errApi.setErrEffect.of(null) });

    const r = await runPython(src, {
      // ⚠️ 用户停止后（userStopped）丢弃后续输出：running 中无 input 挂起时无法硬中断 VM，
      //    只能标记截断，等分片跑完后由收尾逻辑统一复位（S7.31）。
      onOutput: (t) => { if (!userStopped) output.value += t; },
      // ⚠️ S7.32：停止引发的异常（reject 被 Skulpt 包装后文本带 "on line N" → formatSkError 匹配出行号）
      //    不得打行标记——红色行标记语义是「代码出错」，学生主动停止不是错误（实测停止后 input 行被误标红）。
      onErrorLine: (lineNo) => { if (userStopped) return; if (view && errApi) view.dispatch({ effects: errApi.setErrEffect.of(lineNo) }); },
      // 交互输入：程序挂起 → 控制台聚焦流光 + 等学生键入；提交后 resolve 继续跑
      onInput: (prompt) => new Promise((resolve, reject) => {
        inputResolver = resolve;
        inputRejector = reject; // 停止用：reject 让 Skulpt 在 input() 调用点抛异常，整条执行链中止（真中断）
        inputPrompt.value = prompt;
        // S7.26：提示词不再进输出流——移入输入行与 textarea 同行连续（终端 prompt▸输入 形态），
        // 提交时由 submitInput 整行回显。⚠️ 实测 Skulpt 会把 Python 值 unwrap 成 JS 原生类型：
        // input(134)→number、input(True)→boolean、input("x") 才传 string → 非 string 即「忘加引号」。
        inputPromptNonStr.value = typeof prompt !== "string";
        awaitingInput.value = true;
        runState.value = "awaiting";
      }),
    });
    if (myRun !== runId) return; // 已被停止+新运行取代：旧执行收尾整体跳过（S7.31）
    running.value = false;
    // 注意力转移：运行结束 → 输出区接力高亮（编辑区聚焦时自动撤下，见 watch）
    outputFocused.value = true;
    awaitingInput.value = false;
    inputResolver = null;
    inputRejector = null;
    // ⚠️ 用户停止优先于 ok/err 判定：reject 会让 runPython 返回 ok:false，但不能显示成"运行出错"
    if (userStopped) {
      userStopped = false;
      runState.value = "stopped";
      statusText.value = "已停止";
      // 保留停止前的输出，不追加任何错误信息
      // ⚠️ S7.32：兜底清行标记（防 onErrorLine 拦漏，或停止前已有残留）——红行语义=代码出错，停止不算错
      if (view && errApi) view.dispatch({ effects: errApi.setErrEffect.of(null) });
    } else if (r.ok) {
      runState.value = "done";
      statusText.value = "运行完成";
      // ⚠️ 占位文案已全撤（S7.20 决策 + S7.23 复核）：无输出就是干净的空输出区，不再注入提示语
    } else {
      runState.value = "err";
      statusText.value = "运行出错";
      output.value = r.text || "运行出错";
    }
  }

  // S7.31：停止运行。awaiting=reject 挂起的 input()（Skulpt 抛异常、真中断，input 后的代码不再执行）；
  // running（无 input 挂起，如死循环/长输出）= 置标记截断后续输出，并提前放行按钮（VM 无法硬中断，
  // 旧执行仍在后台分片跑完，runId 守卫保证其收尾不污染新运行）。
  function stopRun() {
    if (!running.value) return;
    userStopped = true;
    runState.value = "stopped";
    statusText.value = "已停止";
    running.value = false; // 提前放行：死循环场景 await 永不返回，按钮必须立刻恢复可运行
    if (inputRejector) {
      const rej = inputRejector;
      inputRejector = null;
      rej(new Error("__USER_STOP__"));
    }
  }

  // ══════════════ S7 判题 ══════════
  // 逐用例跑学生代码（stdin 预填喂输入 → 捕获 stdout → 与期望值归一化比对），
  // 算分 score=round(通过数/总数×100) 并 POST /api/score。
  // 超时防护：Sk.execLimit 墙钟 5s/用例（skulpt.js runPython timeoutMs），超时用例记失败不连坐。
  const JUDGE_TIMEOUT_MS = 5000;

  // 输出归一化：\r\n→\n、逐行去尾空白、去末尾空行（判题比对容错，不做语义宽恕）
  function normJudgeOut(s) {
    return String(s == null ? "" : s)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n+$/, "");
  }

  // problem: { id, tests: [{ name, input, expected }] }
  async function runJudge(problem) {
    if (running.value || judging.value) return;
    const tests = (problem && problem.tests) || [];
    if (!tests.length) { message.warning("本题未配置测试用例"); return; }
    const src = currentCode();
    judging.value = true;
    runState.value = "judging";
    statusText.value = "判分中…";
    editorFocused.value = false;
    if (view && errApi) view.dispatch({ effects: errApi.setErrEffect.of(null) });

    const t0 = Date.now();
    const cases = [];
    let passed = 0;
    for (const tc of tests) {
      let buf = "";
      const r = await runPython(src, {
        stdin: String(tc.input == null ? "" : tc.input).split("\n"),
        onOutput: (t) => { buf += t; },
        timeoutMs: JUDGE_TIMEOUT_MS, // 每用例独立 5s 墙钟预算
      });
      const actual = normJudgeOut(buf);
      const expected = normJudgeOut(tc.expected);
      const ok = !r.timeout && r.ok && actual === expected;
      if (ok) passed += 1;
      cases.push({
        name: tc.name || "用例 " + (cases.length + 1),
        ok,
        timeout: !!r.timeout,
        input: String(tc.input == null ? "" : tc.input),
        expected: String(tc.expected == null ? "" : tc.expected),
        actual,
        err: r.ok || r.timeout ? "" : String(r.text || "").split("\n").filter(Boolean).slice(0, 2).join(" "),
      });
    }
    const total = tests.length;
    const score = Math.round((passed / total) * 100);
    const durationMs = Date.now() - t0;
    judgeResult.value = { score, passed, total, cases, durationMs, at: Date.now() };
    judging.value = false;
    runState.value = "scored";
    statusText.value = "得分 " + score + " / 100";
    // 独立版：无后端，成绩仅存本地（localStorage），不入库。
    try {
      const key = "pye-scores";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push({ id: (problem && problem.id) || "pycode", score, passed, total, at: Date.now() });
      localStorage.setItem(key, JSON.stringify(arr.slice(-50)));
    } catch (e) { /* ignore */ }
  }

  // 控制台提交一行输入：回显 + resolve 挂起的 input() + 焦点回编辑区
  function submitInput(line) {
    const text = String(line == null ? "" : line);
    if (awaitingInput.value && inputResolver) {
      // ⚠️ S7.26：等待期提示词已常驻输入行（主色 ink，见 PyEditor .ci-prompt），
      //    提交时把「提示词+键入内容」作为整行回显进输出流（终端标准形态）。
      //    ⚠️ 不能用 `inputPrompt.value || ""`：input(0) 时 0 是 falsy 会把提示词吞了。
      const p = inputPrompt.value;
      const pfx = (p === "" || p === null || p === undefined) ? "" : String(p);
      output.value += pfx + (text ? text : "") + "\n";
      const res = inputResolver;
      inputResolver = null;
      inputRejector = null; // S7.31：提交后 rejector 随之失效，防止停止时 reject 一个已 resolve 的 Promise（无操作但易误判）
      awaitingInput.value = false;
      inputPrompt.value = "";
      inputPromptNonStr.value = false;
      res(text);
      // ⚠️ 焦点归还延后一拍（B2）：原来这里同步 view.focus()，紧接着下一个 input() 的 watch 又把焦点抢回
      //    输入框，多轮输入时每轮抖一次。延后判断「是否又在等输入」，是则不再争。
      setTimeout(() => { if (!awaitingInput.value && view) view.focus(); }, 0);
    }
    return awaitingInput.value;
  }

  // stdin 由组件通过 setStdin 注入（避免 composable 反向依赖组件 ref）
  function setStdin(fn) { stdinValue = fn; }

  function reset() {
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: starterCode },
    });
    if (errApi) view.dispatch({ effects: errApi.setErrEffect.of(null) });
    if (lintApi) view.dispatch({ effects: lintApi.setLintsEffect.of(null) });
    pyr.diags = [];
    diagnostics.value = [];
    diagRef.current = [];
    if (view) view.dispatch({ effects: fwYieldEffect.of(null) });
    output.value = "";
    statusText.value = "已重置";
    judgeResult.value = null; // S7：重置=回到起点，旧判题结果不得残留
    if (runState.value === "scored") runState.value = "idle";
    if (pyr.ready) {
      pyr.version++;
      pyr.notify("textDocument/didChange", {
        textDocument: { uri: pyr.DOC_URI, version: pyr.version },
        contentChanges: [{ text: starterCode }],
      });
    }
  }

  // 切题：整体替换文档（M6 下发后调用）
  function setProblem(starter) {
    starterCode = starter;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: starter } });
    if (errApi) view.dispatch({ effects: errApi.setErrEffect.of(null) });
    if (lintApi) view.dispatch({ effects: lintApi.setLintsEffect.of(null) });
    pyr.diags = [];
    diagnostics.value = [];
    diagRef.current = [];
    if (view) view.dispatch({ effects: fwYieldEffect.of(null) });
    output.value = "";
    if (pyr.ready) {
      pyr.version++;
      pyr.notify("textDocument/didChange", {
        textDocument: { uri: pyr.DOC_URI, version: pyr.version },
        contentChanges: [{ text: starter }],
      });
    }
  }

  function setDark(v) {
    isDark.value = !!v;
  }
  function setFontSize(px) {
    fontSize.value = Math.min(36, Math.max(14, Math.round(px)));
    applyVars();
    persist();
  }
  function adjustFont(delta) { setFontSize(fontSize.value + delta); }
  function resetFont() { setFontSize(14); }
  function setLineHeight(v) {
    lineHeight.value = Math.min(2, Math.max(1.3, Math.round(v * 20) / 20));
    applyVars();
    persist();
  }
  function setFontFamily(f) {
    if (!FONT_STACKS[f]) return;
    fontFamily.value = f;
    applyVars();
    persist();
  }
  function setAccent(hex) {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return;
    accent.value = hex.length === 4 ? "#" + hex.slice(1).split("").map((c) => c + c).join("") : hex;
    applyVars();
    persist();
  }
  // 应用预设：定暗色 + 主色默认值；保留用户在 L2 的进一步微调由各自 setter 覆盖
  function applyPreset(name) {
    if (!PRESETS[name]) return;
    preset.value = name;
    isDark.value = PRESETS[name].dark;
    accent.value = PRESETS[name].primary;
    applyVars();
    persist();
  }
  // 顶栏快速切换：亮↔暗，在 mint/classic 间切，保留自定义主色
  function toggleTheme() {
    const nd = !isDark.value;
    preset.value = nd ? "classic" : "mint";
    isDark.value = nd;
    applyVars();
    persist();
  }

  function destroy() {
    hideSigTip();
    if (view) { view.destroy(); view = null; }
  }

  function focusAt(pos) {
    if (!view) return;
    const at = Math.min(Math.max(0, pos), view.state.doc.length);
    view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    view.focus();
  }

  // 让 run 可被 CM Mod-Enter 调用
  runRef = run;

  return {
    editorHost, engineReady, pyrStatus, fwCount, diagnostics, output, running,
    caretLine, caretCol, statusText, isDark, editorFocused, outputFocused,
    awaitingInput, inputPrompt, inputPromptNonStr, runState,
    fontSize, lineHeight, fontFamily, accent, preset, jumpFw, chromeVars,
    mount, run, stopRun, reset, setProblem, setDark, toggleTheme, applyPreset,
    setFontSize, adjustFont, resetFont, setLineHeight, setFontFamily, setAccent,
    setStdin, destroy, currentCode, focusAt, submitInput,
    // S7 判题
    judging, judgeResult, runJudge,
  };
}
