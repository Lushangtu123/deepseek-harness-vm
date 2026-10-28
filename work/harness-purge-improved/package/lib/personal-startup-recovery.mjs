// Runs before the main module, so an asset/import failure cannot leave only a
// blank root. Recovery is always an explicit reload, never an operation replay.
function browserStartupRecovery() {
  const id = 'dsh-startup-recovery'
  const show = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show, { once: true })
      return
    }
    if (document.getElementById(id)) return
    const notice = document.createElement('aside')
    notice.id = id
    notice.setAttribute('role', 'alert')
    notice.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;box-sizing:border-box;max-width:420px;width:calc(100% - 32px);padding:16px;border:1px solid #bd903e;border-radius:10px;background:#fffdf5;color:#29251c;font:14px/1.6 system-ui,sans-serif;box-shadow:0 4px 24px #0002'
    const message = document.createElement('div')
    message.textContent = '页面资源未能完整加载。可以重新加载页面；如果虚拟机刚恢复，请先运行启动入口。'
    notice.appendChild(message)
    if (window.location.origin === 'http://127.0.0.1:49226') {
      const link = document.createElement('a')
      link.href = '/__harness/health'
      link.textContent = '查看本机连接状态'
      link.style.cssText = 'display:block;color:#254e8c'
      notice.appendChild(link)
    }
    for (const [label, action] of [['重新加载页面', () => window.location.reload()], ['关闭提示', () => notice.remove()]]) {
      const button = document.createElement('button')
      button.textContent = label
      button.style.cssText = 'margin:12px 8px 0 0;padding:6px 12px;border:1px solid #85754e;border-radius:6px;background:#fff;color:#29251c;font:inherit;cursor:pointer'
      button.addEventListener('click', action)
      notice.appendChild(button)
    }
    document.body.appendChild(notice)
  }
  window.addEventListener('error', event => {
    const target = event.target
    if (target?.tagName !== 'SCRIPT' && !(target?.tagName === 'LINK' && target.rel === 'stylesheet')) return
    const url = String(target.src || target.href || '')
    if (url.startsWith(window.location.origin + '/assets/') || url.startsWith(window.location.origin + '/plugins/')) show()
  }, true)
  setTimeout(() => {
    const root = document.getElementById('root')
    if (!root || !root.childElementCount) show()
  }, 15000)
}

export function installStartupRecovery(ctx) {
  ctx.on('webserver/index-inject', table => table.unshift({
    kind: 'script', placement: 'head', text: '(' + browserStartupRecovery.toString() + ')()',
  }))
}
