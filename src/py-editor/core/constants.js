// 内核常量与中文诊断映射（纯逻辑，无框架依赖）
// 来源：public/py-editor.html 中的 ERR_CN / PY_KEYWORDS / PY_BUILTINS / PYR_ERR_CN / firstFW / scanFWLine 等。
// 抽取为独立模块，供 CM6 补全、全角扫描、Pyright 中文诊断复用。

// 运行时报错中文（Skulpt 抛出的异常类型 → 中文名）
export const ERR_CN = {
  ZeroDivisionError: "除以零错误",
  NameError: "名称错误（变量未定义）",
  TypeError: "类型错误",
  SyntaxError: "语法错误",
  IndentationError: "缩进错误",
  TabError: "缩进混用错误（Tab/空格混用）",
  ValueError: "值错误",
  AttributeError: "属性错误",
  IndexError: "索引越界",
  KeyError: "字典键不存在",
  FileNotFoundError: "文件未找到",
  ImportError: "导入错误",
  RuntimeError: "运行时错误",
};

// Python 关键字 / 常用内置（补全兜底 + 排序加权共用）
export const PY_KEYWORDS = [
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
  "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
  "or", "pass", "raise", "return", "try", "while", "with", "yield",
];
export const PY_BUILTINS = [
  ["print", "打印输出"], ["input", "读取一行输入"], ["len", "求长度"], ["range", "生成整数序列"],
  ["int", "转整数"], ["str", "转字符串"], ["float", "转小数"], ["bool", "转布尔"],
  ["list", "列表"], ["dict", "字典"], ["set", "集合"], ["tuple", "元组"],
  ["sum", "求和"], ["max", "最大值"], ["min", "最小值"], ["abs", "绝对值"], ["round", "四舍五入"],
  ["sorted", "排序"], ["reversed", "反转"], ["enumerate", "带索引遍历"], ["zip", "并行遍历"],
  ["type", "查看类型"], ["append", "末尾追加"], ["split", "拆分字符串"], ["join", "拼接字符串"],
  ["replace", "替换"], ["format", "格式化"], ["strip", "去掉两端空白"],
];
export const BUILTIN_SET = new Set(PY_BUILTINS.map((b) => b[0]));

