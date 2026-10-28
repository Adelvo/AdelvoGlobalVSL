/* ==========================================================================
   APPLICATION FORM (multi-step qualification popup)
   Opens from any link to #apply.
   ========================================================================== */
(() => {
  // Booking page shown after the last question. Answers are prefilled via URL:
  // name + email, and a1..a6 = the event's custom questions in Calendly order.
  const CALENDLY_URL = 'https://calendly.com/adelvo-global/new-meeting';
  const CALENDLY_FIELDS = {
    a1: 'business_sells',     // What does your business sell?
    a2: 'client_value',       // What is your average client value?
    a3: 'ideal_customer',     // Who is your ideal customer?
    a4: 'current_acquisition', // How are you currently getting clients?
    a5: 'used_cold_email',    // Have you used cold email before?
    a6: 'website',            // What is your business website?
  };

  // Optional: also send every finished application (POST, JSON) to a webhook,
  // e.g. Zapier / Make / Formspree. Leave empty to skip.
  // If you set this, update PRIVACY_NOTE and the Privacy Policy first: both
  // currently say answers only leave the browser at the Calendly booking step.
  const FORM_ENDPOINT = '';

  // Shown from the first question that asks for personal data (trusted HTML, not user input)
  const PRIVACY_NOTE =
    'Your answers stay in your browser until the booking step. There they’re passed to Calendly ' +
    'to fill in your booking, and we use them to check if we’re a fit and to prepare for your call. ' +
    'See our <a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>.';

  const STEPS = [
    {
      id: 'customer_value_over_3k',
      type: 'choice',
      q: 'Is your average customer worth more than $3,000?',
      options: [{ label: 'Yes' }, { label: 'No', disqualify: 'roi' }],
    },
    {
      id: 'b2b_offer',
      type: 'choice',
      q: 'Do you have a B2B offer?',
      options: [{ label: 'Yes' }, { label: 'No', disqualify: 'b2b' }],
    },
    {
      id: 'name',
      type: 'text',
      q: 'What is your full name?',
      autocomplete: 'name',
      note: PRIVACY_NOTE,
    },
    {
      id: 'business_sells',
      type: 'text',
      multiline: true,
      q: () => `Nice to meet you, ${firstName()}. What does your business sell?`,
    },
    {
      id: 'website',
      type: 'url',
      q: 'What is your business website?',
      autocomplete: 'url',
      placeholder: 'yourcompany.com',
    },
    {
      id: 'client_value',
      type: 'choice',
      q: 'What is your average client value?',
      options: [{ label: '$3k – $5k' }, { label: '$5k – $10k' }, { label: '$10k+' }],
    },
    {
      id: 'ideal_customer',
      type: 'text',
      multiline: true,
      q: 'Who is your ideal customer?',
    },
    {
      id: 'current_acquisition',
      type: 'multi',
      q: 'How are you currently getting clients?',
      options: [
        { label: 'Referrals' },
        { label: 'Cold Email' },
        { label: 'Paid Ads' },
        { label: 'Content / Organic' },
        { label: 'Cold Calling' },
        { label: 'Other' },
      ],
    },
    {
      id: 'used_cold_email',
      type: 'choice',
      q: 'Have you used cold email before?',
      options: [{ label: 'Yes' }, { label: 'No' }],
    },
    {
      id: 'email',
      type: 'email',
      q: 'Last one — what’s the best email to reach you?',
      autocomplete: 'email',
      placeholder: 'name@company.com',
      note: PRIVACY_NOTE,
    },
  ];

  const DISQUALIFY = {
    roi: {
      title: 'Unfortunately, this isn’t a fit right now.',
      text: 'Cold email takes time, infrastructure and real effort to run properly. If your average customer is worth less than $3,000, the numbers usually don’t work out and there’s no real ROI for you. I’d rather be honest than waste your time.',
    },
    b2b: {
      title: 'Cold email only really works for B2B.',
      text: 'Cold email works best when you’re selling to other businesses. Since your offer isn’t B2B, I can’t get you the results I’d want to deliver — so I won’t take it on.',
    },
  };

  const root = document.getElementById('apply');
  if (!root) return;

  const card = root.querySelector('.apply__card');
  const body = root.querySelector('.apply__body');
  const bar = root.querySelector('.apply__bar');
  const footer = root.querySelector('.apply__footer');
  const backBtn = root.querySelector('.apply__back');
  const counter = root.querySelector('.apply__count');

  const answers = {};
  let index = 0;
  let screen = 'step'; // 'step' | 'dq' | 'book' | 'done'
  let lastFocus = null;
  let busy = false;

  const CHECK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function firstName() {
    return (answers.name || '').trim().split(/\s+/)[0] || '';
  }

  /* ---------- open / close ---------- */
  function open() {
    if (!root.hidden) return;
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('apply-open');
    if (screen === 'done') reset();
    render();
  }

  function close() {
    root.hidden = true;
    document.documentElement.classList.remove('apply-open');
    if (location.hash === '#apply') {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (lastFocus) lastFocus.focus();
  }

  function reset() {
    Object.keys(answers).forEach((k) => delete answers[k]);
    index = 0;
    screen = 'step';
  }

  /* ---------- rendering ---------- */
  function setFrame() {
    const progress = screen === 'done' ? 1 : screen === 'book' ? 0.95 : index / STEPS.length;
    bar.style.width = `${Math.max(progress * 100, 4)}%`;
    card.classList.toggle('apply__card--wide', screen === 'book');
    footer.hidden = screen === 'done';
    backBtn.hidden = screen === 'step' && index === 0;
    counter.textContent = screen === 'book' ? 'Final step' : `${index + 1} / ${STEPS.length}`;
  }

  function swap(html) {
    body.innerHTML = html;
    body.classList.remove('is-entering');
    void body.offsetWidth; // restart entrance animation
    body.classList.add('is-entering');
  }

  function render() {
    screen = 'step';
    const step = STEPS[index];
    const q = typeof step.q === 'function' ? step.q() : step.q;
    let field;

    const okRow = (hint) => `
        <p class="apply__error" role="alert"></p>
        <div class="apply__ok-row">
          <button type="submit" class="apply__ok">${index === STEPS.length - 1 ? 'Pick a time' : 'OK'} ${CHECK_ICON}</button>
          <span class="apply__hint">${hint}</span>
        </div>`;

    if (step.type === 'choice' || step.type === 'multi') {
      const multi = step.type === 'multi';
      const picked = multi ? (answers[step.id] || '').split(', ') : [answers[step.id]];
      field =
        (multi ? '<p class="apply__sub">Choose as many as you like.</p>' : '') +
        `<div class="apply__choices${multi ? ' apply__choices--multi' : ''}" role="group" aria-labelledby="apply-q">` +
        step.options
          .map((o, i) => {
            const on = picked.includes(o.label);
            const selected = on ? ' is-selected' : '';
            const pressed = multi ? ` aria-pressed="${on}"` : '';
            return `<button type="button" class="apply__choice${selected}" data-option="${i}"${pressed}>
                <span class="apply__key">${String.fromCharCode(65 + i)}</span>
                <span class="apply__choice-label">${esc(o.label)}</span>
                <span class="apply__choice-check">${CHECK_ICON}</span>
              </button>`;
          })
          .join('') +
        '</div>' +
        (multi ? okRow('press <strong>Enter ↵</strong>') : '');
    } else {
      const value = esc(answers[step.id] || '');
      const placeholder = esc(step.placeholder || 'Type your answer…');
      field = step.multiline
        ? `<textarea class="apply__input" id="apply-input" rows="1" placeholder="${placeholder}" aria-labelledby="apply-q">${value}</textarea>`
        : `<input class="apply__input" id="apply-input" type="${step.type}" placeholder="${placeholder}"
             autocomplete="${step.autocomplete || 'off'}" value="${value}" aria-labelledby="apply-q" />`;
      const hint = step.multiline ? 'press <strong>Enter ↵</strong> · Shift + Enter for new line' : 'press <strong>Enter ↵</strong>';
      field += okRow(hint);
    }
    if (step.note) field += `<p class="apply__privacy">${step.note}</p>`;

    swap(`
      <form class="apply__step" novalidate>
        <p class="apply__num">${index + 1} <span aria-hidden="true">→</span></p>
        <h2 id="apply-q" class="apply__q">${esc(q)}</h2>
        ${field}
      </form>`);
    setFrame();

    const input = body.querySelector('.apply__input');
    if (input) {
      autoGrow(input);
      input.focus({ preventScroll: true });
      const len = input.value.length;
      input.setSelectionRange?.(len, len);
    } else {
      body.querySelector('.apply__choice')?.focus({ preventScroll: true });
    }
  }

  function renderMessage({ title, text, actions }) {
    swap(`
      <div class="apply__message">
        <h2 id="apply-q" class="apply__q">${esc(title)}</h2>
        <p class="apply__text">${esc(text)}</p>
        <div class="apply__ok-row">${actions}</div>
      </div>`);
    setFrame();
    body.querySelector('button')?.focus({ preventScroll: true });
  }

  function showDisqualified(reason) {
    screen = 'dq';
    renderMessage({
      ...DISQUALIFY[reason],
      actions: '<button type="button" class="apply__ok" data-action="close">Close</button>' +
               '<button type="button" class="apply__link" data-action="back">Change my answer</button>',
    });
  }

  function calendlyLink({ embed }) {
    const params = new URLSearchParams({ name: answers.name || '', email: answers.email || '' });
    Object.entries(CALENDLY_FIELDS).forEach(([key, id]) => {
      if (answers[id]) params.set(key, answers[id]);
    });
    if (embed) {
      params.set('embed_type', 'Inline');
      params.set('embed_domain', location.hostname || 'localhost');
      // Calendly's own cookie banner is intentionally NOT hidden (no hide_gdpr_banner=1):
      // Calendly sets non-essential cookies and this site has no consent tool of its own.
      params.set('hide_landing_page_details', '1');
    }
    return `${CALENDLY_URL}?${params}`;
  }

  function showBooking() {
    screen = 'book';
    const name = firstName();
    swap(`
      <div class="apply__book">
        <h2 id="apply-q" class="apply__q">${esc(name ? `Great, ${name}! You’re a fit.` : 'Great! You’re a fit.')} Pick a time for your strategy call.</h2>
        <p class="apply__text">Your answers are already filled in — just choose a time and confirm.</p>
        <p class="apply__privacy">We may want to record and transcribe the call with an AI note-taking tool, for onboarding,
          documentation and service delivery. Booking the call does not mean you agree to this. You can say no, and the call
          goes ahead without it. <a href="privacy-policy.html#recording" target="_blank" rel="noopener">Learn more</a></p>
        <div class="apply__calendly">
          <iframe src="${esc(calendlyLink({ embed: true }))}" title="Book your strategy call" loading="eager"></iframe>
        </div>
        <a class="apply__link" href="${esc(calendlyLink({ embed: false }))}" target="_blank" rel="noopener">Calendar not loading? Open the booking page in a new tab</a>
      </div>`);
    setFrame();
  }

  function showDone() {
    screen = 'done';
    const name = firstName();
    renderMessage({
      title: name ? `You’re booked, ${name}!` : 'You’re booked!',
      text: `Your strategy call is confirmed. You’ll get a confirmation email from Calendly at ${answers.email} with all the details. Talk soon!`,
      actions: '<button type="button" class="apply__ok" data-action="close">Done</button>',
    });
  }

  /* ---------- flow ---------- */
  function next() {
    if (index < STEPS.length - 1) {
      index += 1;
      render();
    } else {
      submit();
    }
  }

  function back() {
    if (screen === 'dq' || screen === 'book') return render();
    if (index > 0) {
      index -= 1;
      render();
    }
  }

  function choose(i) {
    if (busy) return;
    const step = STEPS[index];
    const option = step.options[i];
    answers[step.id] = option.label;
    body.querySelectorAll('.apply__choice').forEach((b, j) => b.classList.toggle('is-selected', j === i));
    busy = true;
    setTimeout(() => {
      busy = false;
      option.disqualify ? showDisqualified(option.disqualify) : next();
    }, 280);
  }

  function toggle(i) {
    const btn = body.querySelector(`.apply__choice[data-option="${i}"]`);
    const on = !btn.classList.contains('is-selected');
    btn.classList.toggle('is-selected', on);
    btn.setAttribute('aria-pressed', String(on));
    const error = body.querySelector('.apply__error');
    if (error) error.textContent = '';
  }

  function validate(step, value) {
    if (!value) return 'Please fill this in.';
    if (step.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address.';
    if (step.id === 'name' && value.length < 2) return 'Please enter your full name.';
    if (step.type === 'url' && !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(value)) {
      return 'Please enter a valid website, e.g. yourcompany.com';
    }
    return '';
  }

  // "yourcompany.com" -> "https://yourcompany.com"
  function normalizeUrl(value) {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  }

  function submit() {
    // Optional webhook copy; never blocks the prospect from booking.
    if (FORM_ENDPOINT) {
      const payload = { ...answers, submitted_at: new Date().toISOString(), page: location.href };
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch((err) => console.error('[apply] Webhook failed:', err));
    }
    showBooking();
  }

  // Calendly reports a finished booking via postMessage
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://calendly.com' || screen !== 'book') return;
    if (e.data && e.data.event === 'calendly.event_scheduled') showDone();
  });

  function autoGrow(el) {
    if (el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('a[href="#apply"]');
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-apply-close]')) return close();
    const choice = e.target.closest('.apply__choice');
    if (choice) {
      const i = Number(choice.dataset.option);
      return STEPS[index].type === 'multi' ? toggle(i) : choose(i);
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') return close();
    if (action === 'back') return back();
  });

  backBtn.addEventListener('click', back);

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const step = STEPS[index];
    if (step.type === 'multi') {
      const picked = [...body.querySelectorAll('.apply__choice.is-selected')]
        .map((b) => step.options[Number(b.dataset.option)].label);
      if (!picked.length) {
        body.querySelector('.apply__error').textContent = 'Please choose at least one option.';
        return;
      }
      answers[step.id] = picked.join(', ');
      return next();
    }
    const input = body.querySelector('.apply__input');
    const value = input.value.trim();
    const message = validate(step, value);
    if (message) {
      body.querySelector('.apply__error').textContent = message;
      input.focus();
      return;
    }
    answers[step.id] = step.type === 'url' ? normalizeUrl(value) : value;
    next();
  });

  body.addEventListener('input', (e) => {
    if (!e.target.classList.contains('apply__input')) return;
    autoGrow(e.target);
    const error = body.querySelector('.apply__error');
    if (error) error.textContent = '';
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();

    // Enter submits a textarea; Shift + Enter adds a new line
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA') {
      e.preventDefault();
      e.target.form.requestSubmit();
      return;
    }

    // Letter shortcuts (A, B, C) on choice steps
    const type = screen === 'step' ? STEPS[index].type : '';
    // Multi-select: Enter on a focused option continues instead of toggling it
    if (type === 'multi' && e.key === 'Enter' && e.target.classList.contains('apply__choice')) {
      e.preventDefault();
      body.querySelector('form').requestSubmit();
      return;
    }
    if ((type === 'choice' || type === 'multi') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = e.key.toUpperCase().charCodeAt(0) - 65;
      if (e.key.length === 1 && i >= 0 && i < STEPS[index].options.length) {
        e.preventDefault();
        type === 'multi' ? toggle(i) : choose(i);
        return;
      }
    }

    // Keep focus inside the popup
    if (e.key === 'Tab') {
      const focusable = [...card.querySelectorAll('button:not([hidden]):not([disabled]), input, textarea')]
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  if (location.hash === '#apply') open();
})();
