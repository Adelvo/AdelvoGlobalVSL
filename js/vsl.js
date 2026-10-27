/* ==========================================================================
   VSL PLAYER
   Autoplays on load (with sound when the browser allows it, otherwise muted
   with a "turn on sound" overlay). Viewers can pause, mute, go fullscreen and
   seek back — but can't skip ahead past what they've watched until they have
   seen the whole video once (remembered in localStorage).
   ========================================================================== */
(() => {
  const STORAGE_KEY = 'adelvo_vsl_completed';
  const BACK_SECONDS = 10;
  const IDLE_MS = 2500;

  const frame = document.getElementById('vsl');
  if (!frame) return;
  const video = frame.querySelector('video');
  const unmuteBtn = frame.querySelector('.vsl__unmute');
  const bigPlay = frame.querySelector('.vsl__bigplay');
  const bar = frame.querySelector('.vsl__bar');
  const barPlayed = frame.querySelector('.vsl__bar-played');
  const barWatched = frame.querySelector('.vsl__bar-watched');
  const timeEl = frame.querySelector('.vsl__time');
  const btn = (action) => frame.querySelector(`[data-action="${action}"]`);

  let completed = false;
  try { completed = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}

  let maxWatched = 0;   // furthest point reached by normal playback
  let lastTime = 0;

  const seekLimit = () => (completed ? video.duration || 0 : maxWatched);

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /* ---------- rendering ---------- */
  const render = () => {
    const d = video.duration || 0;
    const pct = d ? (video.currentTime / d) * 100 : 0;
    barPlayed.style.width = `${pct}%`;
    barWatched.style.width = `${d ? (seekLimit() / d) * 100 : 0}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    timeEl.textContent = d ? `${fmt(video.currentTime)} / ${fmt(d)}` : fmt(video.currentTime);
  };

  const renderState = () => {
    frame.classList.toggle('is-paused', video.paused);
    frame.classList.toggle('is-muted', video.muted);
    btn('play').setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
    btn('mute').setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  };

  /* ---------- seeking (with the no-skip rule) ---------- */
  const seekTo = (t) => {
    if (!video.duration) return;
    video.currentTime = Math.max(0, Math.min(t, seekLimit()));
  };

  // Catches every other way of seeking (keyboard, iOS native fullscreen, devtools…)
  video.addEventListener('seeking', () => {
    if (!completed && video.currentTime > maxWatched + 0.5) {
      video.currentTime = maxWatched;
    }
  });

  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    // Only count normal forward playback, never a jump.
    if (!video.seeking && t > lastTime && t - lastTime < 1.5 && t > maxWatched) {
      maxWatched = t;
    }
    lastTime = t;
    render();
  });

  video.addEventListener('ended', () => {
    completed = true;
    maxWatched = video.duration;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    bigPlay.hidden = false;
    render();
  });

  video.addEventListener('loadedmetadata', render);
  ['play', 'pause', 'volumechange'].forEach((ev) => video.addEventListener(ev, renderState));
  video.addEventListener('play', () => { bigPlay.hidden = true; });

  /* ---------- autoplay ---------- */
  const showUnmute = () => { unmuteBtn.hidden = false; };
  const hideUnmute = () => { unmuteBtn.hidden = true; };

  const autoplay = () => {
    video.muted = false;
    video.play().catch(() => {
      // Browsers block autoplay with sound until the visitor interacts.
      video.muted = true;
      video.play().then(showUnmute).catch(() => { bigPlay.hidden = false; });
    });
  };

  // First unmute restarts the video so nothing is missed while it played silently.
  const unmute = () => {
    hideUnmute();
    video.muted = false;
    video.currentTime = 0;
    lastTime = 0;
    video.play();
  };

  unmuteBtn.addEventListener('click', unmute);
  bigPlay.addEventListener('click', () => {
    if (video.ended) { video.currentTime = 0; lastTime = 0; }
    video.muted = false;
    hideUnmute();
    video.play();
  });

  /* ---------- controls ---------- */
  const togglePlay = () => (video.paused ? video.play() : video.pause());

  video.addEventListener('click', () => {
    if (!unmuteBtn.hidden) unmute();
    else togglePlay();
  });

  btn('play').addEventListener('click', togglePlay);
  btn('back').addEventListener('click', () => seekTo(video.currentTime - BACK_SECONDS));
  btn('mute').addEventListener('click', () => {
    if (!unmuteBtn.hidden) { unmute(); return; }
    video.muted = !video.muted;
  });

  btn('fullscreen').addEventListener('click', () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (frame.requestFullscreen || frame.webkitRequestFullscreen) {
      (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame);
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen(); // iPhone: native player; 'seeking' guard still applies
    }
  });

  const onFsChange = () => {
    frame.classList.toggle('is-fullscreen', !!(document.fullscreenElement || document.webkitFullscreenElement));
  };
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  /* ---------- progress bar ---------- */
  const barTime = (clientX) => {
    const r = bar.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * (video.duration || 0);
  };

  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    seekTo(barTime(e.clientX));
  });
  bar.addEventListener('pointermove', (e) => { if (dragging) seekTo(barTime(e.clientX)); });
  const endDrag = () => { dragging = false; };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { seekTo(video.currentTime - 5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { seekTo(video.currentTime + 5); e.preventDefault(); }
  });

  /* ---------- auto-hide controls while playing ---------- */
  let idleTimer;
  const wake = () => {
    frame.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!video.paused && !dragging) frame.classList.add('is-idle');
    }, IDLE_MS);
  };
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => frame.addEventListener(ev, wake));
  video.addEventListener('play', wake);
  video.addEventListener('pause', wake);

  video.addEventListener('contextmenu', (e) => e.preventDefault());

  renderState();
  autoplay();
})();
