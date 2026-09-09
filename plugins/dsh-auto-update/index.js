/**
 * dsh-auto-update — host half (installable bundle).
 *
 * 职责：版本检查（`dsh --version` / `npm view`）、`npm install -g` 更新、跨平台重启。
 * 通过 web 路由 `/dsh-auto-update/api` 向 browser half 暴露
 * getStatus / installUpdate / restart 三个方法。
 */

export const name = "dsh-auto-update";
export const inject = ["timer", "shell", "webServer"];

const PACKAGE = "@deepseek-ai/dsh";
const DIST_TAG = "latest";
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const PORT = 3080;

// —— 调试开关 ——
// 为 true 时，readCurrentVersion 直接返回一个很老的假版本号（DSH_AUTO_UPDATE_DEBUG_VERSION），
// 从而让 latest > current 恒成立，client.js 始终显示「更新」按钮，便于本地测试整条更新流程。
// 上线前务必改回 false。
const DSH_AUTO_UPDATE_DEBUG = true;
const DSH_AUTO_UPDATE_DEBUG_VERSION = "0.0.1";

// —— semver 解析与比较：仅当 latest > current 才判定“有更新”，避免跨通道/预发布导致降级 ——

function normalizeVersion(v) {
  return String(v == null ? "" : v).trim().replace(/^v/i, "");
}

function parseVersion(v) {
  const m = normalizeVersion(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] ? m[4].split(".") : [],
  };
}

function compareIdentifiers(a, b) {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) {
    const d = parseInt(a, 10) - parseInt(b, 10);
    return d === 0 ? 0 : d < 0 ? -1 : 1;
  }
  if (an !== bn) return an ? -1 : 1; // 纯数字标识符 < 含字母标识符
  return a === b ? 0 : a < b ? -1 : 1;
}

// 返回 -1 / 0 / 1；任一版本无法解析时返回 0（视为相等，不提示更新）
function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = compareIdentifiers(x, y);
    if (c !== 0) return c;
  }
  return 0;
}

// —— 跨平台重启脚本 ——

// 把字符串编码为 UTF-16LE 的 base64（PowerShell -EncodedCommand 要求），规避引号转义
function toUtf16leBase64(str) {
  let bin = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bin += String.fromCharCode(code & 0xff, (code >> 8) & 0xff);
  }
  return btoa(bin);
}

// 把 UTF-8 字符串编码为标准 base64（用于把脚本安全塞进命令行，规避所有引号/转义问题）
function toUtf8Base64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Unix 系（Linux / macOS / 其它 unix）共享的重启脚本主体。
// 关键点（对齐 ~/.zshrc 的 dsh-rs，修复 EADDRINUSE）：
//   1. 只杀真正 LISTEN 3080 的进程，绝不误杀浏览器等仅连到 3080 的客户端；
//   2. LISTEN 进程可能有多个，逐个 kill，不能只 head -n1；
//   3. kill 后轮询等待端口“真正释放”再启动，避免固定 sleep 造成的竞态；
//   4. 优雅 kill 不掉再 kill -9 兜底；确认空闲后才拉起新进程。
// 本脚本由当前 dsh web 进程经 setsid/nohup 脱离后运行，会杀掉派生它的父进程（旧 dsh），
// 因此必须等端口释放后再启动，否则新旧交接期会 address already in use。
function unixRestartScript() {
  return [
    "port=" + PORT,
    'log_dir="$HOME"',
    'log_file="$log_dir/dsh.log"',
    'mkdir -p "$log_dir"',
    "sleep 2",
    // 只取 LISTEN 的 PID（排除浏览器/客户端连接），可能多个
    'listen_pids() { lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null; }',
    'pids=$(listen_pids)',
    'if [ -n "$pids" ]; then',
    '  echo "[$(date "+%F %T")] killing listen pids: $(echo $pids | tr "\\n" " ")on port $port" >> "$log_file"',
    '  for pid in $pids; do kill "$pid" 2>/dev/null; done',
    // 轮询等待端口释放，最多约 10 秒
    "  i=0",
    '  while [ "$i" -lt 20 ]; do',
    '    [ -z "$(listen_pids)" ] && break',
    "    sleep 0.5",
    "    i=$((i+1))",
    "  done",
    // 仍占用则强杀，再等一轮
    '  pids=$(listen_pids)',
    '  if [ -n "$pids" ]; then',
    '    echo "[$(date "+%F %T")] force killing: $(echo $pids | tr "\\n" " ")" >> "$log_file"',
    '    for pid in $pids; do kill -9 "$pid" 2>/dev/null; done',
    "    i=0",
    '    while [ "$i" -lt 20 ]; do',
    '      [ -z "$(listen_pids)" ] && break',
    "      sleep 0.5",
    "      i=$((i+1))",
    "    done",
    "  fi",
    "else",
    '  echo "[$(date "+%F %T")] no listening process on port $port" >> "$log_file"',
    "fi",
    // 端口确实空闲后再启动，避免 EADDRINUSE 竞态
    'if [ -n "$(listen_pids)" ]; then',
    '  echo "[$(date "+%F %T")] port $port still in use, aborting start" >> "$log_file"',
    "  exit 1",
    "fi",
    'echo "[$(date "+%F %T")] starting dsh web" >> "$log_file"',
    'nohup dsh web --no-open >> "$log_file" 2>&1 &',
    'echo "dsh restarted, log -> $log_file"',
  ].join("\n");
}

