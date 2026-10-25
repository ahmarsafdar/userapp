// Owner mode: lets the site owner add and remove films from the live site.
// Open the site with #owner at the end of the address to sign in. Visitors never see any of this.
// Changes are committed to the GitHub repo below; GitHub Pages republishes the site about a minute later.
(function () {
  'use strict';

  const REPO = 'ahmarsafdar/userapp';
  const API = 'https://api.github.com';
  const TOKEN_KEY = 'portfolio-owner-token';
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
  const MAX_MB = 50;
  const TYPES = ['Commercial', 'Product ad', 'Concept film', 'Brand film', 'CEO reel', 'Real-estate film',
    'Skincare ad', 'Fragrance commercial', 'Tech commercial', 'SaaS product demo', 'Motion graphics explainer',
    '2D animated explainer', 'Music video', 'Event highlights'];

  const portfolio = window.portfolio;
  if (!portfolio) return;

  // ----- Token storage (this browser only) -----
  let memoryToken = null;
  const token = {
    get() {
      try { return localStorage.getItem(TOKEN_KEY) || memoryToken; } catch (e) { return memoryToken; }
    },
    set(value) {
      memoryToken = value;
      try { localStorage.setItem(TOKEN_KEY, value); } catch (e) {}
    },
    clear() {
      memoryToken = null;
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }
  };
  const signedIn = () => !!token.get();

  // ----- GitHub API -----
  async function gh(path, opts) {
    const o = opts || {};
    const headers = {
      Authorization: 'Bearer ' + (o.token || token.get()),
      Accept: o.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (o.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, {
        method: o.method || 'GET',
        headers: headers,
        body: o.body ? JSON.stringify(o.body) : undefined,
        cache: 'no-store'
      });
    } catch (e) {
      const err = new Error('Couldn’t reach GitHub. Check your internet connection and try again.');
      err.status = 0;
      throw err;
    }
    if (!res.ok) {
      let message = 'GitHub returned an error (' + res.status + ').';
      try { message = (await res.json()).message || message; } catch (e) {}
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return o.accept === 'application/vnd.github.raw+json' ? res.text() : res.json();
  }

  function explain(err) {
    if (err.status === 401) return 'GitHub didn’t accept your key — it may have expired. Sign out, then sign in with a new key.';
    if (err.status === 403 || err.status === 404) {
      return 'Your key can’t change ' + REPO + '. Make sure it has “Contents: Read and write” access to that repository.';
    }
    return err.message;
  }

  async function fileExists(path) {
    try {
      await gh('/repos/' + REPO + '/contents/' + path, { accept: 'application/vnd.github.object+json' });
      return true;
    } catch (err) {
      if (err.status === 404) return false;
      throw err;
    }
  }

  const formatFilms = (films) =>
    '{\n  "films": [\n' + films.map((f) => '    ' + JSON.stringify(f)).join(',\n') + '\n  ]\n}\n';

  // Makes one commit that uploads new files, deletes old ones and rewrites films.json.
  // `change` receives the film list as it is on GitHub right now and returns { films, remove }.
  async function commit(message, uploads, change, onStatus) {
    const repo = await gh('/repos/' + REPO);
    const branch = repo.default_branch;
    const blobs = [];
    for (const upload of uploads) {
      onStatus('Uploading ' + upload.label + '…');
      const blob = await gh('/repos/' + REPO + '/git/blobs', {
        method: 'POST',
        body: { content: upload.base64, encoding: 'base64' }
      });
      blobs.push({ path: upload.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    onStatus('Saving to your site…');
    for (let attempt = 1; ; attempt++) {
      const head = (await gh('/repos/' + REPO + '/git/ref/heads/' + branch)).object.sha;
      const parent = await gh('/repos/' + REPO + '/git/commits/' + head);
      const current = JSON.parse(await gh('/repos/' + REPO + '/contents/films.json?ref=' + head, {
        accept: 'application/vnd.github.raw+json'
      }));
      const next = change(current.films || []);
      const deletions = (next.remove || [])
        .filter((path) => path.indexOf('media/') === 0)
        .map((path) => ({ path: path, mode: '100644', type: 'blob', sha: null }));
      const tree = await gh('/repos/' + REPO + '/git/trees', {
        method: 'POST',
        body: {
          base_tree: parent.tree.sha,
          tree: blobs.concat(deletions, [{ path: 'films.json', mode: '100644', type: 'blob', content: formatFilms(next.films) }])
        }
      });
      const created = await gh('/repos/' + REPO + '/git/commits', {
        method: 'POST',
        body: { message: message, tree: tree.sha, parents: [head] }
      });
      try {
        await gh('/repos/' + REPO + '/git/refs/heads/' + branch, { method: 'PATCH', body: { sha: created.sha } });
        return next.films;
      } catch (err) {
        // Another change landed first: rebuild on top of it.
        if (err.status !== 422 || attempt >= 3) throw err;
      }
    }
  }

  // ----- Helpers -----
  const toBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  function slugify(text) {
    return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'film';
  }

  function formatLength(seconds) {
    const s = Math.max(1, Math.round(seconds));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function capturePoster(video) {
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t make a poster image.'))), 'image/jpeg', 0.85);
    });
  }

  function frameReady(video) {
    if (video.readyState >= 2 && !video.seeking) return Promise.resolve();
    return new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
  }

  // Films added this session play from the local file until GitHub Pages has published them.
  const localMedia = {};
  const showFilms = (list) => portfolio.setFilms(list.map((f) => (localMedia[f.id] ? Object.assign({}, f, localMedia[f.id]) : f)));

  // ----- UI -----
  const ui = document.createElement('div');
  ui.innerHTML = [
    '<div class="owner-bar" hidden>',
    '  <button type="button" class="btn btn-ink" data-owner="add">+ Add film</button>',
    '  <button type="button" class="btn btn-white" data-owner="signout">Sign out</button>',
    '</div>',
    '<p class="owner-toast" role="status" aria-live="polite"></p>',

    '<dialog class="owner-dialog" id="owner-signin" aria-labelledby="owner-signin-title">',
    '  <form class="owner-form" novalidate>',
    '    <h2 id="owner-signin-title">Owner sign-in</h2>',
    '    <p>Only the owner of this site can add films. Paste your GitHub key below — it is saved in this browser only.</p>',
    '    <details>',
    '      <summary>How to get a key (2 minutes, once)</summary>',
    '      <ol>',
    '        <li>Open <a href="' + TOKEN_URL + '" target="_blank" rel="noopener">GitHub → New fine-grained token</a> and sign in.</li>',
    '        <li>Name it “Portfolio” and choose an expiry date.</li>',
    '        <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>userapp</b>.</li>',
    '        <li>Under <b>Permissions</b>, give <b>Contents</b> “Read and write” access.</li>',
    '        <li>Click <b>Generate token</b>, copy it and paste it here.</li>',
    '      </ol>',
    '    </details>',
    '    <div class="field">',
    '      <label for="owner-token">GitHub key</label>',
    '      <input id="owner-token" type="password" autocomplete="off" spellcheck="false" required placeholder="github_pat_…">',
    '    </div>',
    '    <p class="form-status" role="status"></p>',
    '    <div class="owner-actions">',
    '      <button type="submit" class="btn btn-ink">Sign in</button>',
    '      <button type="button" class="btn btn-white" data-close>Cancel</button>',
    '    </div>',
    '  </form>',
    '</dialog>',

    '<dialog class="owner-dialog" id="owner-add" aria-labelledby="owner-add-title">',
    '  <form class="owner-form" novalidate>',
    '    <h2 id="owner-add-title">Add a film</h2>',
    '    <div class="field">',
    '      <label for="add-file">Video file (MP4)</label>',
    '      <input id="add-file" type="file" accept="video/mp4,.mp4" required>',
    '      <p class="owner-hint">Export as MP4 (H.264), 1080p or 720p, under ' + MAX_MB + ' MB. Wide videos go in “The good stuff”, vertical ones in “Made for the scroll” — or pick “SaaS &amp; product demos” below.</p>',
    '    </div>',
    '    <div class="owner-preview" hidden>',
    '      <video muted playsinline preload="auto"></video>',
    '      <div class="field">',
    '        <label for="add-frame">Poster frame — slide to pick the cover image</label>',
    '        <input id="add-frame" type="range" min="0" max="1" step="0.04" value="0">',
    '      </div>',
    '      <p class="owner-hint" data-info></p>',
    '    </div>',
    '    <div class="field">',
    '      <label for="add-title">Title</label>',
    '      <input id="add-title" required maxlength="80" placeholder="e.g. Nova Watch — Launch Film">',
    '    </div>',
    '    <div class="field">',
    '      <label for="add-short">Short name for the card (optional)</label>',
    '      <input id="add-short" maxlength="28" placeholder="e.g. Nova Watch">',
    '    </div>',
    '    <div class="field">',
    '      <label for="add-type">Type</label>',
    '      <input id="add-type" list="add-types" required maxlength="40" placeholder="e.g. Product ad">',
    '      <datalist id="add-types">' + TYPES.map((t) => '<option value="' + t + '">').join('') + '</datalist>',
    '    </div>',
    '    <div class="field">',
    '      <label for="add-section">Section</label>',
    '      <select id="add-section">',
    '        <option value="">By shape — “The good stuff” or “Made for the scroll”</option>',
    '        <option value="saas">SaaS &amp; product demos</option>',
    '      </select>',
    '    </div>',
    '    <fieldset class="owner-choice">',
    '      <legend>Where should it go?</legend>',
    '      <label><input type="radio" name="position" value="first" checked> First (newest work)</label>',
    '      <label><input type="radio" name="position" value="last"> Last</label>',
    '    </fieldset>',
    '    <p class="form-status" role="status" aria-live="polite"></p>',
    '    <div class="owner-actions">',
    '      <button type="submit" class="btn btn-ink">Add to portfolio</button>',
    '      <button type="button" class="btn btn-white" data-close>Cancel</button>',
    '    </div>',
    '  </form>',
    '</dialog>'
  ].join('\n');
  document.body.appendChild(ui);

  const bar = ui.querySelector('.owner-bar');
  const toastEl = ui.querySelector('.owner-toast');
  const signinDialog = ui.querySelector('#owner-signin');
  const signinForm = signinDialog.querySelector('form');
  const signinStatus = signinForm.querySelector('.form-status');
  const addDialog = ui.querySelector('#owner-add');
  const addForm = addDialog.querySelector('form');
  const addStatus = addForm.querySelector('.form-status');
  const fileInput = addForm.querySelector('#add-file');
  const previewBox = addForm.querySelector('.owner-preview');
  const preview = previewBox.querySelector('video');
  const frameInput = addForm.querySelector('#add-frame');
  const info = addForm.querySelector('[data-info]');

  let busy = false;
  let previewUrl = null;
  let picked = null; // { file, format, length } for the chosen video
  let toastTimer = null;

  function toast(message, sticky) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    if (!sticky) toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 7000);
  }

  function setBusy(form, on) {
    busy = on;
    form.querySelectorAll('input, select, button').forEach((field) => { field.disabled = on; });
    bar.querySelectorAll('button').forEach((btn) => { btn.disabled = on; });
  }

  [signinDialog, addDialog].forEach((dialog) => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  });

  function refreshOwnerUi() {
    bar.hidden = !signedIn();
    document.body.classList.toggle('is-owner', signedIn());
    document.querySelectorAll('.owner-remove').forEach((btn) => btn.remove());
    if (!signedIn()) return;
    const films = portfolio.films();
    document.querySelectorAll('.work-card').forEach((item) => {
      const film = films.find((f) => f.id === item.dataset.id);
      if (!film) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'owner-remove';
      btn.textContent = '×';
      btn.setAttribute('aria-label', 'Remove ' + film.title);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFilm(film.id);
      });
      item.appendChild(btn);
    });
  }
  document.addEventListener('portfolio:render', refreshOwnerUi);
  refreshOwnerUi();

  // ----- Sign in / out -----
  function openSignin() {
    signinStatus.textContent = '';
    signinForm.reset();
    signinDialog.showModal();
  }

  function checkHash() {
    if (location.hash !== '#owner') return;
    history.replaceState(null, '', location.pathname + location.search);
    if (signedIn()) toast('You’re signed in. Use “+ Add film” to add new work.');
    else openSignin();
  }
  window.addEventListener('hashchange', checkHash);
  checkHash();

  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = signinForm.querySelector('#owner-token').value.trim();
    if (!value) {
      signinStatus.textContent = 'Paste your GitHub key first.';
      return;
    }
    setBusy(signinForm, true);
    signinStatus.textContent = 'Checking your key…';
    try {
      const repo = await gh('/repos/' + REPO, { token: value });
      if (repo.permissions && repo.permissions.push === false) {
        throw Object.assign(new Error(''), { status: 403 });
      }
      token.set(value);
      signinDialog.close();
      refreshOwnerUi();
      toast('Signed in. Use “+ Add film” to add new work.');
    } catch (err) {
      signinStatus.textContent = explain(err);
    } finally {
      setBusy(signinForm, false);
    }
  });

  bar.querySelector('[data-owner="signout"]').addEventListener('click', () => {
    token.clear();
    refreshOwnerUi();
    toast('Signed out. Open the site with #owner to sign in again.');
  });

  // ----- Add a film -----
  function resetAdd() {
    addForm.reset();
    addStatus.textContent = '';
    previewBox.hidden = true;
    picked = null;
    preview.removeAttribute('src');
    preview.load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  bar.querySelector('[data-owner="add"]').addEventListener('click', () => {
    resetAdd();
    addDialog.showModal();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    picked = null;
    previewBox.hidden = true;
    addStatus.textContent = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (!file) return;
    if (!/\.mp4$/i.test(file.name) && file.type !== 'video/mp4') {
      addStatus.textContent = 'Please choose an MP4 file — export it from your editor as H.264 MP4.';
      return;
    }
    const mb = file.size / 1048576;
    if (mb > MAX_MB) {
      addStatus.textContent = 'This video is ' + Math.round(mb) + ' MB; the limit is ' + MAX_MB +
        ' MB. Export it at 1080p H.264, around 5–8 Mbit/s.';
      return;
    }
    previewUrl = URL.createObjectURL(file);
    preview.onloadedmetadata = () => {
      const format = preview.videoHeight > preview.videoWidth ? 'vertical' : 'wide';
      picked = { file: file, format: format, length: formatLength(preview.duration) };
      frameInput.max = String(Math.max(0.1, preview.duration - 0.1));
      frameInput.value = String(Math.min(preview.duration * 0.3, preview.duration - 0.1));
      preview.currentTime = Number(frameInput.value);
      info.textContent = (format === 'vertical' ? 'Vertical (9:16) — goes in “Made for the scroll”' : 'Wide (16:9) — goes in “The good stuff”') +
        ' · ' + picked.length + ' · ' + mb.toFixed(1) + ' MB';
      previewBox.hidden = false;
    };
    preview.onerror = () => {
      addStatus.textContent = 'This browser can’t play that file, so visitors couldn’t either. Export it as MP4 (H.264) and try again.';
    };
    preview.src = previewUrl;
  });

  frameInput.addEventListener('input', () => {
    preview.currentTime = Number(frameInput.value);
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!picked) {
      addStatus.textContent = addStatus.textContent || 'Choose a video first.';
      return;
    }
    if (!addForm.checkValidity()) {
      addForm.reportValidity();
      return;
    }
    const title = addForm.querySelector('#add-title').value.trim();
    const short = addForm.querySelector('#add-short').value.trim() || title;
    const type = addForm.querySelector('#add-type').value.trim();
    const first = addForm.querySelector('input[name="position"]:checked').value === 'first';
    const section = addForm.querySelector('#add-section').value;

    setBusy(addForm, true);
    try {
      addStatus.textContent = 'Getting ready…';
      const base = slugify(title);
      const taken = portfolio.films().map((f) => f.id);
      let id = base;
      for (let n = 2; taken.indexOf(id) !== -1 || await fileExists('media/films/' + id + '.mp4'); n++) id = base + '-' + n;

      await frameReady(preview);
      const posterBlob = await capturePoster(preview);
      const film = {
        id: id, title: title, short: short, type: type, length: picked.length, format: picked.format,
        src: 'media/films/' + id + '.mp4', poster: 'media/posters/' + id + '.jpg'
      };
      if (section) film.section = section;

      const uploads = [
        { path: film.src, label: 'the video (' + (picked.file.size / 1048576).toFixed(1) + ' MB) — this can take a minute', base64: await toBase64(picked.file) },
        { path: film.poster, label: 'the poster', base64: await toBase64(posterBlob) }
      ];
      const next = await commit('Add film: ' + title, uploads, (list) => {
        if (list.some((f) => f.id === id)) throw new Error('A film with this name was just added. Please try again.');
        return { films: first ? [film].concat(list) : list.concat([film]) };
      }, (message) => { addStatus.textContent = message; });

      localMedia[id] = { src: previewUrl, poster: URL.createObjectURL(posterBlob) };
      previewUrl = null; // now owned by localMedia
      showFilms(next);
      addDialog.close();
      toast('“' + title + '” is in your portfolio. Visitors will see it in about a minute.');
    } catch (err) {
      addStatus.textContent = explain(err);
    } finally {
      setBusy(addForm, false);
    }
  });

  // ----- Remove a film -----
  // Files still shown somewhere else on the page (outside the film cards) are kept.
  const usedElsewhere = (path) => Array.prototype.some.call(document.querySelectorAll('[src], [poster]'), (node) =>
    !node.closest('.work-card') && (node.getAttribute('src') === path || node.getAttribute('poster') === path));
  const filesToDelete = (film) => (film.link ? [] : [film.src, film.poster].filter((path) => !usedElsewhere(path)));

  async function removeFilm(id) {
    const film = portfolio.films().find((f) => f.id === id);
    if (!film || busy) return;
    const note = film.link ? ' Its case study page stays.'
      : filesToDelete(film).length ? ' Its video file is deleted too.'
      : ' Its video stays, because it is also used elsewhere on the site.';
    if (!window.confirm('Remove “' + film.title + '” from your portfolio?' + note)) return;
    setBusy(addForm, true);
    toast('Removing “' + film.title + '”…', true);
    try {
      const next = await commit('Remove film: ' + film.title, [], (list) => {
        const current = list.find((f) => f.id === id);
        if (!current) return { films: list };
        return {
          films: list.filter((f) => f.id !== id),
          remove: filesToDelete(current)
        };
      }, () => {});
      showFilms(next);
      toast('Removed “' + film.title + '”. Visitors will see the change in about a minute.');
    } catch (err) {
      toast(explain(err));
    } finally {
      setBusy(addForm, false);
    }
  }
})();
