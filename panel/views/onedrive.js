'use strict'
/* "Connect OneDrive": the page that signs B-Side in to the person's OneDrive (Microsoft's device
 * code: a short code approved at microsoft.com/link on any device), chooses the OneDrive
 * folders that join the library, syncs them and disconnects. Everything comes from the worker's
 * `onedrive.*` handlers; the panel never sees a token, only the code to show, folder names and
 * ids, counts and short error codes. */

const OD_TIMEOUT = { timeoutMs: 30000 }
const odApi = {
  status: () => ask('onedrive.status', {}, { timeoutMs: 15000 }),
  connect: () => ask('onedrive.connect', {}, OD_TIMEOUT),
  cancel: () => ask('onedrive.cancel', {}, OD_TIMEOUT),
  disconnect: () => ask('onedrive.disconnect', {}, OD_TIMEOUT),
  browse: (id) => ask('onedrive.browse', id ? { id } : {}, OD_TIMEOUT),
  setFolders: (ids) => ask('onedrive.setFolders', { ids }, { timeoutMs: 120000 }),
  sync: () => ask('onedrive.sync', {}, OD_TIMEOUT)
}
const OD_MAX_FOLDERS = 8 // as the worker takes them (src/cloud/library.mjs)
const OD_ERRORS = { declined: 'odErrDeclined', expired: 'odErrExpired', revoked: 'odErrRevoked', no_keyring: 'no_keyring', auth_failed: 'auth_failed' }