// Windows 的重启脚本（PowerShell）：结束监听端口的进程，再以隐藏窗口拉起新的 dsh web
function windowsRestartScript() {
  return [
    '$ErrorActionPreference="SilentlyContinue"',
    "$port=" + PORT,
    '$log=Join-Path $env:USERPROFILE "dsh.log"',
    'Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] restarting on port " + $port)',
    "Start-Sleep -Seconds 2",
    // 只结束真正 LISTEN 端口的进程（可能多个），不误伤浏览器等客户端连接
    "Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
    // 轮询等待端口“真正释放”再启动，最多约 10 秒，避免固定 sleep 造成的 EADDRINUSE 竞态
    "$i=0",
    "while ($i -lt 20) { if (-not (Get-NetTCPConnection -LocalPort $port -State Listen)) { break }; Start-Sleep -Milliseconds 500; $i++ }",
    // 端口仍被占用则放弃启动，避免报 address already in use
    'if (Get-NetTCPConnection -LocalPort $port -State Listen) { Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] port " + $port + " still in use, aborting start"); exit 1 }',
    'Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] starting dsh web")',
    'Start-Process -FilePath "dsh" -ArgumentList @("web","--no-open") -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError ($log + ".err")',
  ].join("; ");
}

// 根据操作系统类型拼出完整的重启命令
function buildRestartCommand(os) {
  if (os === "windows") {
    return "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand " + toUtf16leBase64(windowsRestartScript());
  }

  // —— Unix（macOS / Linux / 其它）——
  // 关键：重启脚本会杀掉派生它的父进程（当前 dsh），而 dsh 的 subprocess 后端在销毁时会对
  // 它派生的整棵子进程树发 SIGKILL。若脚本没有真正脱离 dsh 的会话/进程组，就会在 kill 掉
  // dsh 之后被“连坐”杀死（表现为：日志停在 killing，之后再没有 starting）。
  // macOS 没有 setsid，因此统一用系统自带的 perl 调 POSIX::setsid 新建会话来彻底脱离：
  //   - fork 后父端立即退出 → ctx.shell.run 秒级返回，dsh 不会再 tree-kill 这个已独立的会话；
  //   - 子端 setsid() 脱离控制终端与进程组，再 exec bash 执行真正的重启脚本；
  //   - 脚本内容用 base64 传递，规避一切引号/转义问题。
  const scriptB64 = toUtf8Base64(unixRestartScript());
  // perl 单行程序：解码 base64 脚本 → fork（父端立即退出）→ 子端 setsid 脱离 → 用独立 bash 执行脚本。
  // 注意：整段 perl 程序会被外层单引号 '...' 包裹传给 shell，所以程序体内不能出现任何单引号，
  // 字符串一律用 perl 的 q{...} 定界（等价单引号字符串，但用花括号，规避引号冲突）。
  const perlProgram =
    "use POSIX ();" +
    "use MIME::Base64 ();" +
    "my $s = MIME::Base64::decode_base64($ARGV[0]);" +
    "exit 0 if fork();" +                 // 父端立即退出，命令快速返回
    "POSIX::setsid();" +                  // 子端新建会话，彻底脱离 dsh 的进程组/控制终端
    "open(STDIN, q{<}, q{/dev/null});" +
    "open(STDOUT, q{>}, q{/dev/null});" +
    "open(STDERR, q{>}, q{/dev/null});" +
    "exec(q{bash}, q{-c}, $s);";          // 直接 exec bash 执行脚本，无需管道

  // 用单引号包裹 perl 程序（程序体内已无单引号），base64 作为参数（只含 [A-Za-z0-9+/=]，安全）
  return "perl -e '" + perlProgram + "' '" + scriptB64 + "' </dev/null >/dev/null 2>&1 &";
}

// —— HTTP 小工具 ——

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

