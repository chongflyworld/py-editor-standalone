<template>
  <a-config-provider :theme="themeObj">
    <div
      class="py-page"
      :class="{
        'theme-dark': ed.isDark.value,
        'preset-contrast': ed.preset.value === 'contrast',
        'preset-sepia': ed.preset.value === 'sepia',
      }"
      :style="ed.chromeVars.value"
    >
      <!-- 顶栏 -->
      <header class="py-top">
        <div class="py-top-left">
          <span class="prob-name">{{ problem.title }}</span>
          <a-tag color="green">{{ problem.level }}</a-tag>
          <a-tag :color="taskLoaded ? 'blue' : 'default'">{{ taskLoaded ? '课堂下发' : '演示题' }}</a-tag>
          <a-tag v-if="!ed.engineReady.value" color="orange">内核加载中</a-tag>
        </div>
        <div class="py-top-right">
          <a-popover placement="bottomRight" trigger="click" overlay-class-name="ap-pop">
            <template #title>外观设置</template>
            <template #content>
              <div class="ap-body">
                <div class="ap-row">
                  <div class="ap-label">预设</div>
                  <div class="preset-grid">
                    <button v-for="p in presetList" :key="p.key" class="preset-btn" :class="{ on: ed.preset.value === p.key }" @click="ed.applyPreset(p.key)">
                      <span class="preset-dot" :style="{ background: p.swatch }" />{{ p.name }}
                    </button>
                  </div>
                </div>
                <div class="ap-row">
                  <div class="ap-label">主色</div>
                  <div class="accent-row">
                    <button v-for="c in accentList" :key="c" class="swatch" :class="{ on: ed.accent.value === c }" :style="{ background: c }" :title="c" @click="ed.setAccent(c)" />
                    <input type="color" class="swatch-color" :value="ed.accent.value" title="自定义主色" @input="ed.setAccent($event.target.value)" />
                  </div>
                </div>
                <div class="ap-row">
                  <div class="ap-label">字号 {{ ed.fontSize.value }}px</div>
                  <a-slider :min="14" :max="36" v-model:value="fsProxy" />
                </div>
                <div class="ap-row">
                  <div class="ap-label">行高 {{ ed.lineHeight.value }}</div>
                  <a-slider :min="1.3" :max="2" :step="0.05" v-model:value="lhProxy" />
                </div>
                <div class="ap-row">
                  <div class="ap-label">字体</div>
                  <a-select v-model:value="ffProxy" size="small" style="width: 150px">
                    <a-select-option v-for="f in fontList" :key="f" :value="f">{{ f }}</a-select-option>
                  </a-select>
                </div>
              </div>
            </template>
            <a-button class="ghost" title="主题 / 字号 / 行高 / 字体">🎨 外观</a-button>
          </a-popover>
          <a-button class="ghost" :title="ed.isDark.value ? '切到亮色' : '切到暗色'" @click="ed.toggleTheme()">
            {{ ed.isDark.value ? '☀ 亮色' : '🌙 暗色' }}
          </a-button>
        </div>
      </header>

      <main class="py-main">
        <!-- 左栏：视觉焦点（上编辑 / 下输出） -->
        <div class="py-left">
          <section class="editor-card panel" :class="{ 'is-focus': ed.editorFocused.value }" :style="{ flexGrow: editorFlex }">
            <div class="editor-bar">
              <span class="file-name">{{ fileName }}</span>
              <span class="spacer" />
              <span class="engine"><span class="engine-dot" :class="ed.engineReady.value ? 'ok' : 'off'" />Skulpt {{ ed.engineReady.value ? '就绪' : '加载中' }}</span>
              <span class="engine"><span class="engine-dot" :class="pyrOk ? 'ok' : 'off'" />Pyright {{ pyrOk ? '就绪' : (ed.pyrStatus.value === 'failed' ? '离线' : '加载中') }}</span>
              <a-button class="ghost" size="small" :disabled="ed.running.value" @click="ed.reset()">重置</a-button>
              <!-- ⚠️ S7.31：运行中（含 input 挂起等待，running 全程为真）→ 红色停止按钮；点击 stopRun() 中止。
                   停止是即时的：awaiting 时 reject 让 Skulpt 抛异常真中断；running 中置标记截断后续输出。 -->
              <a-button v-if="ed.running.value" danger size="small" @click="ed.stopRun()">■ 停止</a-button>
              <a-button v-else type="primary" size="small" @click="ed.run()">运行</a-button>
            </div>

            <!-- CM6 真编辑器挂载点。is-dark / 预设类由 Vue 响应式接管（ed.isDark / ed.preset），
                 颜色变量由 applyVars 写内联（--cm-font/行高/字体/主色）；不命令式 toggle。 -->
            <div
              ref="editorHost"
              class="code-host"
              :class="{
                'is-dark': ed.isDark.value,
                'preset-contrast': ed.preset.value === 'contrast',
                'preset-sepia': ed.preset.value === 'sepia',
              }"
            ></div>

            <div class="editor-status">
              <span>行 {{ ed.caretLine.value }}，列 {{ ed.caretCol.value }}</span><span>UTF-8</span><span>Python 3</span>
              <span class="spacer" />
              <!-- 状态行颜色跟随运行状态：⚠️ 原来恒用 .status-ok（绿），「运行中…」顶着成功色易被误读为「已跑完」（S7.23） -->
              <span class="status-run" :class="'sl-' + ed.runState.value">{{ ed.statusText.value }}</span>
            </div>
          </section>

          <div class="split-bar" title="拖动调整编辑区 / 输出区高度" @mousedown="startDrag">
            <span class="split-handle" />
          </div>

          <section ref="outputCardRef" class="output-card panel" :class="{ 'is-focus': ed.outputFocused.value || ed.awaitingInput.value }" :style="{ flexGrow: outputFlex }">
            <a-tabs v-model:activeKey="tab" size="small">
              <a-tab-pane key="1">
                <template #tab>控制台</template>
                <!-- ⚠️ 控制台内部顺序 = 程序执行时序，禁止调换（S7.23）：
                     先「已发生的输出」，再紧跟「输入行」——终端的光标永远在最后一行输出之后。
                     原实现把输入行放在输出之上，导致 print→input 的因果被呈现成「先要我输入、程序才说要输入什么」。 -->
                <div class="stdout-box" :class="{ 'is-empty': !ed.output.value }">
                  <pre v-if="ed.output.value" class="stdout-pre" :style="{ fontSize: (ed.fontSize.value - 2) + 'px', lineHeight: ed.lineHeight.value }">{{ ed.output.value }}</pre>
                </div>
                <!-- 输入区按需插入：仅 input() 执行到时挂载，提交后从 DOM 移除；位置必须在 stdout-box 之后 -->
                <!-- ⚠️ S7.26：提示词与输入框同行连续（终端 `prompt▸输入` 形态），主色 ink 与 print 正文色区分；
                     提示词不再进输出流，提交时由 submitInput 整行回显（见 usePyEditor）。 -->
                <div v-if="ed.awaitingInput.value" ref="consoleInputBoxRef" class="console-input waiting">
                  <span v-if="hasPrompt" class="ci-prompt">{{ ed.inputPrompt.value }}</span>
                  <span v-if="ed.inputPromptNonStr.value" class="ci-prompt-warn" title="提示语忘加引号了？input() 的提示语应为字符串">⚠</span>
                  <div class="ci-ta-wrap">
                    <a-textarea
                      ref="consoleInputRef"
                      v-model:value="consoleLine"
                      class="console-textarea"
                      :auto-size="{ minRows: 1, maxRows: 1 }"
                      @focus="consoleFocused = true"
                      @blur="consoleFocused = false"
                      @keydown.enter="onConsoleKey"
                    />
                    <!-- 自绘光标层：任何状态只显示这一根 3px 光标（原生 caret 已透明弃用，见 CSS）。
                         空态=[引导语?]+光标（left:0，flex 从左排）；有内容态=只剩光标，left=文本像素宽（measureText 量）。
                         ⚠️ S7.28：原生 caret 按 line-height 撑高 20.4px、比字符(14px)高 6.4px 上下悬空=错位；
                            自绘 1.05em 光标垂直居中于行盒，与字符对齐；水平紧贴字符后沿。 -->
                    <div class="ci-ph" :class="{ 'is-focused': consoleFocused }" :style="{ left: caretLeft + 'px' }">
                      <span v-if="!hasPrompt && !consoleLine.length" class="ci-ph-text">{{ consolePlaceholder }}</span><i class="ci-caret" />
                    </div>
                  </div>
                </div>
                <!-- 底部护盾：滚到底时把输入行顶起，防止被 absolute 状态栏压住。
                     ⚠️ S7.30：不能用 holder 的 padding-bottom 让位——实测 content 的 height:100% 会吃掉它
                        （content 高 = holder盒高 - padding，pane 溢出量恰好把输入行推到 holder 盒底，压住 21px）。
                        固定高护盾在 pane 流内、计入 scrollHeight，是唯一可靠的让位手段（同 S7.21 spacer 的护栏职责，
                        但改为定高：status 已 absolute 定底，不再需要弹性拉伸）。 -->
                <div class="console-bottom-guard" />
              </a-tab-pane>
              <a-tab-pane key="2">
                <!-- ⚠️ 徽章须条件渲染：0 问题时连同红色一起消失，tab 文字回落中性色（S7.22） -->
                <template #tab>
                  <span class="tab-prob" :class="{ 'tab-err': ed.diagnostics.value.length > 0 }">问题<span v-if="ed.diagnostics.value.length" class="tab-badge">{{ ed.diagnostics.value.length }}</span></span>
                </template>
                <div v-if="ed.diagnostics.value.length === 0" class="muted">暂无问题。类型检查通过 ✅</div>
                <ul v-else class="diag-list">
                  <li
                    v-for="(d, i) in ed.diagnostics.value"
                    :key="i"
                    class="diag-card"
                    :class="'tier-' + d.tier"
                    @click="ed.focusAt(d.from)"
                  >
                    <div class="diag-head">
                      <span class="diag-badge">{{ tierLabel(d.tier) }}</span>
                      <span class="diag-line">第 {{ d.line }} 行</span>
                      <span class="diag-gran">{{ d.gran === 'token' ? '块高亮' : '行标记' }}</span>
                    </div>
                    <div class="diag-cn">{{ d.cn }}</div>
                    <div v-if="d.suggestion" class="diag-sug">💡 {{ d.suggestion }}</div>
                  </li>
                </ul>
              </a-tab-pane>
            </a-tabs>
            <!-- 控制台状态栏：常驻面板最底部，图标+一句话（五态状态机，低饱和不抢眼）。
                 ⚠️ S7.30：已移出滚动流（原在 tabpane 内用 sticky）。根因：antd 的 .ant-tabs-content
                     自带 position:relative + 我们的 height:100%，成为 sticky 包含块；tabpane 内容超高
                    溢出该盒时，sticky 元素不允许出包含块 → 状态栏被钳到面板中上部，输入行反而
                    「跑到状态栏底下」（实测任意 scrollTop 复现）。改为 absolute 定底 output-card，
                    与滚动完全解耦；仅控制台 tab 显示（与原 tabpane 隐藏行为一致）。 -->
            <div v-if="tab === '1'" class="console-status" :class="'st-' + ed.runState.value" @click="onStatusClick">
              <span class="cs-ico"><span class="cs-dot" /></span>
              <span class="cs-text">{{ consoleStatusText }}</span>
            </div>
          </section>
        </div>

        <!-- 右栏：作业区（参考）。宽度默认随内容自适应，可拖左缘调宽，双击恢复自适应 -->
        <aside class="py-right">
          <div
            class="hw-resize"
            title="拖动调整作业区宽度 · 双击恢复自适应"
            @mousedown="startHDrag"
            @dblclick="rightW = null"
          />
          <a-card size="small" title="作业区" class="panel hw-card" :style="rightStyle">
            <!-- S7.33 三段式任务卡：标题目标 → 编号步骤 → 终端预览示例 → 弱化提示 → 沉底标签。
                 认知动线 = 先知道做什么 → 拆成几步 → 看到做对长什么样 → 避坑 → 元信息退后。 -->
            <h3 class="prob-title">{{ problem.title }}</h3>
            <p class="prob-desc">{{ problem.desc }}</p>
            <div class="prob-sec">
              <div class="prob-sec-t">要求</div>
              <!-- 编号步骤：从"说明文"变"任务清单"，主色步骤圆点 -->
              <ol class="prob-steps">
                <li v-for="(r, i) in problem.reqs" :key="i"><span class="ps-text">{{ r }}</span></li>
              </ol>
            </div>
            <div v-if="hasSample" class="prob-sec">
              <div class="prob-sec-t">示例</div>
              <!-- 终端预览块：有输入渲染 >>> 输入行 + 结果行；无输入降级为只渲染结果行。
                   让学生一眼看到"跑对了是这样"，照着模仿。 -->
              <div class="sample-term">
                <div v-if="problem.sampleIn" class="st-line">
                  <span class="st-prompt">&gt;&gt;&gt;</span><span class="st-code">{{ problem.sampleIn }}</span>
                </div>
                <div class="st-line st-out"><span class="st-code">{{ problem.sampleOut }}</span></div>
              </div>
            </div>
            <div v-if="problem.hint" class="prob-sec">
              <div class="prob-sec-t">提示</div>
              <!-- 去黄色警告框：提示≠警告，降级为中性小字，不与要求抢视觉权重 -->
              <div class="prob-hint"><span class="hint-ico">💡</span><span class="hint-text">{{ problem.hint }}</span></div>
            </div>
            <div class="prob-meta">
              <a-tag v-for="(t, i) in problem.tags" :key="i">{{ t }}</a-tag>
            </div>
            <!-- S7 提交作业：作业区底部主操作。运行=学生自测（编辑器栏），提交=按测试用例判分并上报。
                 无用例题（如未配置 tests 的下发题）禁用 + 说明，不静默失败。 -->
            <div class="prob-submit">
              <a-button
                type="primary"
                block
                size="large"
                :loading="ed.judging.value"
                :disabled="!hasTests"
                :title="hasTests ? '提交当前代码，按测试用例判分并上报成绩' : '本题未配置测试用例，暂不能提交'"
                @click="onSubmit"
              >{{ ed.judging.value ? "判分中…" : "提交作业" }}</a-button>
            </div>
            <!-- S7 判题结果卡：得分 + 通过率 + 用例明细（失败给期望/实际，超时单标） -->
            <div v-if="ed.judgeResult.value" class="judge-card">
              <div class="jc-head">
                <span class="jc-score" :class="scoreClass">{{ ed.judgeResult.value.score }}<span class="jc-score-unit">分</span></span>
                <span class="jc-pass">通过 {{ ed.judgeResult.value.passed }} / {{ ed.judgeResult.value.total }}</span>
              </div>
              <div class="jc-bar"><span :class="scoreClass" :style="{ width: judgePct + '%' }" /></div>
              <ul class="jc-cases">
                <li v-for="(c, i) in ed.judgeResult.value.cases" :key="i" :class="{ ok: c.ok, bad: !c.ok }">
                  <span class="jc-mark">{{ c.ok ? "✓" : "✗" }}</span>
                  <span class="jc-name">{{ c.name }}</span>
                  <span v-if="c.timeout" class="jc-note">运行超时</span>
                  <span v-else-if="!c.ok" class="jc-note" :title="c.err || ''">期望 {{ c.expected }} · 实际 {{ c.actual === "" ? "（无输出）" : c.actual }}</span>
                </li>
              </ul>
            </div>
          </a-card>
        </aside>
      </main>
    </div>
  </a-config-provider>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { theme, message } from "ant-design-vue";