// ── 常用函数提示表（海龟编辑器同思路：纯静态表，零网络依赖；文案为教学口吻自写）──
// label: 函数名；sig: 展示用签名；desc: 一句话用途；example: 可照抄示例；params: 参数逐条说明。
// 用途：① 补全候选的说明/信息面板 ② 打 "(" 后的参数卡弹窗。
export const PY_FN = [
  { label: "print", sig: "print(*values, sep, end)", desc: "把内容打印到输出区", example: 'print("Hello!", 123)',
    params: [
      { name: "*values", desc: "要打印的内容，可以写多个，用逗号隔开" },
      { name: "sep", desc: "多个内容之间的分隔符，默认是空格" },
      { name: "end", desc: "打印完末尾追加的字符，默认是换行" },
    ] },
  { label: "input", sig: "input(prompt)", desc: "读入一行键盘输入，结果是字符串", example: 'name = input("你的名字：")',
    params: [{ name: "prompt", desc: "给用户的提示语，可以省略" }] },
  { label: "len", sig: "len(obj)", desc: "求长度：字符串算字符个数，列表算元素个数", example: 'n = len("hello")  # 结果是 5',
    params: [{ name: "obj", desc: "字符串 / 列表 / 字典等" }] },
  { label: "range", sig: "range(start, stop, step)", desc: "生成整数序列，配合 for 循环使用", example: "for i in range(1, 10, 2):",
    params: [
      { name: "start", desc: "起始数，可省略（默认 0）" },
      { name: "stop", desc: "结束数（注意：不包含它本身）" },
      { name: "step", desc: "步长，可省略（默认 1）" },
    ] },
  { label: "int", sig: "int(x)", desc: "把整数样子的字符串或小数转成整数", example: 'age = int(input("年龄："))',
    params: [{ name: "x", desc: '要转换的值，如 "18"、3.9' }] },
  { label: "float", sig: "float(x)", desc: "转成小数", example: 'h = float("1.75")',
    params: [{ name: "x", desc: "要转换的值" }] },
  { label: "str", sig: "str(x)", desc: "转成字符串（和数字拼接前常要用它）", example: 'print("成绩：" + str(95))',
    params: [{ name: "x", desc: "要转换的值" }] },
  { label: "bool", sig: "bool(x)", desc: "转成 True / False", example: "bool(0)  # False",
    params: [{ name: "x", desc: "要转换的值" }] },
  { label: "list", sig: "list(iterable)", desc: "转成列表，或复制一份列表", example: 'chars = list("abc")',
    params: [{ name: "iterable", desc: "字符串 / 元组等可遍历对象，可省略" }] },
  { label: "dict", sig: "dict()", desc: "新建一个空字典", example: 'd = dict()', params: [] },
  { label: "sum", sig: "sum(iterable)", desc: "求列表里所有数之和", example: "total = sum([1, 2, 3])  # 6",
    params: [{ name: "iterable", desc: "由数字组成的列表 / 元组" }] },
  { label: "max", sig: "max(iterable)", desc: "求最大值", example: "m = max([3, 9, 5])  # 9",
    params: [{ name: "iterable", desc: "一组数字或字符串" }] },
  { label: "min", sig: "min(iterable)", desc: "求最小值", example: "m = min([3, 9, 5])  # 3",
    params: [{ name: "iterable", desc: "一组数字或字符串" }] },
  { label: "abs", sig: "abs(x)", desc: "求绝对值", example: "abs(-5)  # 5",
    params: [{ name: "x", desc: "一个数字" }] },
  { label: "round", sig: "round(x, n)", desc: "四舍五入，n 是保留的小数位数", example: "round(3.14159, 2)  # 3.14",
    params: [
      { name: "x", desc: "要四舍五入的数" },
      { name: "n", desc: "保留几位小数，可省略（默认取整）" },
    ] },
  { label: "sorted", sig: "sorted(iterable)", desc: "排序后返回新列表（原列表不变）", example: "sorted([3, 1, 2])  # [1, 2, 3]",
    params: [{ name: "iterable", desc: "列表 / 字符串等" }] },
  { label: "enumerate", sig: "enumerate(iterable)", desc: "遍历时同时拿到序号和值", example: "for i, v in enumerate(lst):",
    params: [{ name: "iterable", desc: "要遍历的列表 / 字符串" }] },
  { label: "zip", sig: "zip(a, b)", desc: "把两个列表配对并行遍历", example: "for x, y in zip(a, b):",
    params: [
      { name: "a", desc: "第一个列表" },
      { name: "b", desc: "第二个列表" },
    ] },
  { label: "type", sig: "type(x)", desc: "查看值属于什么类型", example: "type(3)  # <class 'int'>",
    params: [{ name: "x", desc: "任意值" }] },
  { label: "append", sig: "list.append(x)", desc: "往列表末尾追加一个元素", example: 'lst.append("apple")',
    params: [{ name: "x", desc: "要加进列表的元素" }] },
  { label: "split", sig: "str.split(sep)", desc: "按分隔符把字符串拆成列表", example: 'parts = "a,b,c".split(",")',
    params: [{ name: "sep", desc: "分隔符，可省略（默认按空白拆）" }] },
  { label: "join", sig: "str.join(iterable)", desc: "把列表用指定字符拼成一个字符串", example: 's = ",".join(["a", "b"])',
    params: [{ name: "iterable", desc: "由字符串组成的列表" }] },
  { label: "replace", sig: "str.replace(old, new)", desc: "把字符串里的 old 换成 new", example: '"a.b".replace(".", "-")',
    params: [
      { name: "old", desc: "要被替换的内容" },
      { name: "new", desc: "替换成的内容" },
    ] },
  { label: "strip", sig: "str.strip()", desc: "去掉字符串两端的空白（含换行）", example: 'name = input().strip()',
    params: [] },
];
export const PY_FN_MAP = new Map(PY_FN.map((f) => [f.label, f]));

