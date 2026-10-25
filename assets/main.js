(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var smooth = reduceMotion ? 'auto' : 'smooth';

  function safePlay(video) {
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  var hero = document.getElementById('hero-video');
  var inlineVideos = Array.prototype.slice.call(document.querySelectorAll('video')).filter(function (v) {
    return v !== hero;
  });

  // ----- Hero player (home page only) -----
  var setSound = function () {};

  if (hero) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.film-card'));
    var strip = document.getElementById('strip');
    var soundBtn = document.getElementById('sound-toggle');
    var playBtn = document.getElementById('play-toggle');
    var nowNum = document.getElementById('now-num');
    var nowTitle = document.getElementById('now-title');
    var nowMeta = document.getElementById('now-meta');
    var soundOn = false;
    var userPaused = false;
    var autoPaused = false;

    var PAUSE_ICON = '<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>';
    var PLAY_ICON = '<path d="M8 5v14l11-7z" fill="currentColor"/>';

    hero.muted = true;
    hero.defaultMuted = true;

    setSound = function (on) {
      soundOn = on;
      hero.muted = !on;
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.querySelector('span').textContent = on ? 'Sound off' : 'Sound on';
      if (on) {
        inlineVideos.forEach(function (v) { v.pause(); });
        userPaused = false;
        safePlay(hero);
      }
    };

    var updatePlayBtn = function () {
      var paused = hero.paused;
      playBtn.querySelector('svg').innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
      playBtn.querySelector('span').textContent = paused ? 'Play' : 'Pause';
      playBtn.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    };
    hero.addEventListener('play', updatePlayBtn);
    hero.addEventListener('pause', updatePlayBtn);

    var setFilm = function (i) {
      var card = cards[i];
      if (!card) return;
      cards.forEach(function (c, j) { c.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      hero.src = card.dataset.src;
      hero.poster = card.dataset.poster;
      hero.setAttribute('aria-label', card.dataset.title + ', ' + card.dataset.meta);
      nowNum.textContent = (i < 9 ? '0' : '') + (i + 1);
      nowTitle.textContent = card.dataset.title;
      nowMeta.textContent = card.dataset.meta;
      hero.muted = !soundOn;
      userPaused = false;
      safePlay(hero);
      strip.scrollTo({
        left: card.offsetLeft - (strip.clientWidth - card.offsetWidth) / 2,
        behavior: smooth
      });
    };

    cards.forEach(function (card, i) {
      card.addEventListener('click', function () { setFilm(i); });
    });

    document.querySelectorAll('[data-play]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFilm(Number(btn.dataset.play));
        setSound(true);
        window.scrollTo({ top: 0, behavior: smooth });
      });
    });

    soundBtn.addEventListener('click', function () { setSound(!soundOn); });

    playBtn.addEventListener('click', function () {
      if (hero.paused) {
        userPaused = false;
        safePlay(hero);
      } else {
        userPaused = true;
        hero.pause();
      }
    });

    document.querySelectorAll('[data-strip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        strip.scrollBy({ left: Number(btn.dataset.strip) * strip.clientWidth * 0.8, behavior: smooth });
      });
    });

    if (reduceMotion) {
      hero.removeAttribute('autoplay');
      hero.pause();
      userPaused = true;
    }

    // Save battery: pause the muted hero while it is off screen, resume when it returns.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var visible = entries[0].isIntersecting;
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
  }

  // ----- Only one video with sound at a time -----
  inlineVideos.forEach(function (video) {
    video.addEventListener('play', function () {
      inlineVideos.forEach(function (other) {
        if (other !== video) other.pause();
      });
      if (hero && !hero.muted) setSound(false);
    });
  });

  // ----- Contact form: opens the visitor's email app with the enquiry filled in -----
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('form-status');
    var to = form.getAttribute('action').replace('mailto:', '');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        status.textContent = 'Please add your name, email and a few words about the project.';
        return;
      }
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var type = form.elements.type.value;
      var message = form.elements.message.value.trim();
      var subject = 'New project enquiry — ' + type;
      var body = 'Name: ' + name + '\nEmail: ' + email + '\nProject type: ' + type + '\n\n' + message;
      window.location.href = 'mailto:' + to +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      status.textContent = 'Your email app should open with your message ready — just press send. If it doesn’t, email me at ' + to + '.';
    });
  }
})();
