// CM6 主题与语法高亮。全部颜色走 CSS 变量（--cm-*），
// 这样切换亮/暗色只需要给宿主容器切换 .is-dark 类即可，无需重建编辑器（S6 还可由用户预设覆盖这些变量）。
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// 编辑器外观主题：bg/text/光标/行号/活动行/选区 全部用 --cm-* 变量
export function buildCmTheme() {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "var(--cm-font, 14px)",
      color: "var(--cm-text)",
      backgroundColor: "var(--cm-bg)",
    },
    ".cm-content": {
      fontFamily: "var(--cm-font-family, \"Cascadia Code\", Consolas, \"Courier New\", monospace)",
      caretColor: "var(--cm-cursor)",
    },
    ".cm-scroller": { overflow: "auto", lineHeight: "var(--cm-line-height, 1.6)" },
    ".cm-gutters": {
      backgroundColor: "var(--cm-gutter)",
      color: "var(--cm-gutter-text)",
      border: "none",
      borderRight: "1px solid var(--cm-border)",
    },
    ".cm-activeLine": { backgroundColor: "var(--cm-active)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--cm-active-gutter)" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "var(--cm-sel) !important" },
    ".cm-cursor": { borderLeftColor: "var(--cm-cursor)", borderLeftWidth: "2px" },
  });
}

// 语法高亮：每类 token 映射到 --cm-* 变量（亮/暗由宿主 .is-dark 切换变量值）
export function buildHighlight() {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: [tags.keyword, tags.definitionKeyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.operator], color: "var(--cm-kw)", fontWeight: "600" },
      { tag: [tags.string], color: "var(--cm-str)" },
      { tag: [tags.number, tags.bool, tags.atom], color: "var(--cm-num)" },
      { tag: [tags.comment], color: "var(--cm-comment)", fontStyle: "italic" },
      { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: "var(--cm-fn)" },
      { tag: [tags.typeName, tags.className], color: "var(--cm-type)", fontWeight: "600" },
      { tag: [tags.self], color: "var(--cm-self)" },
      { tag: [tags.null, tags.atom], color: "var(--cm-null)" },
    ]),
  );
}