import { usePyEditor } from "../py-editor/usePyEditor.js";
import { TIER_LABEL } from "../py-editor/core/constants.js";

const tierLabel = (t) => TIER_LABEL[t] || "其他";

const ed = usePyEditor();
const editorHost = ed.editorHost; // 模板 ref 复用同一 ref 对象

// ── 当前题目（S5：单一 problem 模型驱动作业区 + 起始代码 + 输入示例）──
// 学生端不提供「切题」入口（教师 M6 下发）；M6 就绪后由后端推送 → loadProblem(p) 整体替换。
// S7：默认题为 stdin/stdout 型（判题基础）——海龟图形题不适合 stdout 比对，移出本地题集。
// tests: [{ name, input, expected }] input 喂 stdin（\n 分行）、expected 比对 stdout。
const problem = ref({
  id: "t-add",
  title: "两数相加",
  level: "入门",
  fileName: "starter.py",
  starter: `def add(a, b):
    return a + b


a, b = map(int, input().split())
print(add(a, b))
`,
  desc: "读入一行两个整数，编写函数 add(a, b) 返回两数之和，并输出结果。",
  reqs: ["定义函数 add(a, b)，用 return 返回两数之和", "从输入读取一行两个整数 a 和 b", "调用 add(a, b) 并输出结果"],
  hint: "return 把结果交还给调用方；input() 读到的是字符串，用 map(int, …) 转换成整数。",
  sampleIn: "2 3",
  sampleOut: "5",
  tests: [
    { name: "正整数", input: "2 3", expected: "5" },
    { name: "含负数", input: "-4 9", expected: "5" },
    { name: "零", input: "0 0", expected: "0" },
  ],
  tags: ["函数", "第 3 周"],
});
const fileName = computed(() => problem.value.fileName || "starter.py");