export function apply(ctx) {
  const state = {
    current: null,
    latest: null,
    phase: "checking", // checking | idle | installing | installed | error
    error: null,
    os: null, // 'windows' | 'macos' | 'linux'
  };

  async function runCommand(command, timeoutMs) {
    const spec = ctx.shell.resolve({ command, timeoutMs: timeoutMs || 60000, stdoutMaxBytes: 256 * 1024 });
    const result = await ctx.shell.run(spec);
    return {
      ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
      stdout: (result.stdout && result.stdout.text) || "",
      stderr: (result.stderr && result.stderr.text) || "",
    };
  }

  const firstLine = (text) => String(text || "").split("\n")[0].trim();

  async function readCurrentVersion() {
    // 调试模式：返回一个很老的假版本号，骗过 client.js 以显示「更新」按钮
    if (DSH_AUTO_UPDATE_DEBUG) {
      console.log("[dsh-auto-update] DEBUG 模式：当前版本伪造为 v" + DSH_AUTO_UPDATE_DEBUG_VERSION);
      return normalizeVersion(DSH_AUTO_UPDATE_DEBUG_VERSION);
    }
    const r = await runCommand("dsh --version", 15000);
    if (!r.ok) throw new Error(r.stderr || "dsh --version failed");
    return normalizeVersion(firstLine(r.stdout));
  }

  async function readLatestVersion() {
    const r = await runCommand("npm view " + PACKAGE + " version", 60000);
    if (!r.ok) throw new Error(r.stderr || "npm view failed");
    return normalizeVersion(firstLine(r.stdout));
  }

  async function check() {
    if (state.phase === "installing") return;
    try {
      state.current = await readCurrentVersion();
      state.latest = await readLatestVersion();
      state.phase = "idle";
      state.error = null;
      const up = compareVersions(state.latest, state.current) > 0;
      console.log("[dsh-auto-update] 当前 v" + state.current + "，最新 v" + state.latest + (up ? "，有新版本" : "，已是最新"));
    } catch (err) {
      state.phase = "error";
      state.error = String((err && err.message) || err);
      console.error("[dsh-auto-update] 检查失败: " + state.error);
    }
  }

  // 用 node 自带的 process.platform 判断操作系统（node 必然存在，因为 dsh 本身运行在 node 上）
  async function ensurePlatform() {
    if (state.os !== null) return state.os;
    let os = "linux";
    try {
      const r = await runCommand("node -p process.platform", 10000);
      const p = firstLine(r.stdout).toLowerCase();
      if (p === "win32") os = "windows";
      else if (p === "darwin") os = "macos";
      else os = "linux";
    } catch (_) {
      os = "linux";
    }
    state.os = os;
    return os;
  }

  const updateAvailable = () =>
    state.phase === "idle" &&
    state.latest != null &&
    state.current != null &&
    compareVersions(state.latest, state.current) > 0;

  const getStatus = () => ({
    current: state.current,
    latest: state.latest,
    updateAvailable: updateAvailable(),
    phase: state.phase,
    error: state.error,
  });

  async function installUpdate() {
    if (state.phase === "installing") return { ok: false, error: "更新安装已在进行中" };
    state.phase = "installing";
    state.error = null;
    try {
      const r = await runCommand("npm install -g " + PACKAGE + "@" + DIST_TAG, 10 * 60 * 1000);
      if (!r.ok) throw new Error((r.stderr || "npm install -g failed").trim());
      state.phase = "installed";
      try {
        state.latest = await readLatestVersion();
      } catch (_) {
        /* 刷新失败可忽略 */
      }
      console.log("[dsh-auto-update] 已安装 v" + state.latest + "，等待重启");
      return { ok: true };
    } catch (err) {
      state.phase = "idle";
      state.error = String((err && err.message) || err);
      return { ok: false, error: state.error };
    }
  }

  async function restart() {
    try {
      const os = await ensurePlatform();
      const command = buildRestartCommand(os);
      await runCommand(command, 15000);
      console.log("[dsh-auto-update] 已下发重启指令 (" + os + ")");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  // —— 供 browser half 调用的 RPC 路由 ——
  ctx.webServer.register({
    kind: "exact",
    path: "/dsh-auto-update/api",
    handler: async (req, res) => {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method not allowed" });
      const body = await readBody(req);
      let result;
      if (body.method === "getStatus") result = getStatus();
      else if (body.method === "installUpdate") result = await installUpdate();
      else if (body.method === "restart") result = await restart();
      else result = { ok: false, error: "unknown method: " + body.method };
      sendJson(res, 200, result);
    },
  });

  // 加载时立即检查一次，之后每 30 分钟检查一次；同时预热操作系统类型
  check();
  ensurePlatform();
  ctx.interval(check, CHECK_INTERVAL_MS);
}