// ── 中文全角符号检测（学生中文输入法下最高频的坑）──
// 只在「语法/符号类」报错上启用，并跳过字符串内部与 # 注释之后，避免误报。
export const FW_ASCII = {
  "“": '"', "”": '"', "‘": "'", "’": "'",
  "（": "(", "）": ")", "【": "[", "】": "]", "［": "[", "］": "]", "｛": "{", "｝": "}",
  "，": ",", "。": ".", "：": ":", "；": ";", "！": "!", "？": "?",
  "＜": "<", "＞": ">", "＝": "=", "＋": "+", "－": "-", "＊": "*", "／": "/", "＼": "\\",
  "　": "空格", "、": "、",
};
export const FW_RE = /[“”‘’（）【】［］｛｝，。：；！？＜＞＝＋－＊／＼　、]/;
export const SYNTAX_LIKE = /unterminated|not closed|Expected|Invalid syntax|Unexpected|value is unused/i;

// 找出该行里第一个「不在注释后」的全角符号（默认跳过字符串内部）
// lenient=true（引号没闭合类报错）：字符串内部的全角符号也一并怀疑 ——
// 学生打 input("2”) 时，那个 ” 正好落在 ASCII 引号开出来的"字符串"里，
// 严格模式会漏掉，而这恰恰就是病根。
export function firstFW(lineText, lenient) {
  let quote = null;
  let esc = false;
  for (const c of lineText) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (quote) {
      if (lenient && FW_RE.test(c)) return c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "#") return null; // 注释之后不再管
    if (FW_RE.test(c)) return c;
  }
  return null;
}