// 输入区按需插入（仅 awaitingInput 时挂载）。
// ⚠️ S7.25：input() 的提示词已改为写入输出流（见 usePyEditor onInput），
//    这里只兜底「无提示词」时的默认引导语；字号与 print 输出同源（--pg-console-font），仅用弱色区分样式。
const consoleLine = ref("");
const consoleFocused = ref(false); // 输入区是否持有焦点：决定显示「假光标」还是让位给浏览器原生 caret
const consoleInputRef = ref(null);
const consoleInputBoxRef = ref(null); // 输入行容器（滚动与可见性判断用）
const consolePlaceholder = "请输入内容，按回车提交";
// S7.26：是否存在有效提示词（input() 的 prompt 非空）。⚠️ 不能用真值判断：
// input(0) 时 prompt 是 number 0（falsy），input(None) 可能是 null，都要算「有提示词」。
const hasPrompt = computed(() => {
  const p = ed.inputPrompt.value;
  return p !== "" && p !== null && p !== undefined;
});
// S7.28：自绘光标的水平位置 = 当前文本像素宽（canvas measureText，字体与 textarea 完全一致）。
// 空态=0（与引导语同 flex 行从左排）；有内容态=文本宽，光标紧贴字符后沿。
// ⚠️ 原生 caret 已全面弃用：它按 line-height 撑高（20.4px vs 字符 14px，上下各悬空 3.2px），观感错位。
const caretLeft = ref(0);
let measureCtx = null;
const measureCaret = () => {
  const el = consoleInputRef.value && consoleInputRef.value.$el;
  const ta = el && (el.tagName === "TEXTAREA" ? el : el.querySelector("textarea")); // a-textarea 的 $el 即 textarea
  if (!ta) { caretLeft.value = 0; return; } // ⚠️ 输入行已拆毁（如刚提交）：归零防残留上一轮位置（S7.28 实测：残留 24px）
  const cs = getComputedStyle(ta);
  measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
  measureCtx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  const w = measureCtx.measureText(consoleLine.value).width;
  // 长文本横向滚动时跟随 scrollLeft，并夹在容器内（右缘留 4px，防光标被裁）
  const wrap = ta.parentElement;
  const maxL = wrap ? Math.max(0, wrap.clientWidth - 4) : w;
  caretLeft.value = Math.max(0, Math.min(w - ta.scrollLeft, maxL));
};
watch(consoleLine, () => nextTick(measureCaret));
watch(() => ed.fontSize.value, () => nextTick(measureCaret));
// 控制台状态栏文案（S7.31 新增 stopped；S7 新增 judging/scored 判题两态）
const consoleStatusText = computed(() => ({
  idle: "等待运行",
  running: "程序运行中…",
  awaiting: "等待输入 · 输入框已就绪",
  done: "运行完成",
  err: "运行出错 · 详见「问题」面板",
  stopped: "已停止",
  judging: "判分中…",
  scored: ed.judgeResult.value ? ("判题完成 · 得分 " + ed.judgeResult.value.score) : "判题完成",
}[ed.runState.value] || "等待运行"));
// 出错态点击状态栏 → 跳到问题面板并定位第一条诊断
const onStatusClick = () => {
  if (ed.runState.value !== "err") return;
  tab.value = "2";
  nextTick(() => { const d = ed.diagnostics.value[0]; if (d) ed.focusAt(d.from); });
};
// 回车提交（Shift+Enter 放行换行）；提交后 submitInput 内部把焦点还回编辑区
const onConsoleKey = (e) => {
  if (e && e.shiftKey) return;
  if (e && e.preventDefault) e.preventDefault();
  onConsoleSubmit();
};
const onConsoleSubmit = () => {
  const line = consoleLine.value;
  consoleLine.value = "";
  ed.submitInput(line);
};
// ── 控制台滚动（S7.23）──
// ⚠️ 禁止 scrollIntoView：① 它的 block:'nearest' 不理解 sticky，会把输入行滚到贴容器底边，
//    而 sticky 状态栏（约 30px、z-index:2、不透明背景）正浮在同一位置 → 输入行被完全盖住；
//    ② holder 无溢出时它会向上冒泡滚动 window，造成整页跳动。
// ✅ 正确做法是显式取滚动容器并把 scrollTop 拉到 scrollHeight：滚到底时 DOM 顺序为
//    「输入行 → spacer(高0) → 状态栏」，输入行天然落在状态栏之上，永不遮挡。
const outputCardRef = ref(null);
function consoleScroller() {
  const card = outputCardRef.value;
  if (!card) return null;
  return card.querySelector(".ant-tabs-content-holder") || null;
}
function scrollConsoleToBottom(frames) {
  nextTick(() => {
    requestAnimationFrame(() => {
      const holder = consoleScroller();
      if (!holder) return;
      if (frames === 2) requestAnimationFrame(() => { holder.scrollTop = holder.scrollHeight; });
      else holder.scrollTop = holder.scrollHeight;
    });
  });
}
function focusConsoleInput() {
  const inst = consoleInputRef.value;
  const el = inst && (inst.$el || inst);
  if (!el) return;
  // ⚠️ antd a-textarea 无内层包装：$el 本身就是 textarea（见 .console-input 的同坑）。
  //    原写法 el.querySelector("textarea") 恒为 null → 自动聚焦从未生效（S7.22 实测）。
  const ta = el.tagName === "TEXTAREA" ? el : el.querySelector("textarea");
  if (ta) ta.focus();
}
// input() 等待中 → 自动切回控制台 tab 并聚焦输入区（防止学生停在「问题」tab 时输入框藏在隐藏页签里干等）
// 分类滚动①：awaiting 是强制交互，无条件滚到底 —— 不滚学生就不知道该在哪打字，程序干等。
watch(() => ed.awaitingInput.value, (v) => {
  if (v) {
    tab.value = "1";
    nextTick(() => { focusConsoleInput(); scrollConsoleToBottom(2); measureCaret(); }); // measureCaret：新输入行挂载后重置光标水平位（防残留上一轮的值）
  }
});
// 分类滚动②：普通输出增长（非 awaiting）才用「已接近底部才跟随」，
// 学生上翻阅读历史时不强行拽回底部。
watch(() => ed.output.value, () => {
  if (ed.awaitingInput.value) return; // awaiting 场景由上面的 watch 统一处理
  const holder = consoleScroller();
  if (!holder) return;
  const distance = holder.scrollHeight - holder.scrollTop - holder.clientHeight;
  if (distance > 40) return; // 学生已上翻，不打扰
  scrollConsoleToBottom(1);
});

// M6 下发入口：整体替换题目 + 起始代码（ed.setProblem 会清诊断/输出并重推 Pyright）
// S7：tests 缺省 []（无用例题=判题按钮禁用）；服务端 cfg 带 tests 时原样透传。
const loadProblem = (p) => {
  problem.value = { sampleIn: "", sampleOut: "", tags: [], reqs: [], level: "入门", tests: [], ...p };
  ed.setProblem(problem.value.starter || "");
};
const hasSample = computed(() => !!(problem.value.sampleIn || problem.value.sampleOut));
// S7 判题：本题是否配置了测试用例（无 → 提交按钮禁用）
const hasTests = computed(() => Array.isArray(problem.value.tests) && problem.value.tests.length > 0);
// 结果卡：通过率百分比 + 分数配色（≥60 合格绿 / <60 警示红）
const judgePct = computed(() => {
  const r = ed.judgeResult.value;
  return r && r.total ? Math.round((r.passed / r.total) * 100) : 0;
});
const scoreClass = computed(() => {
  const r = ed.judgeResult.value;
  return r && r.score >= 60 ? "sc-ok" : "sc-bad";
});
const onSubmit = () => { ed.runJudge(problem.value); };

// ── S7：题目下发（M6）── 学生端拉「本班当前开放的 pycode 任务」→ loadProblem ──
// M6：URL 带 ?task=xxx 时按 id 精确加载该题（任务卡/详情页直达）；无参数取最新一道。
// ⚠️ 本项目是 hash 路由（createWebHashHistory）：query 在 hash 段里，location.search 读不到——
//    必须用 route.query（曾踩坑：location.search 恒为空，task 参数被静默丢弃）。
// ── 独立版：题目从本地 problems.json 读取（无后端）──
// URL 带 ?task=xxx 时按 id 精确加载；无参数取第一道。编辑 public/problems.json 即可增删题目。
const urlTask = new URLSearchParams(location.search).get("task") || null;
const taskLoaded = ref(false);   // 是否加载到本地题目（false=展示内置演示题）
let currentTaskId = "";          // 已加载的任务 id（同一题不重置，保住学生代码）
const loadLocalProblems = async () => {
  try {
    const res = await fetch("problems.json", { cache: "no-cache" });
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return;
    const p = urlTask ? (list.find((x) => x.id === urlTask) || list[0]) : list[0];
    if (p.id === currentTaskId) return; // 同一题：不 loadProblem，保留学生已写代码
    loadProblem({ ...p });
    currentTaskId = p.id;
    taskLoaded.value = true;
  } catch (e) { /* 用内置演示题 */ }
};

const tab = ref("1");
// 切「问题」看报错再切回控制台：antd 未激活 tabpane 是 display:none（无 forceRender），
// 期间测量全 0 且 awaiting 的 focus/scroll 不会重跑 → 回来可能看不见输入行也没聚焦（A5）。这里补偿一次。
// ⚠️ 必须放在 `const tab` 之后：Vue watch 创建时会立即跑一次 getter 取 oldValue，写在前面会撞 TDZ
//    （实测报错 "Cannot access 'tab' before initialization"，整个 PyEditor 挂载失败）。
watch(tab, (v) => {
  if (v === "1" && ed.awaitingInput.value) {
    nextTick(() => {
      const box = consoleInputBoxRef.value;
      if (box && box.offsetParent === null) return; // 仍在隐藏页签里，等真正显示后再处理
      focusConsoleInput();
      scrollConsoleToBottom(2);
    });
  }
});
const pyrOk = computed(() => ed.pyrStatus.value === "ready");

// 主题（S0 已验证机制；完整主题体系 S6 接入）。isDark / accent 由 usePyEditor 持有。
// ⚠️ themeObj 必须恒为对象且形状稳定（不能 undefined↔对象、不能增删 token 字段）：
//    antd ConfigProvider 在 theme 形状变化时会重建插槽子树，把 CM 命令式挂载的 DOM 抹掉。
//    恒 {algorithm, token:{colorPrimary}} + 仅改值，可保持结构稳定，避免重挂。
const themeObj = computed(() => ({
  algorithm: ed.isDark.value ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: { colorPrimary: ed.accent.value },
}));

// ── S4 外观自定义（L1 预设 + L2 主色/字号/行高/字体）；真源在 usePyEditor，这里只提供选项与代理 ──
const presetList = [
  { key: "mint", name: "薄荷亮色", swatch: "#1F5F4F" },
  { key: "classic", name: "经典暗色", swatch: "#4EC9B0" },
  { key: "contrast", name: "高对比度", swatch: "#0F3D33" },
  { key: "sepia", name: "暖纸", swatch: "#8A6A2F" },
];
const accentList = ["#1F5F4F", "#4EC9B0", "#0F3D33", "#C89B3C", "#8B5CF6", "#E15759"];
const fontList = ["Cascadia Code", "Consolas", "JetBrains Mono", "Fira Code", "微软雅黑"];
// slider / select 用可写 computed 代理：直接改会绕过 applyVars + 持久化
const fsProxy = computed({ get: () => ed.fontSize.value, set: (v) => ed.setFontSize(v) });
const lhProxy = computed({ get: () => ed.lineHeight.value, set: (v) => ed.setLineHeight(v) });
const ffProxy = computed({ get: () => ed.fontFamily.value, set: (v) => ed.setFontFamily(v) });

