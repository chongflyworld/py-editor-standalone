// CM6 装饰：运行报错行标 / Pyright 波浪线 / 实时中文全角符号标记。
// 全部为 StateField + StateEffect 或 ViewPlugin，纯逻辑、可热更新（主题切换不重建编辑器）。
// 直接 import CM 包（npm 单实例，与 usePyEditor 同一份），避免通过参数传递实例。
import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import { scanFWLine } from "./constants.js";

// 运行报错行红标（Skulpt 抛错行）：StateField + StateEffect，payload 为行号 | null
export function buildErrMark() {
  const setErrEffect = StateEffect.define();
  const errField = StateField.define({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects) {
        if (e.is(setErrEffect)) {
          if (e.value == null) return Decoration.none;
          const n = Math.min(Math.max(1, e.value), tr.state.doc.lines);
          const l = tr.state.doc.line(n);
          return Decoration.set([Decoration.line({ class: "cm-errorLine" }).range(l.from)]);
        }
      }
      try { return deco.map(tr.changes); } catch (e) { return Decoration.none; }
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return { errField, setErrEffect };
}

// Pyright 诊断红/黄波浪线：StateField + StateEffect，payload 为 DecorationSet
export function buildLintMark() {
  const setLintsEffect = StateEffect.define();
  const lintField = StateField.define({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects) { if (e.is(setLintsEffect)) return e.value || Decoration.none; }
      // ⚠️ 装饰一旦越界（from/to > 文档长），这里 map 会抛
      //    "Position N is out of range for changeset of length M" 并连带打坏整个编辑器状态。
      //    RangeSet 构造期不做校验，必须靠这道兜底 + 上游夹取双保险。
      try { return deco.map(tr.changes); } catch (e) { return Decoration.none; }
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return { lintField, setLintsEffect };
}

// Pyright 诊断区间变化 → 通知 fw 插件重扫让位（被覆盖的全角字符不画、不计数）
export const fwYieldEffect = StateEffect.define();

// 实时中文全角符号标记（不等 Pyright 防抖，边打边标）。
// 严格规则：跳过字符串内部、跳过 # 注释之后；唯一例外：字符串内部若出现「全角引号」仍报。
// 合并规则：被 Pyright 诊断区间（diagRef.current）覆盖的全角字符 → 不画 mark、不计徽标（让位）。
// diagRef.current 由 usePyEditor 在每次 Pyright 诊断更新后写入；fwYieldEffect 触发本插件重扫。
export function buildFwMark(fwRef, onCount, diagRef) {
  const mark = Decoration.mark({ class: "cm-fwChar" });
  const covered = (p) => {
    const list = diagRef && diagRef.current;
    if (!list || !list.length) return false;
    for (const d of list) if (p >= d.from && p < d.to) return true;
    return false;
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) { this.deco = this.scan(view); }
      update(u) {
        const rescan = u.docChanged || u.viewportChanged ||
          u.transactions.some((t) => t.effects.some((e) => e.is(fwYieldEffect)));
        if (rescan) this.deco = this.scan(u.view);
      }
      scan(view) {
        const b = [];
        const hits = [];
        const doc = view.state.doc;
        for (const { from, to } of view.visibleRanges) {
          const n0 = doc.lineAt(from).number;
          const n1 = doc.lineAt(to).number;
          for (let n = n0; n <= n1; n++) {
            const L = doc.line(n);
            for (const h of scanFWLine(L.text)) {
              const f = L.from + h.i;
              if (f < from || f >= to) continue;
              if (covered(f)) continue; // Pyright 已覆盖 → 让位
              b.push(mark.range(f, f + 1));
              hits.push({ from: f, to: f + 1, ch: h.c, line: n });
            }
          }
        }
        fwRef.current = hits;
        if (onCount) onCount(hits.length);
        return Decoration.set(b, true);
      }
      },
    { decorations: (v) => v.deco },
  );
}