// 实时全角扫描（不等 Pyright 的防抖，边打边标）
// 返回该行所有可疑全角符号 [{ i: 字符下标, c: 字符 }]。
export function scanFWLine(lineText) {
  const hits = [];
  let quote = null;
  let esc = false;
  for (let i = 0; i < lineText.length; i++) {
    const c = lineText[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (quote) {
      if (/[“”‘’]/.test(c)) hits.push({ i, c }); // 串内全角引号 → 报
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "#") break; // 注释之后不再管
    if (FW_RE.test(c)) hits.push({ i, c });
  }
  return hits;
}

// ── Pyright 英文诊断 → 中文。手工白名单：命中才翻译，没命中原样英文透传。
// 顺序＝优先级，特化规则必须排在泛化规则之前。
// ⚠️ Pyright 改版会改措辞（老版 "Cannot access attribute"，新版 "Cannot access member"），规则两种都接。
export function friendlyType(t) {
  if (!t) return t;
  let s = String(t).trim();
  s = s
    .replace(/^Literal\[(\d+)\]$/, "整数 $1")
    .replace(/^Literal\[(['"])(.*?)\1\]$/, "字符串 $2")
    .replace(/^Literal\[(True|False)\]$/, "布尔值")
    .replace(/^Literal\[None\]$/, "None")
    .replace(/^NoneType$/, "None");
  const SIMPLE = {
    str: "字符串", int: "整数", float: "小数", bool: "布尔值", list: "列表", dict: "字典",
    tuple: "元组", set: "集合", object: "对象", None: "None", complex: "复数", bytes: "字节串",
  };
  if (SIMPLE[s]) return SIMPLE[s];
  const m = s.match(/^(list|dict|tuple|set)\[(.+)\]$/);
  if (m) return (SIMPLE[m[1]] || m[1]) + "[" + m[2].split(",").map((x) => friendlyType(x.trim())).join("、") + "]";
  return s;
}
// ── 中文诊断白名单（带档位 tier + 粒度 gran + 可选改法 fix）──
// 顺序＝优先级；每条约 [正则, 中文fn, tier, gran, fix?]：
//   tier: sym 符号(金) / syn 语法(橙) / typ 类型(红) / nam 名字(紫) / oth 其他(灰)
//   gran: token 涂块(色块+波浪线) / expr 只画线(波浪线)
//   fix:  「改法」一句话（字符串或 fn(m)=>字符串）；缺省回退 TIER_SUG[tier]
export const PYR_ERR_CN = [
  // ── 类型不兼容（红 / 多数只画线）──
  [/Operator "(.)" not supported for types "(.+?)" and "(.+?)"/, (m) => "两边类型不一样：" + friendlyType(m[2]) + " 和 " + friendlyType(m[3]) + " 不能做 " + m[1] + " 运算", "typ", "expr", () => "把其中一边转成相同类型再算（比如 str() / int()）"],
  [/Operator "(.)" not supported for/, (m) => "这个类型的值不能做 " + m[1] + " 运算", "typ", "expr", () => "检查这个值的类型，换成支持的类型再算"],
  [/Type "(.+?)" is not assignable to type "(.+?)"/, (m) => "类型不对：" + friendlyType(m[1]) + " 不能当成 " + friendlyType(m[2]) + " 用", "typ", "expr", (m) => "把 " + friendlyType(m[1]) + " 转换成 " + friendlyType(m[2]) + "（比如 str() / int()）"],
  [/Argument of type "(.+?)" cannot be assigned to parameter "(.+?)" of type "(.+?)"/, (m) => "参数「" + m[2] + "」类型不对：要 " + friendlyType(m[3]) + "，给的是 " + friendlyType(m[1]), "typ", "token", (m) => "把这个参数转成 " + friendlyType(m[3]) + " 再传"],
  [/Argument of type "(.+?)" cannot be assigned to parameter/, (m) => "参数类型不对：给的是 " + friendlyType(m[1]), "typ", "token", () => "按函数要求转换参数类型"],
  [/Expression of type "(.+?)" is incompatible with declared type "(.+?)"/, (m) => "类型不匹配：声明的是 " + friendlyType(m[2]) + "，赋的是 " + friendlyType(m[1]), "typ", "expr", () => "让赋的值和声明的类型一致"],
  [/Type "(.+?)" is not assignable to return type "(.+?)"/, (m) => "返回值类型不对：函数声明返回 " + friendlyType(m[2]) + "，实际是 " + friendlyType(m[1]), "typ", "expr", () => "让 return 的值和声明的返回类型一致"],
  [/Return type "(.+?)" is not assignable to return type "(.+?)"/, (m) => "返回值类型不对：函数声明返回 " + friendlyType(m[2]) + "，实际是 " + friendlyType(m[1]), "typ", "expr", () => "让 return 的值和声明的返回类型一致"],
  [/No overloads for "(.+?)" match/, () => "参数对不上：没有能匹配这个用法的版本", "typ", "expr", () => "对照函数定义，检查参数个数和类型"],
  // ── 名字 / 属性（紫 / 涂块）──
  [/"(.+?)" is not defined/, (m) => "「" + m[1] + "」没有定义（拼写错了？或者还没赋值）", "nam", "token", (m) => "检查「" + m[1] + "」的拼写，或在使用前先给它赋值"],
  [/"(.+?)" is unbound/, (m) => "「" + m[1] + "」还没有赋值", "nam", "token", (m) => "先给「" + m[1] + "」赋一个值，再使用它"],
  [/Cannot access (?:attribute|member) "(.+?)" for (?:class|type|module) "(.+?)"/, (m) => friendlyType(m[2]) + " 没有「" + m[1] + "」这个东西（名字写错，或这个类型不支持）", "nam", "token", (m) => "检查点后面的「" + m[1] + "」是否写对，或这个类型是否支持"],
  [/Cannot access (?:attribute|member) "(.+?)" for/, (m) => "没有「" + m[1] + "」这个东西", "nam", "token", (m) => "检查「" + m[1] + "」的拼写是否正确"],
  [/"(.+?)" is not a known attribute of module "(.+?)"/, (m) => "模块 " + m[2] + " 里没有「" + m[1] + "」", "nam", "token", (m) => "检查「" + m[1] + "」的拼写"],
  [/"(.+?)" is not subscriptable/, (m) => m[1] + " 这种类型不能用 [] 取下标", "typ", "expr", () => "确认这个变量是不是列表 / 字符串"],
  [/"(.+?)" is not iterable/, (m) => m[1] + " 这种类型不能用 for 逐个遍历", "typ", "expr", () => "确认这个变量是不是列表 / 字符串等可遍历类型"],
  [/"(.+?)" is not callable/, (m) => m[1] + " 不能当函数来调用（是不是漏了点号或括号？）", "typ", "expr", () => "检查是否漏了点号，或把变量误当成了函数"],
  // ── 调用参数（红，按 P0 §1 归类型档）──
  [/Argument missing for parameter "(.+?)"/, (m) => "调用时少传了参数「" + m[1] + "」", "typ", "expr", (m) => "补上参数「" + m[1] + "」"],
  [/Expected (\d+) positional arguments? but received (\d+)/, (m) => "参数个数不对：要 " + m[1] + " 个，给了 " + m[2] + " 个", "typ", "expr", (m) => "按函数定义传够 " + m[1] + " 个参数"],
  [/Expected (\d+) positional arguments?/, (m) => "参数个数不对：应该传 " + m[1] + " 个", "typ", "expr", (m) => "按函数定义传够 " + m[1] + " 个参数"],
  [/No parameter named "(.+?)"/, (m) => "这个函数没有名为「" + m[1] + "」的参数", "typ", "expr", (m) => "检查参数名「" + m[1] + "」的拼写"],
  [/"(.+?)" is a keyword-only parameter/, (m) => "参数「" + m[1] + "」只能用 名字=值 的形式传", "typ", "expr", (m) => "写成 " + m[1] + "=值 的形式再传"],
  // ── 语法 / 符号（学生中文输入法打全角符号最常落在这一类）──
  [/String literal is unterminated/, () => "字符串的引号没有闭合（少了一个 \" ，或用了中文引号 “ ”）", "sym", "expr", () => "在字符串结尾补一个英文引号 \""],
  [/"(.+?)" was not closed/, (m) => "「" + m[1] + "」没有闭合（少了一个 " + ({ "(": ")", "[": "]", "{": "}" }[m[1]] || "配对符号") + "）", "sym", "expr", (m) => "在句尾补上配对的 " + ({ "(": ")", "[": "]", "{": "}" }[m[1]] || "符号")],
  [/was not closed/, () => "括号没有闭合", "sym", "expr", () => "从左往右数一遍括号，补上缺的那个"],
  [/Expected .* but received/, (m) => "语法不完整：" + m[0].slice(0, 60), "syn", "expr", () => "检查括号、引号是否成对，语句是否写完整"],
  [/Invalid syntax|Unexpected /, (m) => "语法错误：" + m[0].slice(0, 60), "syn", "expr", () => "检查标点是否为英文半角，语句是否写完整"],
  [/is not allowed outside of (a )?(loop|function|class)/, () => "这句只能写在循环 / 函数里面", "syn", "expr", () => "把这句缩进到循环 / 函数内部"],
  [/Duplicate parameter name/, () => "函数参数的名字重复了", "syn", "expr", () => "把重复的参数改名"],
  // ── 导入（灰）──
  [/Import "(.+?)" could not be resolved/, () => "这个模块在浏览器里用不了（课堂环境只支持 Python 标准库）", "oth", "expr", () => "换成 Python 标准库模块（如 random / math / turtle）"],
  [/Could not find implementation or library stub for module named "(.+?)"/, (m) => "找不到模块「" + m[1] + "」的代码文件", "oth", "expr", () => "检查模块名拼写，或换成标准库模块"],
  // ── 其他（灰 / 多为提示级）──
  [/Expression value is unused/, () => "这句写完整了但结果没用上（是不是想 print() 出来，或者忘了赋值给变量？）", "oth", "expr", () => "用 print() 打印结果，或赋值给一个变量"],
  [/is not accessed/, () => "这个变量定义了但没被用到", "oth", "expr", () => "使用这个变量，或删掉这行"],
  [/is obscured by a declaration of the same name/, () => "这个名字被后面的同名定义覆盖了", "oth", "expr", () => "给两个同名的东西改成不同的名字"],
  [/Expression is not allowed in this context|is not allowed here/, () => "这句不能写在这个位置", "oth", "expr", () => "挪到合适的位置（如函数 / 循环内部）"],
  [/Indent/, () => "缩进有问题（Python 靠缩进划分代码块）", "oth", "expr", () => "统一用 4 个空格缩进，别混 Tab"],
  [/Type annotation is not allowed/, () => "这里不能写类型标注", "oth", "expr", () => "删掉这里的类型标注"],
  [/No return value expected|Expected a return value/, () => "有没有返回值对不上（函数该不该 return）", "oth", "expr", () => "检查函数该不该 return、return 写没写值"],
  [/must return value on all code paths/, () => "有些分支没有 return，函数可能返回 None", "oth", "expr", () => "给每个分支都补上 return"],
];

// 单条规则匹配：返回 { cn, tier, gran, fix }（按优先级取第一条命中）。
export function matchPyRule(msg) {
  if (!msg) return null;
  for (const [re, fn, tier, gran, fix] of PYR_ERR_CN) {
    const m = msg.match(re);
    if (m) return { cn: fn(m), tier, gran, fix: typeof fix === "function" ? fix(m) : fix };
  }
  return null;
}

export function pyrCnMsg(msg) {
  const r = matchPyRule(msg);
  return r ? r.cn : msg; // 未命中白名单 → 原样英文透传
}

// 档位抬头 + 建议文案（问题卡片 / hover 徽标共用）
export const TIER_LABEL = { sym: "符号", syn: "语法", typ: "类型", nam: "名字", oth: "其他" };
export const TIER_SUG = {
  sym: "把输入法切回英文，重打这句里的符号。",
  nam: "检查名字是否拼写错误，或是否忘了先赋值 / 导入。",
  typ: "核对两边的数据类型是否一致（例如整数和字符串不能直接相加）。",
  syn: "检查括号、引号是否成对，语句是否写完整。",
  oth: "",
};

// 诊断 → 档位（符号优先：只要该行命中全角符号即符号档；否则按规则；未命中归其他）
export function classifyDiag(message, severity, hasFw) {
  if (hasFw) return { tier: "sym", gran: "token" };
  const r = matchPyRule(message);
  if (r) return { tier: r.tier, gran: r.gran };
  return { tier: "oth", gran: "expr" };
}

// 诊断 → 中文（含中文全角符号定位）。返回 { cn, hasFw, fwCh, lineNo }。
export function cnDiagEx(doc, from, message, sev) {
  const base = pyrCnMsg(message);
  try {
    const line = doc.lineAt(Math.min(Math.max(0, from), doc.length));
    const unterminated = /unterminated|not closed/i.test(message);
    if (SYNTAX_LIKE.test(message) || sev === 1) {
      const fw = firstFW(line.text, unterminated);
      if (fw) {
        const ascii = FW_ASCII[fw];
        const tip =
          "第 " + line.number + " 行混进了中文符号「" + fw + "」" +
          (ascii && ascii !== "、" ? "，代码里要写成英文的「" + ascii + "」；" : "，代码里的符号都要用英文半角；") +
          "把输入法切回英文再打一遍。";
        return { cn: tip + "\n" + base, hasFw: true, fwCh: fw, lineNo: line.number };
      }
    }
  } catch (e) {
    /* 忽略越界等异常，回退 base */
  }
  return { cn: base, hasFw: false, fwCh: null, lineNo: null };
}

// ── hover 弹窗要素（D 为主 C 兜底，弹窗内不出现英文）──
// 返回 { tier, short, fix, demo }：
//   short: 一句诊断（弹窗第一行）；fix: 「改法」一句话（C 兜底行）；
//   demo:  { bad, good } 错→对 对照（D，仅能机械替换的错误）。
// lineText: 该行源码（有全角符号时用它生成整行对照，比单字符更直观）。
export function diagParts(message, hasFw, fwCh, lineText) {
  if (hasFw && fwCh) {
    const ascii = FW_ASCII[fwCh];
    const replaceable = !!ascii && ascii !== "、";
    let demo = null;
    if (replaceable && lineText) {
      // 整行对照：坏句 = 原行（裁到 ≤40 字），好句 = 全角全部换半角
      const line = String(lineText);
      const bad = line.length > 40 ? line.slice(0, 40) : line;
      const good = line.replace(/[“”‘’（）【】［］｛｝，。：；！？＜＞＝＋－＊／＼]/g, (c) => FW_ASCII[c] || c);
      demo = { bad, good: good.length > 40 ? good.slice(0, 40) : good };
    }
    return {
      tier: "sym",
      short: "这里用了中文符号",
      chip: fwCh, // 弹窗里用代码芯片单独展示（不用「」包裹，避免与引号混淆）
      fix: replaceable
        ? "把输入法切回英文，改写成英文半角"
        : "把输入法切回英文，符号都用英文半角再打一遍",
      demo,
    };
  }
  const r = matchPyRule(message);
  if (r) return { tier: r.tier, short: r.cn, fix: r.fix || TIER_SUG[r.tier] || "", demo: null };
  // 未命中白名单（原英文已按决策不进弹窗）→ 灰档 C 兜底
  return { tier: "oth", short: "这里可能有问题", fix: "检查拼写、符号是否为英文半角；详情见下方「问题」面板", demo: null };
}

// 兼容旧调用（仅取中文串）
export function cnDiag(doc, from, message, sev) {
  return cnDiagEx(doc, from, message, sev).cn;
}