// 作业区宽度：null = 随内容自适应（CSS max-content + min/max 夹取）；数字 = 拖拽固定的像素宽
const rightW = ref(null);
const rightStyle = computed(() =>
  rightW.value ? { width: rightW.value + "px", maxWidth: "none" } : {}
);
let hDragging = false;
const startHDrag = () => {
  hDragging = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("mousemove", onHDrag);
  window.addEventListener("mouseup", endHDrag);
};
const onHDrag = (e) => {
  if (!hDragging) return;
  rightW.value = Math.min(560, Math.max(280, window.innerWidth - e.clientX - 10));
};
const endHDrag = () => {
  hDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("mousemove", onHDrag);
  window.removeEventListener("mouseup", endHDrag);
};

// 编辑/输出高度比（拖动分割条）
const editorFlex = ref(6);
const outputFlex = ref(4);
let dragging = false;
const startDrag = () => {
  dragging = true;
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);
};
const onDrag = (e) => {
  if (!dragging) return;
  const left = document.querySelector(".py-left");
  if (!left) return;
  const rect = left.getBoundingClientRect();
  const ratio = (e.clientY - rect.top) / rect.height;
  const clamped = Math.min(0.8, Math.max(0.25, ratio));
  editorFlex.value = clamped;
  outputFlex.value = 1 - clamped;
};
const endDrag = () => {
  dragging = false;
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
};

onMounted(async () => {
  await ed.mount(problem.value.starter); // mount 内部 loadAppearance + applyVars（恢复本地外观并写入变量）
  await loadLocalProblems();             // 用本地 problems.json 的题目覆盖内置演示题（有则）
  // 暴露组件级钩子，供 headless 驱动 / 嵌入调用
  window.__pyv = {
    problem: () => problem.value,
    loadProblem,
    reload: loadLocalProblems,
    submitInput: (l) => ed.submitInput(l),
    awaiting: () => ed.awaitingInput.value,
    taskLoaded: () => taskLoaded.value,
  };
});
onUnmounted(() => {
  ed.destroy();
  if (sseConn) { try { sseConn.close(); } catch (e) {} sseConn = null; }
});
</script>

<style scoped>
/* ── 渠道②：自写外壳主题变量（亮/暗/预设分档）──
   --pg-primary/-primary-ink/-bg/-soft/--pg-console-font 由 .py-page :style 注入
   （跟随主色+明暗，见 usePyEditor.chromeVars；ink=暗色提亮的文字用主色，console-font=编辑器字号-2px）；
   其余在此按 .py-page / .theme-dark / 预设类分档。antd 组件由 ConfigProvider darkAlgorithm 接管。 */
.py-page {
  --pg-bg: #F4FBF8; --pg-text: #23332e; --pg-text-soft: #6b7d76;
  --pg-panel: #ffffff; --pg-line: #dbe7e1; --pg-gold: #C89B3C; --pg-danger: #E15759; --pg-ok: #3B9D6E;
  --pg-hint-bg: #FDF6E7; --pg-hint-border: #F0E2BE; --pg-hint-text: #6B5A2A;
  --pg-term-bg: #f2f8f5; /* S7.33：作业区终端预览块底色（浅薄荷灰绿） */
  height: 100vh; background: var(--pg-bg); color: var(--pg-text);
  display: flex; flex-direction: column; overflow: hidden;
}
.py-page.theme-dark {
  --pg-bg: #0f1a17; --pg-text: #e8f2ec; --pg-text-soft: #8aa79c;
  --pg-panel: #1a2622; --pg-line: #2c403a; --pg-gold: #e0b25a; --pg-danger: #ff7b7d; --pg-ok: #4ec9b0;
  --pg-hint-bg: #24312c; --pg-hint-border: #3a4a44; --pg-hint-text: #cbb98a;
  --pg-term-bg: #131f1b; /* S7.33：暗色终端预览块底色 */
}
.py-page.preset-contrast {
  --pg-bg: #eef3f1; --pg-text: #101010; --pg-text-soft: #4a4a4a;
  --pg-panel: #ffffff; --pg-line: #1a1a1a; --pg-gold: #8a5a00; --pg-danger: #c00000;
  --pg-hint-bg: #fff8e6; --pg-hint-border: #c9a227; --pg-hint-text: #5a4a00;
}
.py-page.preset-sepia {
  --pg-bg: #f3ecdd; --pg-text: #3b2f1e; --pg-text-soft: #8a7a5c;
  --pg-panel: #faf5e9; --pg-line: #d9c9a3; --pg-gold: #a8761f; --pg-danger: #c0392b;
  --pg-hint-bg: #f7efd9; --pg-hint-border: #d9c07a; --pg-hint-text: #6a5a2a;
}
.py-top {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none;
  padding: 8px 16px; background: var(--pg-panel); border-bottom: 1px solid var(--pg-line);
}
.py-top-left, .py-top-right { display: flex; align-items: center; gap: 8px; }
.prob-name { font-size: 14px; font-weight: 500; color: var(--pg-text); }
.fw-badge {
  font-size: 12px; color: var(--pg-text-soft); border: 1px solid var(--pg-line);
  border-radius: 10px; padding: 1px 9px; cursor: default;
}
.fw-badge.active { color: var(--pg-gold); border-color: var(--pg-gold); cursor: pointer; }
.fs-val { font-size: 12px; color: var(--pg-text-soft); min-width: 38px; text-align: center; }
.ghost { background: var(--pg-panel); color: var(--pg-primary); border: 1px solid var(--pg-primary-soft); }
.ghost:hover { background: var(--pg-primary-bg); color: var(--pg-primary); border-color: var(--pg-primary); }
/* 暗色加固：切明暗时 --pg-primary 保持不变（只有背景变量变），深绿字压在深黑绿底上实测对比度仅 1.5:1，
   几乎糊死 → 暗色下把文字/边框按主色提亮。用 color-mix 保持跟随用户自定义强调色，旧浏览器回退到静态浅绿。 */