function onedrivePage() {
  const page = makePage('onedrive')
  page.key = 'onedrive:'
  page.titleEl.textContent = t('odTitle')
  page.scroll.innerHTML = '<section class="picker od" aria-live="polite"></section>'
  const box = page.scroll.firstElementChild
  // view: 'status' or 'browse'; trail: the folders opened from the root, for "Up".
  const P = { st: null, view: 'status', trail: [], listing: null, chosen: new Map(), busy: false, sure: false, timer: 0, wasSyncing: false, error: '' }

  const schedule = () => {
    clearTimeout(P.timer)
    const st = P.st
    if (!st || page.disposed) return
    const ms = st.state === 'pending' ? 2000 : st.syncing ? 1500 : 0
    if (ms) P.timer = setTimeout(load, ms)
  }
  async function load() {
    try {
      const st = await odApi.status()
      if (page.disposed) return
      // A sync just ended: the library shows the new albums.
      if (P.wasSyncing && !st.syncing) refreshStatus()
      P.wasSyncing = Boolean(st.syncing)
      const before = P.st && P.st.state
      P.st = st
      if (st.state === 'signed-in' && before === 'pending') P.view = st.folders.length ? 'status' : 'browse'
      if (P.view === 'browse' && !P.listing && st.state === 'signed-in') return openFolder(null)
      draw()
    } catch (e) {
      if (page.disposed) return
      P.error = (e && MESSAGES[e.code]) || t('failed')
      draw()
    }
    schedule()
  }

  const errLine = (text) => (text ? `<p class="pk-error" role="alert">${icon('warn')}<span>${esc(text)}</span></p>` : '')
  const btn = (act, label, { ghost = false, ic = '', disabled = false } = {}) =>
    `<button class="btn${ghost ? ' ghost' : ''}" data-od="${act}"${disabled ? ' disabled' : ''}>${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`

  function statusView(st) {
    if (st.state === 'unconfigured') return `<h2 class="pk-title">${esc(t('odTitle'))}</h2><p class="pk-intro">${esc(t('odUnconfigured'))}</p>`
    if (st.state === 'pending') {
      const mins = Math.max(1, Math.round((st.code.expiresAt - Date.now()) / 60000))
      return (
        `<h2 class="pk-title">${esc(t('odApprove'))}</h2>` +
        `<p class="pk-intro">${esc(t('odStep1'))}</p>` +
        btn('open', t('odOpen', { site: String(st.code.verifyUri || '').replace(/^https:\/\//, '').replace(/\/$/, '') }), { ic: 'open' }) +
        `<p class="pk-intro">${esc(t('odStep2'))}</p>` +
        `<div class="od-code"><output aria-label="${esc(t('odCodeLabel'))}">${esc(st.code.userCode)}</output>${btn('copy', t('odCopy'), { ghost: true })}</div>` +
        `<p class="pk-now">${esc(t('odWaiting'))} ${esc(t('odExpires', { m: mins }))}</p>` +
        btn('cancel', t('odCancel'), { ghost: true })
      )
    }
    if (st.state === 'signed-out') {
      const why = st.error && OD_ERRORS[st.error] ? t(OD_ERRORS[st.error]) : ''
      return (
        `<h2 class="pk-title">${esc(t('odConnect'))}</h2>` +
        `<p class="pk-intro">${esc(t('odIntro'))}</p>` +
        errLine(why || P.error) +
        btn('connect', P.busy ? t('pickSaving') : t('odConnect'), { ic: 'cloud', disabled: P.busy }) +
        `<p class="pk-also">${icon('cloud')}<span>${esc(t('odPrivacy'))}</span></p>`
      )
    }
    // Signed in.
    const folders = st.folders || []
    const total = folders.reduce((n, f) => n + (f.tracks || 0), 0)
    const sync = st.syncing ? t('odSyncing', { n: num((st.progress && st.progress.items) || 0) }) : st.error ? (MESSAGES[st.error] || t('failed')) : st.syncedAt ? t('odSynced') : ''
    return (
      `<h2 class="pk-title">${esc(t('odConnected'))}</h2>` +
      (folders.length
        ? `<p class="pk-intro">${esc(t('odFolders'))}</p><div class="pk-list">${folders.map((f) => `<div class="pk-card od-folder"><span class="sicon">${icon('folder')}</span><span class="pk-text"><b>${esc(f.name)}</b><span>${esc(tn('tracksN', f.tracks || 0))}</span></span></div>`).join('')}</div>` +
          `<p class="pk-now" role="status">${esc([sync, folders.length > 1 ? tn('tracksN', total) : ''].filter(Boolean).join(' · '))}</p>` +
          `<p class="pk-also">${icon('play')}<span>${esc(st.aimp ? t('odPlaysAimp') : t('odPlaysLink'))}</span></p>`
        : `<p class="pk-intro">${esc(t('odNoFolders'))}</p>`) +
      errLine(P.error) +
      `<div class="state-actions">${btn('choose', t('odChoose'), { ic: 'folder' })}${folders.length ? btn('sync', t('odSync'), { ghost: true, ic: 'refresh', disabled: st.syncing }) : ''}</div>` +
      btn('disconnect', P.sure ? t('odDisconnectSure') : t('odDisconnect'), { ghost: true, ic: 'close' }) +
      `<p class="pk-also">${icon('warn')}<span>${esc(t('odRevoke'))}</span></p>`
    )
  }

  function browseView() {
    const L = P.listing
    const here = P.trail.length ? P.trail[P.trail.length - 1].name : t('odRoot')
    const crumbs = [t('odRoot'), ...P.trail.map((f) => f.name)].join(' › ')
    const rows = !L
      ? '<span class="pk-card pk-skel" aria-hidden="true"><span class="skel" style="width:55%;height:12px"></span></span>'.repeat(3)
      : L.folders.length
        ? L.folders
            .map(
              (f) =>
                `<div class="od-row"><button class="pk-card" role="checkbox" aria-checked="${P.chosen.has(f.id)}" data-pick="${esc(f.id)}" data-name="${esc(f.name)}"><span class="pk-check" aria-hidden="true">${icon('check')}</span><span class="pk-text"><b>${esc(f.name)}</b></span></button>` +
                (f.children ? `<button class="ib" data-into="${esc(f.id)}" data-name="${esc(f.name)}" aria-label="${esc(t('odOpenFolder', { name: f.name }))}" title="${esc(t('odOpenFolder', { name: f.name }))}">${icon('chev')}</button>` : '') +
                `</div>`
            )
            .join('')
        : `<p class="pk-intro">${esc(t('odEmpty'))}</p>`
    const n = P.chosen.size
    return (
      `<h2 class="pk-title">${esc(t('odChoose'))}</h2>` +
      `<p class="pk-now">${esc(crumbs)}</p>` +
      (P.trail.length ? `<button class="btn ghost" data-od="up">${icon('back')}<span>${esc(t('odUp'))}</span></button>` : '') +
      `<div class="pk-list" role="group" aria-label="${esc(here)}">${rows}</div>` +
      errLine(P.error) +
      `<button class="btn pk-use" data-od="use"${!n || P.busy ? ' disabled' : ''}>${icon('check')}<span>${esc(P.busy ? t('pickSaving') : n ? tn('pickUseN', n) : t('pickUse'))}</span></button>` +
      ((P.st && P.st.folders && P.st.folders.length) ? btn('back', t('odCancel'), { ghost: true }) : '')
    )
  }

  function draw() {
    if (page.disposed) return
    const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.od || document.activeElement.dataset.pick || document.activeElement.dataset.into : null
    box.innerHTML = !P.st ? `<p class="pk-intro">${esc(t('libLoading'))}</p>` : P.view === 'browse' && P.st.state === 'signed-in' ? browseView() : statusView(P.st)
    if (focused) box.querySelector(`[data-od="${CSS.escape(focused)}"], [data-pick="${CSS.escape(focused)}"], [data-into="${CSS.escape(focused)}"]`)?.focus()
  }

  async function openFolder(id, name) {
    P.view = 'browse'
    P.listing = null
    P.error = ''
    draw()
    try {
      const r = await odApi.browse(id)
      if (page.disposed) return
      if (id === null) P.trail = []
      else if (!P.trail.some((f) => f.id === id)) P.trail.push({ id, name })
      else P.trail = P.trail.slice(0, P.trail.findIndex((f) => f.id === id) + 1)
      P.listing = r
      for (const f of r.folders) if (f.chosen && !P.chosen.has(f.id)) P.chosen.set(f.id, f.name)
    } catch (e) {
      P.listing = { folders: [] }
      P.error = (e && MESSAGES[e.code]) || t('failed')
    }
    draw()
  }

  async function act(what) {
    P.error = ''
    if (what !== 'disconnect') P.sure = false
    try {
      if (what === 'connect') {
        P.busy = true
        draw()
        P.st = await odApi.connect()
        P.busy = false
      } else if (what === 'open') {
        // Microsoft's page, in the person's browser (Orca asks first for a site it does not know).
        // The address comes from the worker, which only passes Microsoft's sign-in hosts.
        const uri = P.st && P.st.code && P.st.code.verifyUri
        if (uri) await orca.shell.openExternal(uri)
        return
      } else if (what === 'copy') {
        const code = P.st && P.st.code && P.st.code.userCode
        if (code) {
          await navigator.clipboard.writeText(code).then(() => toast(t('odCopied')), () => {
            const out = box.querySelector('.od-code output')
            if (out) getSelection().selectAllChildren(out)
          })
        }
        return
      } else if (what === 'cancel') P.st = await odApi.cancel()
      else if (what === 'disconnect') {
        if (!P.sure) {
          P.sure = true
          return draw()
        }
        P.sure = false
        P.st = await odApi.disconnect()
        P.chosen.clear()
        P.view = 'status'
        toast(t('odDisconnected'))
        LIB.memo.clear()
        refreshStatus()
      } else if (what === 'sync') P.st = await odApi.sync()
      else if (what === 'choose') {
        P.chosen = new Map(((P.st && P.st.folders) || []).map((f) => [f.id, f.name]))
        return openFolder(null)
      } else if (what === 'up') {
        const up = P.trail[P.trail.length - 2]
        return up ? openFolder(up.id, up.name) : openFolder(null)
      } else if (what === 'back') {
        P.view = 'status'
      } else if (what === 'use') {
        if (!P.chosen.size || P.busy) return
        P.busy = true
        draw()
        P.st = await odApi.setFolders([...P.chosen.keys()])
        P.busy = false
        P.view = 'status'
        P.wasSyncing = true
        LIB.memo.clear()
        refreshStatus()
      }
    } catch (e) {
      P.busy = false
      P.error = (e && MESSAGES[e.code]) || t('failed')
    }
    draw()
    schedule()
  }

  box.addEventListener('click', (e) => {
    const into = e.target.closest('[data-into]')
    if (into) return openFolder(into.dataset.into, into.dataset.name)
    const pick = e.target.closest('[data-pick]')
    if (pick) {
      const id = pick.dataset.pick
      if (P.chosen.has(id)) P.chosen.delete(id)
      else if (P.chosen.size >= OD_MAX_FOLDERS) {
        P.error = t('pickTooMany', { n: OD_MAX_FOLDERS })
        return draw()
      } else P.chosen.set(id, pick.dataset.name)
      P.error = ''
      return draw()
    }
    const b = e.target.closest('[data-od]')
    if (b && !b.disabled) act(b.dataset.od)
  })
  page.activate = () => {}
  page.menuFor = () => null
  const dispose = page.dispose
  page.dispose = function () {
    page.disposed = true
    clearTimeout(P.timer)
    dispose.call(this)
  }
  draw()
  load()
  return page
}
