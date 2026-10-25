(function () {
  'use strict';

  const CARD_COLORS = ['pink', 'blue', 'orange', 'green', 'white'];
  const REEL_COLORS = ['white', 'yellow', 'pink', 'green'];
  const TILTS = ['0deg', '1deg', '0deg', '-1deg'];

  function safePlay(video) {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }

  const metaOf = (film) => film.type + ' · ' + film.length;

  // Small DOM builder; text always goes in as textContent.
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((key) => {
      if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  function playIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M8 5v14l11-7z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  // ----- Only one video plays at a time (capture, so it covers videos rendered later) -----
  document.addEventListener('play', (e) => {
    const video = e.target;
    if (!(video instanceof HTMLVideoElement)) return;
    document.querySelectorAll('video').forEach((other) => {
      if (other !== video) other.pause();
    });
  }, true);

  // ----- Pop-up player -----
  const player = document.getElementById('player');
  const playerVideo = document.getElementById('player-video');

  function openPlayer(film) {
    document.getElementById('player-title').textContent = film.title;
    document.getElementById('player-meta').textContent = metaOf(film);
    player.classList.toggle('is-vertical', film.format === 'vertical');
    playerVideo.poster = film.poster || '';
    playerVideo.src = film.src;
    playerVideo.setAttribute('aria-label', film.title);
    player.showModal();
    safePlay(playerVideo);
  }

  if (player) {
    player.querySelector('[data-close-player]').addEventListener('click', () => player.close());
    player.addEventListener('click', (e) => { if (e.target === player) player.close(); });
    player.addEventListener('close', () => {
      playerVideo.pause();
      playerVideo.removeAttribute('src');
      playerVideo.load();
    });

    const intro = document.getElementById('intro-video');
    document.querySelectorAll('[data-intro]').forEach((btn) => {
      btn.addEventListener('click', () => openPlayer({
        title: 'Meet Ahmar', type: 'A quick hello', length: '1:12', format: 'wide',
        src: intro.getAttribute('src'), poster: intro.getAttribute('poster')
      }));
    });
  }

  // ----- Work and reels, built from films.json -----
  const workGrid = document.getElementById('work-grid');
  if (workGrid) {
    const reelGrid = document.getElementById('reel-grid');
    const reelsSection = document.getElementById('reels');
    const projectCount = document.getElementById('project-count');
    let films = [];

    function card(film, i, vertical) {
      const colors = vertical ? REEL_COLORS : CARD_COLORS;
      const media = el('button', { type: 'button', class: 'card-media', 'aria-label': 'Play ' + film.title }, [
        el('img', { src: film.poster, alt: '', loading: 'lazy' }),
        el('span', { class: 'card-play', 'aria-hidden': 'true' }, [playIcon()])
      ]);
      media.addEventListener('click', () => openPlayer(film));
      const parts = [
        media,
        el('div', { class: 'card-info' }, [
          el('h3', { text: film.short || film.title }),
          el('span', { class: 'chip', text: metaOf(film) })
        ])
      ];
      if (film.link) parts.push(el('a', { class: 'card-link', href: film.link, text: 'Case study →' }));
      return el('article', {
        class: 'work-card c-' + colors[i % colors.length] + (vertical ? ' is-vertical' : ''),
        style: '--tilt: ' + TILTS[i % TILTS.length],
        'data-id': film.id
      }, parts);
    }

    function render() {
      const wide = films.filter((f) => f.format !== 'vertical');
      const tall = films.filter((f) => f.format === 'vertical');
      projectCount.textContent = films.length + (films.length === 1 ? ' project' : ' projects');
      workGrid.replaceChildren.apply(workGrid, wide.map((f, i) => card(f, i, false)));
      reelGrid.replaceChildren.apply(reelGrid, tall.map((f, i) => card(f, i, true)));
      reelsSection.hidden = tall.length === 0;
      document.dispatchEvent(new CustomEvent('portfolio:render'));
    }

    // Used by owner.js to show changes straight away.
    window.portfolio = {
      films: () => films.map((f) => Object.assign({}, f)),
      setFilms: (list) => { films = list; render(); }
    };

    fetch('films.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('films.json ' + res.status);
        return res.json();
      })
      .then((data) => window.portfolio.setFilms(data.films || []))
      .catch(() => {
        projectCount.textContent = 'Didn’t load — please refresh';
      });
  }

  // ----- Contact form: opens the visitor's email app with the enquiry filled in -----
  const form = document.getElementById('contact-form');
  if (form) {
    const status = document.getElementById('form-status');
    const to = form.getAttribute('action').replace('mailto:', '');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        status.textContent = 'Please add your name, email and a few words about the project.';
        return;
      }
      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const type = form.elements.type.value;
      const message = form.elements.message.value.trim();
      const subject = 'New project enquiry — ' + type;
      const body = 'Name: ' + name + '\nEmail: ' + email + '\nProject type: ' + type + '\n\n' + message;
      window.location.href = 'mailto:' + to +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      status.textContent = 'Your email app should open with your message ready — just press send. If it doesn’t, email me at ' + to + '.';
    });
  }
})();
