# Python 在线编辑器（离线分享版）

一个**完全在浏览器内运行**的 Python 教学编辑器：写代码、点运行、看结果、按测试用例自动判分 —— **不需要任何后端服务器，可离线 / 内网机房使用**。

基于 [Skulpt](https://skulpt.org/)（把 Python 编译成 JavaScript 在浏览器执行），配套 [Pyright](https://github.com/microsoft/pyright)（类型检查）、CodeMirror 6（代码编辑器）、ant-design-vue（界面）。

---

## 一、别人怎么用（两种交付物都已备好）

本项目目录 `py-editor-standalone/` 同时包含**构建产物**和**源码**，按对方情况二选一：

### 方案 A：直接发 `dist/`（推荐给同行教师，零门槛）
`dist/` 是**自包含**的静态站点（已把 Skulpt/Pyright 内核、题目 JSON 全部打包进根目录）。
对方只需把 `dist/` 整个文件夹：

- **丢到任意静态服务器 / 学校内网站点根或子目录**即可访问（GitHub Pages、Nginx、Apache、对象存储静态托管都行）；
- 或用 **任意静态文件服务器**本地起服务（见下方「部署」）；
- ⚠️ 不能直接双击 `index.html` 用 `file://` 打开 —— 浏览器安全策略会拦截 Worker / fetch 内核文件，必须经由 http 服务访问。

### 方案 B：发源码（对方会前端，想自己改题/改界面）
把 `py-editor-standalone/` 整目录给对方，按下方「开发」步骤 `npm install && npm run build` 即可重新产出 `dist/`。

---

## 二、部署（3 种常见方式）

### 1) 任意静态服务器（最通用）
```bash
cd dist
# Python 自带静态服务器（对方机器装了 Python 即可）
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```
> 用 Nginx / Apache 时同理：把 `dist/` 设为站点根目录即可。

### 2) GitHub Pages
把 `dist/` 内容推到仓库的 `gh-pages` 分支（或仓库 `Settings → Pages` 指向含 `dist` 的分支），即获得公网 `https://<用户名>.github.io/<仓库>/` 链接，直接发链接给学生。

### 3) 网盘 / U 盘
整目录发给对方后，对方按方式 1 起一个本地静态服务即可（无需联网，内核已离线打包）。

---

## 三、使用说明（给学生 / 自用）

- **运行**：写代码后点工具栏「运行」。若代码含 `input()`，会在控制台出现输入框，键入内容回车即可（终端式交互）。
- **提交作业（判题）**：点作业区底部「提交作业」，系统按题目内置测试用例逐一喂入、比对输出，给出通过数 / 总分，并标出哪条用例未过 / 超时。
- **外观**：右上「🎨 外观」可换主题预设、主色、字号（默认 24px，可调 14–36px）、行高、字体；设置自动存本地浏览器。
- **切换题目**：URL 加 `?task=<题号>` 精确打开某题，例如 `http://localhost:8080/?task=t-reverse`。

---

## 四、题目怎么配（教师自行增删题）

编辑 `public/problems.json`（构建后对应 `dist/problems.json`）。数组里每道题结构：

```json
{
  "id": "t-add",                       // 题号，用于 ?task= 精确加载
  "title": "两数相加",
  "level": "入门",
  "fileName": "starter.py",
  "starter": "def add(a, b):\n    return a + b\n\n\na, b = map(int, input().split())\nprint(add(a, b))\n",
  "desc": "读入一行两个整数，编写函数 add 返回两数之和。",
  "reqs": ["定义函数 add(a,b)", "读取两个整数", "调用并输出"],
  "hint": "用 map(int, …) 把 input 字符串转整数。",
  "sampleIn": "2 3",
  "sampleOut": "5",
  "tags": ["函数", "入门"],
  "tests": [
    { "name": "正整数", "input": "2 3", "expected": "5" },
    { "name": "含负数", "input": "-4 9", "expected": "5" },
    { "name": "零",     "input": "0 0", "expected": "0" }
  ]
}
```

要点：
- `tests[].input` 会作为 `stdin` 整行喂给程序；`expected` 与程序 `stdout` 逐字符比对（忽略结尾换行）。
- 改完 `public/problems.json` 后**需重新构建**（`npm run build`）才会进 `dist/`；若对方直接改的是已部署的 `dist/problems.json`，刷新页面即生效（无需重建）。
- 多题时页面默认加载第一道；用 `?task=<id>` 指定。

---

## 五、能力边界（设计题目时务必注意）

执行引擎是 **Skulpt**，仅支持 **Python 核心语法 + 标准库子集 + turtle 绘图**。
**不支持**以下，题目请勿涉及：
- `numpy` / `pandas` / `requests` / `matplotlib` 等第三方库；
- 文件系统的真实读写、网络请求、多线程、子进程；
- 部分标准库模块在 Skulpt 中未实现或行为有差异。

适合：**信息技术入门教学**（顺序/分支/循环、函数、字符串、列表、简单算法、turtle 绘图）。

---

## 六、依赖与授权

全部为前端依赖，均可自由再分发（保留第三方 LICENSE 即可）：
- Vue 3（MIT）、ant-design-vue（MIT）、CodeMirror 6（MIT）
- Skulpt（MIT）、Pyright（Microsoft，MIT）、typeshed（PSF，PSF 许可）

本独立项目以 **MIT** 许可发布。

---

## 七、开发（改源码 / 二次开发）

```bash
npm install
npm run dev        # 本地开发，默认 http://localhost:5174
npm run build      # 产出 dist/（自包含，可直接部署）
npm run preview    # 本地预览构建产物
```

目录结构：
```
py-editor-standalone/
├── index.html              # 入口（直接挂 PyEditor，无路由/无后端）
├── vite.config.js          # base: "./" 让 dist 可放任意子目录
├── package.json
├── public/
│   ├── skulpt.min.js       # Python→JS 运行时（自托管）
│   ├── skulpt-stdlib.js    # 标准库
│   ├── pyright.worker.js   # 类型检查 Worker
│   ├── typeshed-bundle.json# 类型定义
│   └── problems.json       # 题目配置（改这里增删题）
├── src/
│   ├── main.js             # 挂载入口
│   ├── views/PyEditor.vue  # 编辑器主界面
│   └── py-editor/          # 编辑器内核（执行/判题/补全/诊断）
│       ├── usePyEditor.js
│       └── core/ (skulpt / pyright / cm* / completion / constants)
└── dist/                   # 构建产物（自包含，部署用）
```

> 与 ClassHub 整站的区别：已剥离 `/api/score` 成绩上报、`/tasks` 拉题、SSE 热加载、登录鉴权；成绩仅本地展示，题目改读本地 `problems.json`。
