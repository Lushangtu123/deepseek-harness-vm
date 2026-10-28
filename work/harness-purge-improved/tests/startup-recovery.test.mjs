import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const url = new URL('../package/lib/personal-startup-recovery.mjs', import.meta.url)
const recovery = fs.existsSync(url) ? await import(url) : { installStartupRecovery() {} }

function fixture(mounted = false) {
  let hook
  recovery.installStartupRecovery({ on(name, handler) { assert.equal(name, 'webserver/index-inject'); hook = handler } })
  assert.equal(typeof hook, 'function', 'Startup recovery must register an index injection')
  const table = [{ kind: 'script', text: 'main module' }]
  hook(table)
  assert.equal(table[0].placement, 'head')
  const listeners = {}, timers = [], elements = []
  let reloads = 0
  function element(tag) {
    return { tagName: tag.toUpperCase(), style: {}, children: [],
      setAttribute(name, value) { this[name] = value },
      appendChild(child) { this.children.push(child); elements.push(child) },
      addEventListener(name, fn) { this[name] = fn },
      remove() { elements.splice(elements.indexOf(this), 1) } }
  }
  const root = { childElementCount: mounted ? 1 : 0 }
  const document = {
    readyState: 'complete', body: element('body'), createElement: element,
    getElementById: id => id === 'root' ? root : elements.find(e => e.id === id),
    addEventListener(name, fn) { listeners[name] = fn },
  }
  const window = { location: { origin: 'http://127.0.0.1:49226', reload() { reloads++ } },
    addEventListener(name, fn) { listeners[name] = fn } }
  vm.runInNewContext(table[0].text, { window, document, setTimeout: fn => { timers.push(fn) } })
  return { listeners, timers, elements, reloads: () => reloads }
}

test('An empty startup shows an accessible manual recovery action after its deadline', () => {
  const h = fixture()
  h.timers.forEach(fn => fn())
  const alert = h.elements.find(e => e.role === 'alert')
  assert.ok(alert)
  const button = h.elements.find(e => e.tagName === 'BUTTON' && /重新加载/.test(e.textContent))
  assert.ok(button)
  assert.equal(h.reloads(), 0, 'Never automatically reload or replay user work')
  button.click()
  assert.equal(h.reloads(), 1)
  assert.ok(h.elements.some(e => e.tagName === 'A' && e.href === '/__harness/health'), 'The VM recovery warning should link to local connection diagnostics')
})

test('A successful mount and an unrelated image error do not create recovery warnings', () => {
  const h = fixture(true)
  h.timers.forEach(fn => fn())
  h.listeners.error({ target: { tagName: 'IMG', src: 'http://127.0.0.1:49226/image.png' } })
  assert.equal(h.elements.length, 0)
})

test('A failed local stylesheet shows one warning without exposing its URL or query', () => {
  const h = fixture(true)
  const event = { target: { tagName: 'LINK', rel: 'stylesheet', href: 'http://127.0.0.1:49226/assets/main.css?token=never-show-this' } }
  h.listeners.error(event); h.listeners.error(event)
  assert.equal(h.elements.filter(e => e.role === 'alert').length, 1)
  assert.ok(!h.elements.some(e => String(e.textContent).includes('never-show-this')))
})
