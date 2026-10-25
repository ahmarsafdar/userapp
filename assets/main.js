(function () {
  'use strict';

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smooth = reduceMotion ? 'auto' : 'smooth';

  function safePlay(video) {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }

  const pad = (n) => (n < 10 ? '0' : '') + n;
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

  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  const hero = document.getElementById('hero-video');
  let setSound = () => {};

  // ----- Only one video with sound at a time (capture, so it covers videos rendered later) -----
  document.addEventListener('play', (e) => {
    const video = e.target;
    if (!(video instanceof HTMLVideoElement) || video === hero) return;
    document.querySelectorAll('video').forEach((other) => {
      if (other !== video && other !== hero) other.pause();
    });
    if (hero && !hero.muted) setSound(false);
  }, true);

  // ----- Home page: hero player, film strip and reels, all driven by films.json -----
  if (hero) {
    const strip = document.getElementById('strip');
    const reelGrid = document.getElementById('reel-grid');
    const filmCount = document.getElementById('film-count');
    const soundBtn = document.getElementById('sound-toggle');
    const playBtn = document.getElementById('play-toggle');
    const nowNum = document.getElementById('now-num');
    const nowTitle = document.getElementById('now-title');
    const nowMeta = document.getElementById('now-meta');

    let films = [];
    let numbers = {};
    let currentId = null;
    let soundOn = false;
    let userPaused = reduceMotion;
    let autoPaused = false;

    const PAUSE_ICON = '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>';
    const PLAY_ICON = '<path d="M8 5v14l11-7z" fill="currentColor"/>';

    hero.muted = true;
    hero.defaultMuted = true;
    if (reduceMotion) hero.removeAttribute('autoplay');

    const findFilm = (id) => films.find((f) => f.id === id);

    setSound = (on) => {
      soundOn = on;
      hero.muted = !on;
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.querySelector('span').textContent = on ? 'Sound off' : 'Sound on';
      if (on) {
        document.querySelectorAll('video').forEach((v) => { if (v !== hero) v.pause(); });
        userPaused = false;
        safePlay(hero);
      }
    };

    const updatePlayBtn = () => {
      const paused = hero.paused;
      playBtn.querySelector('svg').innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
      playBtn.querySelector('span').textContent = paused ? 'Play' : 'Pause';
      playBtn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    };
    hero.addEventListener('play', updatePlayBtn);
    hero.addEventListener('pause', updatePlayBtn);

    function showFilm(id, opts) {
      const film = findFilm(id);
      if (!film) return;
      const picked = opts && opts.picked;
      currentId = id;
      strip.querySelectorAll('.film-item').forEach((item) => {
        item.querySelector('.film-card').setAttribute('aria-pressed', item.dataset.id === id ? 'true' : 'false');
      });
      if (hero.getAttribute('src') !== film.src) hero.src = film.src;
      hero.poster = film.poster;
      hero.setAttribute('aria-label', film.title + ', ' + metaOf(film));
      nowNum.textContent = numbers[id];
      nowTitle.textContent = film.title;
      nowMeta.textContent = metaOf(film);
      hero.muted = !soundOn;
      if (picked) userPaused = false;
      if (!userPaused) safePlay(hero);
      const item = strip.querySelector('.film-item[data-id="' + CSS.escape(id) + '"]');
      if (item) {
        strip.scrollTo({
          left: item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2,
          behavior: picked ? smooth : 'auto'
        });
      }
    }

    function render() {
      const wide = films.filter((f) => f.format !== 'vertical');
      const tall = films.filter((f) => f.format === 'vertical');
      numbers = {};
      wide.concat(tall).forEach((f, i) => { numbers[f.id] = pad(i + 1); });

      filmCount.textContent = 'Choose a film · ' + wide.length + (wide.length === 1 ? ' film' : ' films');
      strip.replaceChildren.apply(strip, wide.map((f) => el('div', { class: 'film-item', 'data-id': f.id }, [
        el('button', { type: 'button', class: 'film-card', 'aria-pressed': 'false' }, [
          el('img', { src: f.poster, alt: '', loading: 'lazy' }),
          el('span', { text: numbers[f.id] + ' · ' + (f.short || f.title) })
        ])
      ])));

      reelGrid.replaceChildren.apply(reelGrid, tall.map((f) => {
        const video = el('video', {
          src: f.src, poster: f.poster, controls: '', preload: 'none', playsinline: '',
          'aria-label': f.title + ', ' + f.type
        });
        const parts = [
          el('div', { class: 'reel-frame' }, [video]),
          el('p', { class: 'eyebrow', text: numbers[f.id] + ' · ' + metaOf(f) }),
          el('h3', { text: f.title })
        ];
        if (f.link) parts.push(el('a', { class: 'text-link', href: f.link, text: 'View case study →' }));
        return el('article', { class: 'reel', 'data-id': f.id }, parts);
      }));
      document.getElementById('scroll').hidden = tall.length === 0;

      // Featured panels follow the strip's numbering and hide if their film is removed.
      document.querySelectorAll('[data-num-for]').forEach((num) => {
        const id = num.dataset.numFor;
        if (numbers[id]) num.textContent = numbers[id];
        num.closest('.panel').hidden = !findFilm(id);
      });

      const current = currentId && findFilm(currentId);
      const start = current && current.format !== 'vertical' ? current : (wide.find((f) => f.start) || wide[0]);
      if (start) showFilm(start.id);

      document.dispatchEvent(new CustomEvent('portfolio:render'));
    }

    // Used by owner.js to show changes straight away.
    window.portfolio = {
      films: () => films.map((f) => Object.assign({}, f)),
      setFilms: (list) => { films = list; render(); }
    };

    strip.addEventListener('click', (e) => {
      const card = e.target.closest('.film-card');
      if (card) showFilm(card.closest('.film-item').dataset.id, { picked: true });
    });

    document.querySelectorAll('[data-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showFilm(btn.dataset.play, { picked: true });
        setSound(true);
        window.scrollTo({ top: 0, behavior: smooth });
      });
    });

    soundBtn.addEventListener('click', () => setSound(!soundOn));

    playBtn.addEventListener('click', () => {
      if (hero.paused) {
        userPaused = false;
        safePlay(hero);
      } else {
        userPaused = true;
        hero.pause();
      }
    });

    document.querySelectorAll('[data-strip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        strip.scrollBy({ left: Number(btn.dataset.strip) * strip.clientWidth * 0.8, behavior: smooth });
      });
    });

    // Save battery: pause the muted hero while it is off screen, resume when it returns.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const visible = entries[0].isIntersecting;
        if (!visible && !hero.paused && !soundOn) {
          autoPaused = true;
          hero.pause();
        } else if (visible && autoPaused && !userPaused) {
          autoPaused = false;
          safePlay(hero);
        }
      }, { threshold: 0.15 }).observe(hero);
    }

    updatePlayBtn();

    fetch('films.json', { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('films.json ' + res.status);
        return res.json();
      })
      .then((data) => window.portfolio.setFilms(data.films || []))
      .catch(() => {
        filmCount.textContent = 'The film list didn’t load — please refresh the page.';
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
