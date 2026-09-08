// dsh-auto-update · Host 半边
// 本文件是 DSH 动态插件的 code.host（一个返回 Cordis Plugin 的函数体）。
// 职责：版本检查、npm install -g 更新、跨平台重启脚本。

return {
  name: 'dsh-auto-update',
  inject: ['timer'],
  apply(ctx) {
    // 依赖 shell 服务执行命令；缺省时插件静默退出（不阻塞加载）
    const shell = ctx.get('shell')
    if (shell === undefined) return

    // —— 可配置项 ——
    const PACKAGE = '@deepseek-ai/dsh'        // dsh 的 npm 包名
    const DIST_TAG = 'latest'                  // 官方发布通道，与 `npm view <pkg> version` 一致
    const CHECK_INTERVAL_MS = 30 * 60 * 1000   // 每 30 分钟检查一次
    const PORT = 3080                          // dsh web 默认端口

    // 插件内部状态：只存标量，绝不存 live Service / 对象
    const state = {
      current: null,   // 当前运行的 dsh 版本
      latest: null,    // 官方最新版本
      phase: 'checking', // checking | idle | installing | installed | error
      error: null,
      os: null,        // 'windows' | 'macos' | 'linux'（检测后缓存）
    }

    // 去掉可能的 v 前缀，便于显示与比较版本号
    const normalizeVersion = (v) => String(v == null ? '' : v).trim().replace(/^v/i, '')
    const firstLine = (text) => String(text || '').split('\n')[0].trim()

    // —— semver 解析与比较：仅当 latest > current 时才判定“有更新”，
    //    避免跨通道 / 预发布导致的“最新版其实更旧”而降级 ——

    function parseVersion(v) {
      const m = normalizeVersion(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
      if (!m) return null
      return {
        major: parseInt(m[1], 10),
        minor: parseInt(m[2], 10),
        patch: parseInt(m[3], 10),
        pre: m[4] ? m[4].split('.') : [],
      }
    }

    function compareIdentifiers(a, b) {
      const an = /^\d+$/.test(a)
      const bn = /^\d+$/.test(b)
      if (an && bn) {
        const d = parseInt(a, 10) - parseInt(b, 10)
        return d === 0 ? 0 : (d < 0 ? -1 : 1)
      }
      if (an !== bn) return an ? -1 : 1 // 纯数字标识符 < 含字母标识符
      return a === b ? 0 : (a < b ? -1 : 1)
    }

    // 返回 -1 / 0 / 1；任一版本无法解析时返回 0（视为相等，不提示更新）
    function compareVersions(a, b) {
      const pa = parseVersion(a)
      const pb = parseVersion(b)
      if (!pa || !pb) return 0
      if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
      if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
      if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1
      if (pa.pre.length === 0 && pb.pre.length === 0) return 0
      if (pa.pre.length === 0) return 1
      if (pb.pre.length === 0) return -1
      const n = Math.max(pa.pre.length, pb.pre.length)
      for (let i = 0; i < n; i++) {
        const x = pa.pre[i]
        const y = pb.pre[i]
        if (x === undefined) return -1
        if (y === undefined) return 1
        const c = compareIdentifiers(x, y)
        if (c !== 0) return c
      }
      return 0
    }

    // 统一执行一条 shell 命令
    async function runCommand(command, timeoutMs) {
      const spec = shell.resolve({ command, timeoutMs: timeoutMs || 60000, stdoutMaxBytes: 256 * 1024 })
      const result = await shell.run(spec)
      return {
        ok: result.exitCode === 0 && !result.timedOut && !result.aborted,
        stdout: (result.stdout && result.stdout.text) || '',
        stderr: (result.stderr && result.stderr.text) || '',
      }
    }

    async function readCurrentVersion() {
      const r = await runCommand('dsh --version', 15000)
      if (!r.ok) throw new Error(r.stderr || 'dsh --version failed')
      return normalizeVersion(firstLine(r.stdout))
    }

    async function readLatestVersion() {
      const r = await runCommand('npm view ' + PACKAGE + ' version', 60000)
      if (!r.ok) throw new Error(r.stderr || 'npm view failed')
      return normalizeVersion(firstLine(r.stdout))
    }

    // 执行一次版本检查；失败不抛错，记录 error 等待下次重试
    async function check() {
      if (state.phase === 'installing') return
      try {
        state.current = await readCurrentVersion()
        state.latest = await readLatestVersion()
        state.phase = 'idle'
        state.error = null
        const up = compareVersions(state.latest, state.current) > 0
        console.log('[dsh-auto-update] 当前 v' + state.current + '，最新 v' + state.latest + (up ? '，有新版本' : '，已是最新'))
      } catch (err) {
        state.phase = 'error'
        state.error = String((err && err.message) || err)
        console.error('[dsh-auto-update] 检查失败: ' + state.error)
      }
    }

    const updateAvailable = () =>
      state.phase === 'idle' &&
      state.latest != null &&
      state.current != null &&
      compareVersions(state.latest, state.current) > 0

    // —— 跨平台重启 ——

    // 用 node 自带的 process.platform 判断操作系统（node 必然存在，因为 dsh 本身运行在 node 上）
    async function ensurePlatform() {
      if (state.os !== null) return state.os
      let os = 'linux'
      try {
        const r = await runCommand('node -p process.platform', 10000)
        const p = firstLine(r.stdout).toLowerCase()
        if (p === 'win32') os = 'windows'
        else if (p === 'darwin') os = 'macos'
        else os = 'linux'
      } catch (_) { os = 'linux' }
      state.os = os
      return os
    }

    // Unix 系（Linux / macOS / 其它 unix）共享的重启脚本主体
    function unixRestartScript() {
      return [
        'port=' + PORT,
        'log_dir="$HOME"',
        'log_file="$log_dir/dsh.log"',
        'mkdir -p "$log_dir"',
        'sleep 2',
        'pid=$(lsof -ti:"$port" 2>/dev/null | head -n1)',
        'if [ -z "$pid" ]; then',
        '  pid=$(fuser "$port"/tcp 2>/dev/null | cut -d: -f2 | tr -d " ")',
        'fi',
        'if [ -n "$pid" ]; then',
        '  echo "[$(date "+%F %T")] killing pid $pid on port $port" >> "$log_file"',
        '  kill $pid 2>/dev/null',
        '  sleep 1',
        '  if kill -0 $pid 2>/dev/null; then',
        '    kill -9 $pid 2>/dev/null',
        '    echo "[$(date "+%F %T")] force killed $pid" >> "$log_file"',
        '  fi',
        'else',
        '  echo "[$(date "+%F %T")] no process on port $port" >> "$log_file"',
        'fi',
        'echo "[$(date "+%F %T")] starting dsh web" >> "$log_file"',
        'nohup dsh web --no-open >> "$log_file" 2>&1 &',
        'echo "dsh restarted, log -> $log_file"',
      ].join('\n')
    }

    // Windows 的重启脚本（PowerShell）：结束监听端口的进程，再以隐藏窗口拉起新的 dsh web
    function windowsRestartScript() {
      return [
        '$ErrorActionPreference="SilentlyContinue"',
        '$port=' + PORT,
        '$log=Join-Path $env:USERPROFILE "dsh.log"',
        'Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] restarting on port " + $port)',
        'Start-Sleep -Seconds 2',
        'Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }',
        'Start-Sleep -Seconds 1',
        'Add-Content -LiteralPath $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] starting dsh web")',
        'Start-Process -FilePath "dsh" -ArgumentList @("web","--no-open") -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError ($log + ".err")',
      ].join('; ')
    }

    // 把字符串编码为 UTF-16LE 的 base64（PowerShell -EncodedCommand 要求），规避一切引号转义
    function toUtf16leBase64(str) {
      let bin = ''
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i)
        bin += String.fromCharCode(code & 0xFF, (code >> 8) & 0xFF)
      }
      return btoa(bin)
    }

    // 根据操作系统类型拼出完整的重启命令
    function buildRestartCommand(os) {
      if (os === 'windows') {
        return 'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + toUtf16leBase64(windowsRestartScript())
      }
      const script = unixRestartScript()
      // Linux 用 setsid 完全脱离父进程组；macOS 没有 setsid，只用 nohup
      const detach = (os === 'macos') ? 'nohup bash -c' : 'nohup setsid bash -c'
      return detach + " '" + script + "' >/dev/null 2>&1 < /dev/null &"
    }

    // —— 供 Client 调用的 RPC ——

    harness.handle('getStatus', async () => ({
      current: state.current,
      latest: state.latest,
      updateAvailable: updateAvailable(),
      phase: state.phase,
      error: state.error,
    }))

    harness.handle('installUpdate', async () => {
      if (state.phase === 'installing') return { ok: false, error: '更新安装已在进行中' }
      state.phase = 'installing'
      state.error = null
      try {
        const r = await runCommand('npm install -g ' + PACKAGE + '@' + DIST_TAG, 10 * 60 * 1000)
        if (!r.ok) throw new Error((r.stderr || 'npm install -g failed').trim())
        state.phase = 'installed'
        try { state.latest = await readLatestVersion() } catch (_) { /* 刷新失败可忽略 */ }
        console.log('[dsh-auto-update] 已安装 v' + state.latest + '，等待重启')
        return { ok: true }
      } catch (err) {
        state.phase = 'idle'
        state.error = String((err && err.message) || err)
        return { ok: false, error: state.error }
      }
    })

    harness.handle('restart', async () => {
      try {
        const os = await ensurePlatform()
        const command = buildRestartCommand(os)
        await runCommand(command, 15000)
        console.log('[dsh-auto-update] 已下发重启指令 (' + os + ')')
        return { ok: true }
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) }
      }
    })

    // 加载时立即检查一次，之后每 30 分钟检查一次；同时预热操作系统类型
    check()
    ensurePlatform()
    ctx.interval(check, CHECK_INTERVAL_MS)
  },
}
