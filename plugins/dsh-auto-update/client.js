// dsh-auto-update — browser half (installable bundle).
//
// 由 dsh-client-modules 以 classic script 形式在 /plugins/dsh-auto-update/client.js
// 加载，并通过 vendored cordis Loader 的 lazy-CJS 模块表执行 window.__ModuleLoader__.load。
// 工厂体是纯 CJS，require() 解析到 shell 的模块表（平台 seed 词 + 已注册的 client bundle）。

// 注册 id 必须等于完整 npm 包名：client-modules 用启动图行 id（即包名）
// 去 factories 表里查工厂，注册用裸名会导致 "loaded without registering
// @just-ai/dsh-auto-update via __ModuleLoader__.load" 而无法装载。
window.__ModuleLoader__.load({
  id: "@just-ai/dsh-auto-update",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var POLL_INTERVAL_MS = 10000;

    // 官方“设置”齿轮图标的 SVG 路径（与 ui-settings-general 一致，填充 currentColor）
    var GEAR_PATH =
      "M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z";
    var GEAR_HOLE_PATH =
      "M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z";

    function SettingsIcon(size) {
      return React.createElement(
        "svg",
        { width: size || 16, height: size || 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
        React.createElement("path", { d: GEAR_PATH, fill: "currentColor" }),
        React.createElement("path", { d: GEAR_HOLE_PATH, fill: "currentColor" }),
      );
    }

    // 包内样式：灰色小号版本号 + 蓝底黑字按钮 + 加载 spinner
    var CSS = [
      ".dsh-au-right{display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;white-space:nowrap}",
      ".dsh-au-label{white-space:nowrap}",
      ".dsh-au-version{font-size:11px;color:#9aa0a6;line-height:1;white-space:nowrap}",
      ".dsh-au-btn{display:inline-flex;align-items:center;justify-content:center;height:22px;padding:0 8px;border:none;border-radius:11px;background:#2f6bff;color:#000;font-size:12px;line-height:1;cursor:pointer;flex-shrink:0;white-space:nowrap}",
      ".dsh-au-btn:disabled{opacity:.85;cursor:default}",
      ".dsh-au-spinner{width:12px;height:12px;border:2px solid rgba(0,0,0,.25);border-top-color:#000;border-radius:50%;animation:dsh-au-spin .7s linear infinite}",
      "@keyframes dsh-au-spin{to{transform:rotate(360deg)}}",
    ].join("\n");

    if (typeof document !== "undefined") {
      var styleEl = document.createElement("style");
      styleEl.dataset.plugin = "dsh-auto-update";
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    }

    // 调用 host 的 RPC 路由
    function callHost(method) {
      return fetch("/dsh-auto-update/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: method }),
      }).then(function (r) {
        return r.json();
      });
    }

    function apply(ctx) {
      // 渲染进“设置”按钮内部：齿轮图标 + “设置”标签靠左，版本号 +（有更新时）更新按钮靠右
      function TriggerContent(props) {
        var wide = props.wide;
        var t = props.t;

        var statusState = React.useState({ current: null, latest: null, updateAvailable: false, phase: "checking", error: null });
        var status = statusState[0];
        var setStatus = statusState[1];
        var busyState = React.useState(false);
        var busy = busyState[0];
        var setBusy = busyState[1];

        function refresh() {
          callHost("getStatus")
            .then(setStatus)
            .catch(function () {
              /* 忽略单次 RPC 失败 */
            });
        }

        React.useEffect(function () {
          refresh();
          return ctx.interval(refresh, POLL_INTERVAL_MS);
        }, []);

        // 点「更新」= 一步到位：安装最新版并在成功后自动重启，无需再点第二次。
        function onUpdate(e) {
          if (e && e.stopPropagation) {
            e.stopPropagation();
            e.preventDefault();
          }
          setBusy(true);
          callHost("updateAndRestart")
            .then(function (res) {
              // 安装失败（未重启）时才结束 busy 让用户重试；
              // 成功时进程即将重启，保持 spinner 直到页面因重启而断开（此响应可能收不到）。
              if (!res || !res.ok) {
                refresh();
                setBusy(false);
              }
            })
            .catch(function () {
              // 请求中断很可能是重启已生效导致连接断开：保持 spinner，页面重启后会自然恢复
            });
        }

        // 窄栏（折叠态）：只显示齿轮图标，不显示文字/按钮
        if (!wide) return SettingsIcon(18);

        var current = status.current;
        var phase = status.phase;
        // 进行中：安装中 / 安装完成待重启 / 重启中，统一显示 spinner。
        // 「更新」按钮已经把「更新 + 重启」一并完成，因此不再有独立的「重启」按钮。
        var installing =
          phase === "installing" ||
          phase === "installed" ||
          phase === "restarting" ||
          busy;
        var showUpdate = phase === "idle" && status.updateAvailable && !busy;

        var button = null;
        if (installing) {
          button = React.createElement(
            "button",
            { type: "button", className: "dsh-au-btn", disabled: true, "aria-label": "更新中" },
            React.createElement("span", { className: "dsh-au-spinner" }),
          );
        } else if (showUpdate) {
          button = React.createElement("button", { type: "button", className: "dsh-au-btn", onClick: onUpdate }, "更新");
        }

        var label = typeof t === "function" ? t("trigger") : "设置";
        var tip = status.error ? "检查失败: " + status.error : status.latest ? "最新版: " + status.latest : "";

        return React.createElement(
          React.Fragment,
          null,
          SettingsIcon(16),
          React.createElement("span", { className: "dsh-au-label" }, label),
          React.createElement(
            "span",
            { className: "dsh-au-right", title: tip },
            React.createElement("span", { className: "dsh-au-version" }, current || "…"),
            button,
          ),
        );
      }

      // 注册到 settings.trigger（“设置”按钮内容插槽），locale 沿用官方 settings 命名空间以拿到 t()。
      // settings.trigger 是 single 插槽且已被官方 UI（ui-settings-general, priority 0）占用；
      // single 插槽的遮蔽规则是「priority 数值最低者渲染」，所以要用比 0 更低的负 priority 才能覆盖官方。
      ctx.slots.inject("settings.trigger", function () {
        return ctx.slots.register({ name: "settings.trigger", locale: "settings", priority: -100 }, TriggerContent);
      });
    }

    exports.name = "dsh-auto-update";
    exports.inject = ["slots", "timer"];
    exports.apply = apply;
    return module.exports;
  },
});