.py-page.theme-dark .ghost {
  color: #7fd8a4;
  border-color: #3f7f6d;
  color: color-mix(in srgb, var(--pg-primary) 40%, #ffffff);
  border-color: color-mix(in srgb, var(--pg-primary) 45%, transparent);
}
.py-page.theme-dark .ghost:hover {
  background: color-mix(in srgb, var(--pg-primary) 22%, transparent);
  color: color-mix(in srgb, var(--pg-primary) 55%, #ffffff);
}

/* ⚠️ S7.34：必须显式声明单行 minmax(0,1fr)。若无此行，隐式行按内容 max-content 撑高——
   判题结果卡插入后右栏内容变高 → 整行超出容器 → .py-page{overflow:hidden} 裁掉溢出部分，
   而 .hw-card 随行一起变高，自身 overflow:auto 永不触发 → 「高度溢出且无法滚动」。 */
.py-main {
  flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
  gap: 14px; padding: 14px 16px; align-items: stretch; min-height: 0;
}
.py-left { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.panel {
  background: var(--pg-panel); border: 1px solid var(--pg-line); border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
}
.editor-card { display: flex; flex-direction: column; flex-basis: 0; min-height: 0; overflow: hidden; position: relative; }
/* ── 聚焦流光（四彩旋转扫光边框）：编辑区聚焦 / 输出区运行后接力 ──
   ::before 铺满卡片，conic 多色渐变 + mask 只保留 2px 边框环；
   用 @property 动画渐变角度（只转光束，不转边框形状）；不支持 @property 时退化为静态环 */
@property --pg-sweep { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.editor-card.is-focus, .output-card.is-focus {
  border-color: var(--pg-primary-soft);
  box-shadow: 0 0 14px var(--pg-primary-soft);
}
.editor-card.is-focus::before, .output-card.is-focus::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 2px;
  background: conic-gradient(from var(--pg-sweep),
    transparent 0 50%,
    var(--pg-primary) 58%,
    #4EC9B0 68%,
    #C89B3C 78%,
    #8B5CF6 88%,
    transparent 96%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: pg-sweep 2s linear infinite;
  pointer-events: none; z-index: 6;
}
@keyframes pg-sweep { to { --pg-sweep: 360deg; } }
@media (prefers-reduced-motion: reduce) {
  .editor-card.is-focus::before, .output-card.is-focus::before { animation: none; }
}
.editor-bar {
  display: flex; align-items: center; gap: 12px; padding: 7px 12px; flex: none;
  border-bottom: 1px solid var(--pg-line); font-size: 12px; color: var(--pg-text-soft);
}
.file-name { font-family: Consolas, monospace; color: var(--pg-text); }
.spacer { flex: 1; }
.engine { display: inline-flex; align-items: center; }
.engine-dot { width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; display: inline-block; }
.engine-dot.ok { background: var(--pg-ok); }
.engine-dot.off { background: var(--pg-text-soft); }

.code-host {
  position: relative; flex: 1; min-height: 0; overflow: hidden;
}

.editor-status {
  display: flex; gap: 16px; padding: 6px 12px; flex: none;
  border-top: 1px solid var(--pg-line); font-size: 11.5px; color: var(--pg-text-soft);
}
.status-run { color: var(--pg-text-soft); }
/* S7.25：运行中/等待输入改用提亮墨水主色（原 --pg-primary 暗色下仅 2.09:1，S7.23 漏修） */
.status-run.sl-running, .status-run.sl-awaiting { color: var(--pg-primary-ink); }
.status-run.sl-done { color: var(--pg-ok); }
.status-run.sl-err { color: var(--pg-danger); }
/* S7.31：已停止=中性弱色（主动行为，非出错） */
.status-run.sl-stopped { color: var(--pg-text-soft); }
/* S7：判分中=墨水主色（进行态）；判题完成=合格绿（终态，分数另见作业区结果卡） */
.status-run.sl-judging { color: var(--pg-primary-ink); }
.status-run.sl-scored { color: var(--pg-ok); }

.split-bar { flex: none; height: 12px; display: flex; align-items: center; justify-content: center; cursor: row-resize; }
.split-bar:hover .split-handle { background: var(--pg-primary-soft); }
.split-handle { width: 44px; height: 5px; border-radius: 3px; background: var(--pg-line); }

.output-card { flex-basis: 0; min-height: 120px; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.output-card :deep(.ant-tabs) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.output-card :deep(.ant-tabs-content-holder) { flex: 1; min-height: 0; overflow: auto; padding: 0 12px 12px; }
/* ⚠️ antd 结构为 content-holder > .ant-tabs-content > .ant-tabs-tabpane。
   中间层 .ant-tabs-content 高度默认 auto，会使 tabpane 的 height:100% 退化为 auto
   → tabpane 只有内容高，状态栏悬在中间、贴不到底（S7.21 实测差 201px）。
   故必须给中间层补 height:100%。 */
/* ⚠️ .ant-tabs-content 本身是 flex 容器，默认 align-items:stretch 会把 tabpane 拉成固定高，
   长输出时内容溢出、滚到底最后一行被状态栏压掉 4px（S7.21）→ 改 flex-start 让 tabpane 按内容撑开。 */
.output-card :deep(.ant-tabs-content) { height: 100%; align-items: flex-start; }
/* tabpane 纵向布局：min-height 撑满（短内容到底、长内容撑开可滚），输出区弹性填充，状态栏贴底 */
.output-card :deep(.ant-tabs-tabpane) { display: flex; flex-direction: column; min-height: 100%; }
.output-card :deep(.ant-tabs-tabpane-inactive) { display: none; }
.output-card :deep(.ant-tabs-nav) { margin: 0; padding: 0 12px; }
/* ⚠️ S7.25：激活态文字/下划线原用 antd 主题主色（暗色算法后 ≈#1D5446），压在深底上仅 ~2:1，
   比未激活的白字还暗——「激活」反而更不显眼，语义反转 → 改用提亮墨水主色 --pg-primary-ink。
   选择器带 .ant-tabs-tab.ant-tabs-tab-active 双类 + scoped 属性，特异性高于 antd 默认规则，无需 !important。 */
.output-card :deep(.ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn) { color: var(--pg-primary-ink); }
.output-card :deep(.ant-tabs-tab:hover) { color: var(--pg-primary-ink); }
.output-card :deep(.ant-tabs-ink-bar) { background: var(--pg-primary-ink); }
/* 0 问题：中性色；有诊断：转报警红（.tab-err 居后，同级覆盖） */
.tab-prob { color: var(--pg-text-soft); }
.tab-err { color: var(--pg-danger); }
.tab-badge {
  display: inline-block; min-width: 16px; margin-left: 5px; padding: 0 4px;
  font-size: 11px; line-height: 16px; text-align: center; color: #fff;
  background: var(--pg-danger); border-radius: 8px;
}
/* ⚠️ S7.21：不再拉伸。拉伸职责原在 .console-spacer（已随 S7.30 状态栏移出滚动流而删除），
   输入行紧跟最后一行输出；底部让位改由 content-holder 的 padding-bottom:42px 承担。
   ⚠️ 也不许用 flex:1 0 auto（basis:auto + 不压缩）→ 高度锁死内容溢出，会让 sticky 失效（S7.21）。 */
/* padding-bottom 8px：原先的 14px 是为了防 sticky 状态栏压住最后一行，但现在最后一项是输入行而非状态栏，
   那 14px 会变成「输出与输入行之间的空白」，破坏贴紧跟的感觉（护栏移交给输入行自身，见 .console-input）。 */
.stdout-box { padding: 8px 0 8px; color: var(--pg-text); flex: 0 0 auto; min-height: 0; }
/* 空输出不占位：x=input() 作首行时不能凭空撑出 56px 把输入行顶到面板半空 */
.stdout-box.is-empty { padding: 0; min-height: 0; }
/* ⚠️ .console-spacer 已删除（S7.30）：状态栏 absolute 定底后不再需要弹性空白把它顶到底，
   底部让位由 .console-bottom-guard 定高护盾承担（滚到底时输入行完整露在状态栏上方）。 */
.stdout-pre { font-family: Consolas, monospace; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; margin: 0; }
/* 底部护盾：定高 42px（状态栏高约 27-30 + 12px 安全距）。⚠️ 必须在 pane 流内（计入 scrollHeight），
   不能用 holder padding-bottom——height:100% 的 content 会把它吃掉（S7.30 实测）。 */
.console-bottom-guard { flex: none; height: 42px; }
/* 控制台状态栏（常驻面板最底部）：图标 + 一句话；12px 弱化色，略提醒不抢眼。
   ⚠️ S7.30：absolute 定底 output-card（已移出滚动流，勿改回 sticky——包含块钳制坑见模板注释）。
      left/right 12px 对齐 tab 内容边缘（原 holder padding 位置）；背景 + 顶部细线避免输出文字穿透。
      z-index 2 盖住滚动内容；is-focus 光环 ::before 是 z6 的 2px 边框环，互不干扰。 */
@property --cs-spin { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
.console-status {
  position: absolute; bottom: 0; left: 12px; right: 12px; z-index: 2;
  display: flex; align-items: center; gap: 8px; flex: none;
  padding: 6px 0 4px; font-size: 12px; color: var(--pg-text-soft);
  background: var(--pg-panel); border-top: 1px solid var(--pg-line);
}
.console-status.st-err { color: var(--pg-danger); cursor: pointer; }
.console-status.st-err:hover { text-decoration: underline; }
/* S7.31：已停止态——中性弱色，不报警（停止是用户主动行为，不是出错） */
.console-status.st-stopped { color: var(--pg-text-soft); }
.st-stopped .cs-dot { background: var(--pg-text-soft); opacity: .55; }
/* S7：判分中=墨水主色脉冲点；判题完成=合格绿 */
.console-status.st-judging { color: var(--pg-primary-ink); }
.console-status.st-judging .cs-dot { background: var(--pg-primary-ink); opacity: 1; animation: cs-breathe 1s ease-in-out infinite; }
.console-status.st-scored { color: var(--pg-ok); }
.console-status.st-scored .cs-dot { background: var(--pg-ok); opacity: 1; }
.cs-ico { flex: none; width: 13px; height: 13px; position: relative; }
.cs-dot { position: absolute; inset: 3.5px; border-radius: 50%; background: var(--pg-text-soft); opacity: .55; }
.st-running .cs-dot {
  background: conic-gradient(from var(--cs-spin), var(--pg-primary) 0 32%, transparent 32% 100%);
  animation: cs-spin 1s linear infinite; opacity: .9;
}
.st-awaiting .cs-dot { background: var(--pg-gold); opacity: .9; animation: cs-breathe 1.4s ease-in-out infinite; }
.st-done .cs-dot { background: var(--pg-ok); opacity: .8; }
.st-err .cs-dot { background: var(--pg-danger); opacity: .85; }
@keyframes cs-spin { to { --cs-spin: 360deg; } }
@keyframes cs-breathe { 0%, 100% { opacity: .55; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.1); } }
@media (prefers-reduced-motion: reduce) {
  .st-running .cs-dot, .st-awaiting .cs-dot { animation: none; }
}
/* 控制台输入区（按需插入，仅 input() 等待时挂载）：无边框、撑满宽度、与 tab 栏拉开间距。
   ⚠️ antd a-textarea 无外层包装 div：console-textarea/ant-input 两个类都在 textarea 元素本身，
      且内嵌 textarea 不带 data-v → 选择器须 :deep(textarea.console-textarea.ant-input) */
/* 位置在 stdout-box 之后，紧跟最后一行输出；上下间距收紧，视觉上「接」住输出。
   底部 6px 同时充当 sticky 状态栏的护栏 —— 滚到底时不会被状态栏压住。 */
/* ⚠️ S7.26：改 flex 同行——提示词（.ci-prompt）与输入框（.ci-ta-wrap）连续排布，
   还原终端 `prompt▸输入` 形态；提示词用主色 ink，与 print 输出正文色明确区分。 */
.console-input { width: 100%; margin: 2px 0 6px; position: relative; display: flex; align-items: flex-start; }
.ci-prompt {
  flex: none; max-width: 72%; padding: 2px 0 0;
  font-family: Consolas, monospace; font-size: var(--pg-console-font, 12.5px); line-height: 1.7;
  color: var(--pg-primary-ink, var(--pg-primary)); white-space: pre;
  overflow: hidden; text-overflow: ellipsis;
}
/* ④：input(134) 忘加引号 → 提示语后跟弱标记（实测 Skulpt 对非字符串 prompt 原样透传，即此错） */
.ci-prompt-warn { flex: none; margin: 5px 0 0 5px; font-size: 11px; line-height: 1; color: var(--pg-text-soft); cursor: help; }
/* textarea 外包一层普通 div：假光标层改为相对它定位，left:0 即输入框文本起点（提示词之后）。
   ⚠️ antd a-textarea 无外层包装（$el 即 textarea），必须自己包，否则绝对定位找不到参照物。 */
.ci-ta-wrap { position: relative; flex: 1 1 auto; min-width: 0; }
/* 自绘光标层：任何状态只显示这一根 3px 光标（原生 caret 已透明弃用）。
   空态=[引导语?]+光标（left:0，flex 从左排）；有内容态=只剩光标，left=文本像素宽（模板内联绑定）。
   ⚠️ top/bottom 各 2px 撑满行盒（= textarea 高-4）→ align-items:center 让光标垂直居中于字符行；
      原来只设 top、容器高由内容决定，有内容态容器仅 12.6px 会导致光标偏上 3.9px（S7.28 修复）。
   ⚠️ 字号/行高与 print 输出同源（--pg-console-font/-lh = 编辑器字号-2px 与行高）。 */
.ci-ph {
  position: absolute; top: 2px; bottom: 2px; left: 0; right: 0; pointer-events: none;
  display: flex; align-items: center; gap: 3px;
  font-family: Consolas, monospace; font-size: var(--pg-console-font, 12.5px); line-height: var(--pg-console-lh, 1.7);
  color: var(--pg-text-soft); white-space: nowrap; overflow: hidden;
}
.ci-ph-text { opacity: .8; }
/* 聚焦：只淡显引导文字，不动光标 */
.ci-ph.is-focused .ci-ph-text { opacity: .45; }
.py-page.theme-dark .ci-ph-text { opacity: 1; }
.py-page.theme-dark .ci-ph.is-focused .ci-ph-text { opacity: .6; }
/* S7.25：光标改用提亮墨水主色（暗色下原主色 ~2:1 不可辨），宽度 2px→3px 增强存在感。
   S7.28：高度 1.05em≈字符高，垂直居中于行盒——与字符对齐，不再上下悬空。 */
.ci-caret {
  flex: none; width: 3px; height: 1.05em; border-radius: 1px;
  background: var(--pg-primary-ink, var(--pg-primary)); animation: ci-blink 1.06s steps(1) infinite;
}
@keyframes ci-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ci-caret { animation: none; } }
.console-input :deep(textarea.console-textarea.ant-input) {
  background: transparent; border: none !important; box-shadow: none !important; padding: 2px 0;
  font-family: Consolas, monospace; font-size: var(--pg-console-font, 12.5px); line-height: var(--pg-console-lh, 1.7); color: var(--pg-text);
  resize: none;
  /* ⚠️ S7.28：原生 caret 全面弃用。它按 line-height 撑高（20.4px vs 字符 14px，上下各悬空 3.2px）= 用户所报「光标错位」；
     且聚焦空态会与自绘光标一前一后成双光标（S7.27）。统一用自绘 3px 光标，水平位置由 measureText 精确给出。 */
  caret-color: transparent;
}
.console-input :deep(textarea.console-textarea.ant-input)::placeholder { color: var(--pg-text-soft); opacity: .8; }
.console-input :deep(textarea.console-textarea.ant-input:hover),
.console-input :deep(textarea.console-textarea.ant-input:focus) { border: none !important; box-shadow: none !important; }
.muted { color: var(--pg-text-soft); font-size: 12.5px; line-height: 1.8; }

.diag-list { list-style: none; margin: 0; padding: 0; }
/* 问题卡片（P0 抬头版式：档位徽章 + 行号 + 中文 + 建议） */
.diag-card {
  padding: 8px 11px; margin-bottom: 8px; border-radius: 8px; cursor: pointer;
  font-size: 12.5px; line-height: 1.6; border-left: 3px solid var(--tier);
  background: var(--tier-bg); transition: filter .12s;
}
.diag-card.tier-sym { --tier: #C89B3C; --tier-bg: rgba(200,155,60,0.10); }
.diag-card.tier-syn { --tier: #D9822B; --tier-bg: rgba(217,130,43,0.10); }
.diag-card.tier-typ { --tier: #E15759; --tier-bg: rgba(225,87,89,0.08); }
.diag-card.tier-nam { --tier: #8B5CF6; --tier-bg: rgba(139,92,246,0.08); }
.diag-card.tier-oth { --tier: #8A9A94; --tier-bg: rgba(138,154,148,0.08); }
.diag-card:hover { filter: brightness(0.97); }
.diag-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.diag-badge {
  font-size: 11px; font-weight: 700; color: #fff; background: var(--tier);
  border-radius: 6px; padding: 1px 7px; line-height: 1.6;
}
.diag-line { flex: none; color: var(--pg-text-soft); font-family: Consolas, monospace; font-size: 11.5px; }
.diag-gran { flex: none; color: var(--pg-text-soft); font-size: 11px; opacity: .7; }
.diag-cn { white-space: pre-wrap; color: var(--pg-text); }
.diag-sug { margin-top: 5px; font-size: 12px; color: var(--pg-text-soft); }
.d-line { flex: none; color: var(--pg-text-soft); font-family: Consolas, monospace; }
.d-cn { white-space: pre-wrap; }

/* ⚠️ S7.34：min-height:0 + overflow:hidden —— grid 项默认 min-height:auto 会被内容顶高，
   必须显式归零才能让卡片拿到「被钳死的高度」；overflow:hidden 保证圆角内不露出滚动内容。 */
.py-right { position: relative; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
/* 拖拽调宽把手：盖住卡片左缘 + 一半栅格间隙 */
.hw-resize {
  position: absolute; left: -9px; top: 0; width: 12px; height: 100%;
  cursor: col-resize; z-index: 3; border-radius: 6px;
}
.hw-resize:hover { background: var(--pg-primary-soft); }
/* ⚠️ S7.34：flex:1 + min-height:0（原为 height:100%）——.hw-card 作为 .py-right 的 flex 子项，
   默认 min-height:auto 会锁在内容高，min-height:0 才允许被压缩到容器高 → 内部 overflow:auto 生效，
   判题结果卡变长时改为「卡片内滚动」而非「整页溢出被裁」。 */
.hw-card {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  /* 自适应默认：随内容取宽，夹在 [300, 460] */
  width: max-content; min-width: 300px; max-width: 460px;
}
.hw-card:hover { border-color: var(--pg-primary-soft); }
.hw-card :deep(.ant-card-body) { padding: 14px 16px; }
.prob-title { font-size: 17px; font-weight: 600; color: var(--pg-text); margin: 2px 0 8px; line-height: 1.4; }
.prob-desc { font-size: 13px; line-height: 1.7; color: var(--pg-text-soft); margin: 0 0 12px; }
.prob-sec { margin-bottom: 12px; }
/* S7.25：问题卡内所有主色前景一律改墨水色（暗色下原主色 ~2:1 糊死） */
.prob-sec-t { font-size: 12px; font-weight: 700; color: var(--pg-primary-ink); margin-bottom: 6px; }
/* S7.33：要求 = 编号步骤清单（主色圆点序号），从"说明文"变"任务清单" */
.prob-steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
.prob-steps > li {
  position: relative; padding-left: 27px; margin-bottom: 7px;
  font-size: 13px; line-height: 1.8; color: var(--pg-text);
  counter-increment: step;
}
.prob-steps > li::before {
  content: counter(step);
  position: absolute; left: 0; top: 5px;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--pg-primary); color: #fff;
  font-size: 11px; font-weight: 700; line-height: 18px; text-align: center;
}
.prob-steps code {
  font-family: Consolas, monospace; font-size: 12px; background: var(--pg-primary-bg);
  border-radius: 4px; padding: 0 5px; color: var(--pg-primary-ink);
}
/* S7.33：示例 = 终端预览块（>>> 输入行 + 结果行），学生一眼看到"跑对了长什么样" */
.sample-term {
  font-family: Consolas, monospace; font-size: 12px; line-height: 1.7;
  background: var(--pg-term-bg); border: 1px solid var(--pg-line); border-radius: 8px;
  padding: 8px 10px; color: var(--pg-text);
}
.st-line { display: flex; gap: 8px; align-items: baseline; white-space: pre-wrap; word-break: break-all; }
.st-prompt { flex: none; color: var(--pg-primary-ink); font-weight: 700; user-select: none; }
.st-out { margin-top: 2px; }
.st-out .st-code { color: var(--pg-text-soft); }
.muted { color: var(--pg-text-soft); font-size: 12.5px; line-height: 1.8; }
/* S7.33：提示去黄色警告框（提示≠警告，不与要求抢权重）→ 💡 中性小字 */
.prob-hint { display: flex; gap: 7px; align-items: flex-start; font-size: 12.5px; line-height: 1.7; color: var(--pg-text-soft); }
.hint-ico { flex: none; font-size: 12px; line-height: 1.7; }
/* S7.33：元信息沉底——顶部细分隔线 + 弱化，与题目内容拉开层级 */
.prob-meta {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--pg-line);
}
.prob-meta :deep(.ant-tag) { margin-inline-end: 0; font-size: 11px; line-height: 1.7; color: var(--pg-text-soft); background: transparent; border-color: var(--pg-line); }

/* ═══ S7 提交作业 + 判题结果卡 ═══ */
/* 提交按钮：作业区底部主操作，与 meta 之间留白；antd 主色按钮已随主题，勿重复上色 */
.prob-submit { margin-top: 16px; }
.prob-submit :deep(.ant-btn-lg) { height: 40px; font-size: 14px; font-weight: 600; border-radius: 8px; }

/* 结果卡：与题目内容之间细线分隔，内部极简排版（大分数 + 通过率 + 用例明细） */
.judge-card {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--pg-line);
}
.jc-head { display: flex; align-items: baseline; gap: 10px; }
.jc-score { font-size: 30px; font-weight: 700; line-height: 1; letter-spacing: -.5px; }
.jc-score.sc-ok { color: var(--pg-ok); }
.jc-score.sc-bad { color: var(--pg-danger); }
.jc-score-unit { font-size: 12px; font-weight: 500; margin-left: 2px; color: var(--pg-text-soft); }
.jc-pass { font-size: 12px; color: var(--pg-text-soft); }
/* 通过率条：细线 track + 主色/分数色 fill */
.jc-bar { margin-top: 8px; height: 5px; border-radius: 3px; background: var(--pg-line); overflow: hidden; }
.jc-bar > span { display: block; height: 100%; border-radius: 3px; background: var(--pg-primary); transition: width .35s ease; }
.jc-bar > span.sc-ok { background: var(--pg-ok); }
.jc-bar > span.sc-bad { background: var(--pg-danger); }
/* 用例明细：✓ 绿 / ✗ 红，失败行给期望 vs 实际（超时单标） */
.jc-cases { list-style: none; margin: 10px 0 0; padding: 0; }
.jc-cases > li {
  display: flex; align-items: baseline; gap: 7px;
  padding: 4px 0; font-size: 12px; line-height: 1.6; color: var(--pg-text-soft);
  border-top: 1px dashed var(--pg-line);
}
.jc-cases > li:first-child { border-top: none; }
.jc-cases > li.ok .jc-mark { color: var(--pg-ok); }
.jc-cases > li.bad .jc-mark { color: var(--pg-danger); }
.jc-mark { flex: none; font-weight: 700; }
.jc-name { flex: none; color: var(--pg-text); }
.jc-note {
  margin-left: auto; text-align: right;
  font-family: Consolas, monospace; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;
}

/* S4 外观弹层（a-popover 插槽内容，随 antd 明暗；文字用 inherit/currentColor 自适应） */
.ap-body { min-width: 240px; }
.ap-row { margin-bottom: 14px; }
.ap-row:last-child { margin-bottom: 0; }
.ap-label { font-size: 12px; opacity: .75; margin-bottom: 6px; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.preset-btn {
  display: inline-flex; align-items: center; gap: 7px; padding: 6px 9px;
  border: 1px solid rgba(127,127,127,0.35); border-radius: 8px; background: rgba(127,127,127,0.08);
  color: inherit; font-size: 12.5px; cursor: pointer; text-align: left;
}
.preset-btn:hover { border-color: rgba(127,127,127,0.65); }
.preset-btn.on { border-color: #1F5F4F; box-shadow: inset 0 0 0 1px #1F5F4F; }
.preset-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; border: 1px solid rgba(0,0,0,0.18); }
.accent-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.swatch { width: 22px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; padding: 0; }
.swatch.on { box-shadow: 0 0 0 2px currentColor; }
.swatch-color { width: 28px; height: 24px; border: none; background: none; cursor: pointer; padding: 0; }

@media (max-width: 1100px) {
  /* 单列堆叠：还原隐式 auto 行，避免上面新增的 minmax(0,1fr) 把第一行压成容器高 */
  .py-main { grid-template-columns: 1fr; grid-template-rows: auto; }
  .py-right { overflow: visible; min-height: auto; }
  .hw-card { flex: none; min-height: auto; overflow: visible; }
  .hw-resize { display: none; }
  .hw-card { width: auto !important; max-width: none; }
  .editor-card { flex: none; height: 420px; }
}
</style>

<!-- CodeMirror 全局样式（非 scoped）：编辑器 DOM 由 CM 注入到 .code-host，作用于全局。
     所有颜色走 --cm-* CSS 变量；亮/暗由 .code-host.is-dark 切换变量值（S6 可由用户预设覆盖）。 -->
<style>
/* ── 细主题色滚动条（页面作用域内全覆盖：CM 编辑器 / 输出·问题·输入 / 作业区 / 弹层）──
   颜色走 --pg-* 变量，自动跟随亮/暗/预设/主色；轨道透明，hover 加深 */
.py-page * {
  scrollbar-width: thin;                       /* Firefox */
  scrollbar-color: var(--pg-line) transparent;
}
.py-page ::-webkit-scrollbar { width: 8px; height: 8px; }
.py-page ::-webkit-scrollbar-track { background: transparent; }
.py-page ::-webkit-scrollbar-thumb {
  background: var(--pg-line); border-radius: 4px; border: 2px solid transparent;
  background-clip: padding-box;
}
.py-page ::-webkit-scrollbar-thumb:hover { background-color: var(--pg-text-soft); }
.py-page ::-webkit-scrollbar-corner { background: transparent; }
/* 编辑区滚动条贴边更窄一点（CM scroller 自带 padding，不需要留白） */
.py-page .cm-scroller::-webkit-scrollbar { width: 7px; height: 7px; }

.code-host {
  /* 亮色（默认） */
  --cm-font: 14px;
  --cm-bg: #ffffff; --cm-text: #23332e;
  --cm-gutter: #f4fbf8; --cm-gutter-text: #6b7d76; --cm-border: #a7d7bb;
  --cm-cursor: #1F5F4F; --cm-active: rgba(31,95,79,0.05);
  --cm-active-gutter: rgba(31,95,79,0.06); --cm-sel: rgba(31,95,79,0.18);
  --cm-kw: #1F5F4F; --cm-str: #C89B3C; --cm-num: #5a8a3c; --cm-comment: #8aa79c;
  --cm-fn: #8a5a00; --cm-type: #1F5F4F; --cm-self: #E15759; --cm-null: #3a8ec0;
  --cm-err: #E15759; --cm-err-line: rgba(225,87,89,0.16); --cm-warn: #C89B3C; --cm-fw: #C89B3C; --cm-fw-bg: rgba(200,155,60,0.13);
  --cm-sym: #C89B3C; --cm-sym-bg: rgba(200,155,60,0.16); --cm-sym-cur: rgba(200,155,60,0.26);
  --cm-syn: #D9822B; --cm-syn-bg: rgba(217,130,43,0.14); --cm-syn-cur: rgba(217,130,43,0.24);
  --cm-typ: #E15759; --cm-typ-bg: rgba(225,87,89,0.13); --cm-typ-cur: rgba(225,87,89,0.22);
  --cm-nam: #8B5CF6; --cm-nam-bg: rgba(139,92,246,0.13); --cm-nam-cur: rgba(139,92,246,0.22);
  --cm-oth: #8A9A94; --cm-oth-bg: rgba(138,154,148,0.12); --cm-oth-cur: rgba(138,154,148,0.20);
  --cm-panel: #ffffff; --cm-panel-text: #23332e; --cm-accent: #1F5F4F; --cm-accent-soft: #E8F2EC;
}
.code-host.is-dark {
  --cm-bg: #0f1a17; --cm-text: #e8f2ec;
  --cm-gutter: #1a2622; --cm-gutter-text: #8aa79c; --cm-border: #2c403a;
  --cm-cursor: #4ec9b0; --cm-active: rgba(78,201,176,0.07);
  --cm-active-gutter: rgba(78,201,176,0.09); --cm-sel: rgba(78,201,176,0.25);
  --cm-kw: #c586c0; --cm-str: #e0b25a; --cm-num: #b5cea8; --cm-comment: #7d968c;
  --cm-fn: #dcdcaa; --cm-type: #4ec9b0; --cm-self: #ff7b7d; --cm-null: #569cd6;
  --cm-err: #ff7b7d; --cm-err-line: rgba(255,123,125,0.18); --cm-warn: #e0b25a; --cm-fw: #e0b25a; --cm-fw-bg: rgba(224,178,90,0.15);
  --cm-sym: #e0b25a; --cm-sym-bg: rgba(224,178,90,0.22); --cm-sym-cur: rgba(224,178,90,0.34);
  --cm-syn: #e89a4d; --cm-syn-bg: rgba(232,154,77,0.20); --cm-syn-cur: rgba(232,154,77,0.32);
  --cm-typ: #ff7b7d; --cm-typ-bg: rgba(255,123,125,0.18); --cm-typ-cur: rgba(255,123,125,0.28);
  --cm-nam: #b79cff; --cm-nam-bg: rgba(183,156,255,0.20); --cm-nam-cur: rgba(183,156,255,0.30);
  --cm-oth: #9db3ab; --cm-oth-bg: rgba(157,179,171,0.16); --cm-oth-cur: rgba(157,179,171,0.24);
  --cm-panel: #1a2622; --cm-panel-text: #e8f2ec; --cm-accent: #4ec9b0; --cm-accent-soft: #14302a;
}

/* S4 预设：高对比度（亮） */
.code-host.preset-contrast {
  --cm-bg: #ffffff; --cm-text: #101010; --cm-gutter: #f0f0f0; --cm-gutter-text: #555;
  --cm-border: #1a1a1a; --cm-cursor: #0b3d33; --cm-active: rgba(0,0,0,0.07);
  --cm-active-gutter: rgba(0,0,0,0.09); --cm-sel: rgba(0,0,0,0.22);
  --cm-kw: #0b3d33; --cm-str: #9a4e00; --cm-num: #146414; --cm-comment: #4d4d4d;
  --cm-fn: #8a2f00; --cm-type: #0b3d33; --cm-self: #b00000; --cm-null: #0a4d7a;
  --cm-err: #c00000; --cm-err-line: rgba(192,0,0,0.16); --cm-warn: #9a6b00; --cm-fw: #8a5a00; --cm-fw-bg: rgba(154,94,0,0.16);
  --cm-sym: #a06a00; --cm-syn: #b45309; --cm-typ: #c00000; --cm-nam: #6d28d9; --cm-oth: #4b5563;
}
/* S4 预设：暖纸 sepia（亮） */
.code-host.preset-sepia {
  --cm-bg: #f6efe0; --cm-text: #3b2f1e; --cm-gutter: #efe6d2; --cm-gutter-text: #8a7a5c;
  --cm-border: #c9b98e; --cm-cursor: #8a6a2f; --cm-active: rgba(120,90,40,0.06);
  --cm-active-gutter: rgba(120,90,40,0.09); --cm-sel: rgba(120,90,40,0.2);
  --cm-kw: #8a6a2f; --cm-str: #a8761f; --cm-num: #5a6b1f; --cm-comment: #9a8a6a;
  --cm-fn: #7a4a10; --cm-type: #8a6a2f; --cm-self: #b5482f; --cm-null: #3a6a8a;
  --cm-err: #c0392b; --cm-err-line: rgba(192,57,43,0.16); --cm-warn: #b8860b; --cm-fw: #a87a1f; --cm-fw-bg: rgba(168,122,31,0.16);
  --cm-sym: #a8761f; --cm-syn: #b45309; --cm-typ: #c0392b; --cm-nam: #7c3aed; --cm-oth: #7a6a4a;
}

.code-host .cm-editor { height: 100%; outline: none !important; }
.code-host .cm-errorLine { background: var(--cm-err-line); box-shadow: inset 3px 0 0 var(--cm-err); }
.code-host .cm-lintErr { text-decoration: underline wavy var(--cm-err) 1.5px; text-underline-offset: 3px; }
.code-host .cm-lintWarn { text-decoration: underline wavy var(--cm-warn) 1.5px; text-underline-offset: 3px; }
.code-host .cm-fwChar {
  text-decoration: underline wavy var(--cm-fw) 1.5px; text-underline-offset: 3px;
  background: var(--cm-fw-bg); border-radius: 2px;
}

/* P0 四色诊断装饰：.cm-e-{tier} 只波浪线；加 .cm-e-tok 变体 = 色块+圆角（粒度 token） */
.code-host .cm-e-sym { text-decoration: underline wavy var(--cm-sym) 1.5px; text-underline-offset: 3px; }
.code-host .cm-e-syn { text-decoration: underline wavy var(--cm-syn) 1.5px; text-underline-offset: 3px; }
.code-host .cm-e-typ { text-decoration: underline wavy var(--cm-typ) 1.5px; text-underline-offset: 3px; }
.code-host .cm-e-nam { text-decoration: underline wavy var(--cm-nam) 1.5px; text-underline-offset: 3px; }
.code-host .cm-e-oth { text-decoration: underline wavy var(--cm-oth) 1.5px; text-underline-offset: 3px; }
.code-host .cm-e-tok { background: rgba(0,0,0,0.06); border-radius: 3px; padding: 0 1px; }
.code-host .cm-e-sym.cm-e-tok { background: var(--cm-sym-bg); }
.code-host .cm-e-syn.cm-e-tok { background: var(--cm-syn-bg); }
.code-host .cm-e-typ.cm-e-tok { background: var(--cm-typ-bg); }
.code-host .cm-e-nam.cm-e-tok { background: var(--cm-nam-bg); }
.code-host .cm-e-oth.cm-e-tok { background: var(--cm-oth-bg); }
/* 当前行加深一档（纯 CSS：激活行上的块高亮用更深一档底色） */
.code-host .cm-activeLine .cm-e-sym.cm-e-tok { background: var(--cm-sym-cur); }
.code-host .cm-activeLine .cm-e-syn.cm-e-tok { background: var(--cm-syn-cur); }
.code-host .cm-activeLine .cm-e-typ.cm-e-tok { background: var(--cm-typ-cur); }
.code-host .cm-activeLine .cm-e-nam.cm-e-tok { background: var(--cm-nam-cur); }
.code-host .cm-activeLine .cm-e-oth.cm-e-tok { background: var(--cm-oth-cur); }

/* CM 弹层统一皮肤（baseTheme 运行时注入，关键色须 !important 压过） */
.code-host .cm-tooltip {
  border: 1px solid var(--cm-border) !important; border-radius: 8px;
  background: var(--cm-panel, #ffffff) !important; color: var(--cm-panel-text, #23332e) !important;
  box-shadow: 0 6px 18px rgba(0,0,0,.22); overflow: hidden;
}
/* 暗色加固：is-dark 下弹层强制深色实底（变量缺失也不许回退白底） */
.code-host.is-dark .cm-tooltip {
  background: #1a2622 !important; color: #e8f2ec !important;
  border-color: #2c403a !important;
}
.code-host.is-dark .cm-tooltip.cm-tooltip-autocomplete > ul { background: #1a2622 !important; }
.code-host.is-dark .cm-completionInfo { background: #1a2622 !important; color: #e8f2ec !important; }
.code-host .cm-tooltip.cm-tooltip-autocomplete { padding: 0 !important; }
.code-host .cm-tooltip.cm-tooltip-autocomplete > ul {
  font-family: "Cascadia Code", Consolas, monospace !important;
  font-size: 13.5px !important; max-height: 15em; background: transparent; color: var(--cm-panel-text);
}
.code-host .cm-tooltip-autocomplete ul li[aria-selected] {
  background: var(--cm-accent-soft) !important; color: var(--cm-accent) !important;
}
.code-host .cm-completionMatchedText { text-decoration: none !important; color: var(--cm-accent); font-weight: 700; }
.code-host .cm-completionDetail { color: var(--cm-gutter-text); font-style: normal; }
.code-host .cm-completionInfo {
  background: var(--cm-panel) !important; color: var(--cm-panel-text) !important;
  border: 1px solid var(--cm-border) !important; border-radius: 8px;
  font-size: 12px; line-height: 1.6; padding: 6px 10px; max-width: 260px;
}

/* hover 弹窗（D 为主 C 兜底）：第一行=徽章+一句诊断；第二行=错→对示例 或 改法。
   含全角字符的文本统一加中文回退字体（Cascadia 等缺 CJK 全角字形，回退渲染会变形）。 */
.lint-tip { max-width: 440px; padding: 9px 12px; font-size: 12.5px; line-height: 1.6; font-family: "Cascadia Code", "微软雅黑", sans-serif; }
.lint-tip.is-err { border-left: 3px solid var(--cm-err); }
.lint-tip.is-warn { border-left: 3px solid var(--cm-warn); }
.lint-tip.is-info { border-left: 3px solid var(--cm-accent); }
.lint-tip.is-fw { border-left: 3px solid var(--cm-fw); }
.lint-tip .tip-tier {
  display: inline-block; font-size: 11px; font-weight: 700; color: #fff;
  border-radius: 6px; padding: 0 7px; margin-right: 7px; line-height: 1.7; vertical-align: 1px;
}
.lint-tip.is-err .tip-tier { background: var(--cm-err); }
.lint-tip.is-warn .tip-tier { background: var(--cm-warn); }
.lint-tip.is-info .tip-tier { background: var(--cm-accent); }
.lint-tip.is-fw .tip-tier { background: var(--cm-fw); }
.lint-tip .tip-head { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
.lint-tip .tip-short { color: var(--cm-panel-text); font-weight: 500; }
/* 符号芯片：金色代码底色块，符号放大，与正文彻底区分 */
.lint-tip .tip-chip {
  font-family: "Cascadia Code", "微软雅黑", monospace; font-size: 15px; line-height: 1;
  color: var(--cm-fw); background: var(--cm-fw-bg);
  border: 1px solid var(--cm-fw); border-radius: 5px;
  padding: 3px 8px; margin-left: 8px;
}
.lint-tip .tip-fix {
  display: flex; gap: 7px; margin-top: 6px; font-size: 12.5px; line-height: 1.6;
  color: var(--cm-gutter-text);
}
.lint-tip .tip-fix-label {
  flex: none; font-size: 11px; font-weight: 700; line-height: 1.8;
  color: var(--cm-accent);
}
.lint-tip .tip-demo {
  display: flex; align-items: center; gap: 8px; margin-top: 7px;
  font-family: "Cascadia Code", "微软雅黑", monospace; font-size: 13px;
}
.lint-tip .tip-demo-bad, .lint-tip .tip-demo-good { border-radius: 6px; padding: 2px 9px; }
.lint-tip .tip-demo-bad { background: rgba(225,87,89,0.14); color: #b23a40; text-decoration: line-through; text-decoration-thickness: 1px; }
.lint-tip .tip-demo-good { background: rgba(75,157,110,0.16); color: #2e7a4f; }
.lint-tip .tip-demo-arrow { color: var(--cm-gutter-text); font-size: 12px; }
.code-host.is-dark .tip-demo-bad { color: #ff9a9c; }
.code-host.is-dark .tip-demo-good { color: #7fd8a4; }
.lint-tip code { font-family: "Cascadia Code", Consolas, monospace; }

/* ── 函数提示（海龟同思路）：信息面板 + 参数卡 ── */
/* 候选信息面板（输入函数名时选中项展开） */
.fn-info { min-width: 240px; max-width: 380px; padding: 2px 0; }
.fn-info-sig {
  font-family: "Cascadia Code", Consolas, monospace; font-size: 13px; line-height: 1.6;
  color: var(--cm-panel-text); padding: 3px 10px;
}
.fn-info-name { color: var(--cm-accent); font-weight: 700; margin-right: 1px; }
.fn-info-desc { font-size: 12px; line-height: 1.6; color: var(--cm-gutter-text); padding: 2px 10px 4px; }
.fn-info-ex {
  display: flex; gap: 6px; align-items: flex-start; margin: 2px 10px 4px; padding: 4px 8px;
  background: var(--cm-accent-soft); border-radius: 6px;
}
.fn-info-ex-tag {
  flex: none; font-size: 10.5px; color: var(--cm-accent); border: 1px solid var(--cm-accent);
  border-radius: 4px; padding: 0 4px; line-height: 1.5; margin-top: 1px;
}
.fn-info-ex code {
  font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; line-height: 1.6;
  color: var(--cm-panel-text); white-space: pre-wrap;
}
/* 参数卡（光标落在函数括号内）：实底、压过补全信息面板 */
.sig-tip {
  position: absolute; z-index: 20; max-width: 340px;
  background: var(--cm-panel, #1a2622) !important; color: var(--cm-panel-text, #e8f2ec);
  border: 1px solid var(--cm-border, #2c403a) !important; border-radius: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,.28); overflow: hidden; pointer-events: none;
}
.sig-tip .fn-info-sig { display: flex; flex-wrap: wrap; align-items: baseline; padding: 6px 10px 3px; background: var(--cm-accent-soft); }
.sig-tip .sig-active { color: var(--cm-accent); font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.sig-params { padding: 4px 0 5px; }
.sig-param {
  display: flex; gap: 8px; align-items: baseline; padding: 2px 10px;
  font-size: 12px; line-height: 1.6;
}
.sig-param code {
  flex: none; font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; color: var(--cm-gutter-text);
}
.sig-param.on { background: var(--cm-accent-soft); }
.sig-param.on code { color: var(--cm-accent); font-weight: 700; }
.sig-param.on span { color: var(--cm-panel-text); }
.sig-param span { color: var(--cm-gutter-text); }
</style>
