(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const show = cents => money.format(cents / 100);

  // Counts a number from its current value to the next, so a budget visibly drains or refills.
  function countTo(el, cents) {
    const from = Number(el.dataset.cents ?? cents);
    el.dataset.cents = String(cents);
    cancelAnimationFrame(Number(el.dataset.frame));
    if (reduceMotion.matches || from === cents) {
      el.textContent = show(cents);
      return;
    }
    const start = performance.now();
    const duration = 450;
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = show(Math.round(from + (cents - from) * eased));
      if (t < 1) el.dataset.frame = String(requestAnimationFrame(step));
    };
    el.dataset.frame = String(requestAnimationFrame(step));
  }

  // Grocery fund: three people, $50 a day each; anything bigger needs 2 of 3.
  const fund = document.querySelector('[data-fund]');
  if (fund) {
    const allowance = 5000;
    const need = 2;
    const names = ['You', 'Sam', 'Lee'];
    const state = { day: 1, balance: 45000, left: [allowance, allowance, allowance], payer: 0, vote: null };

    const amount = fund.querySelector('#expense');
    const presets = fund.querySelectorAll('[data-amount]');
    const radios = fund.querySelectorAll('input[name="payer"]');
    const lefts = fund.querySelectorAll('[data-left]');
    const bars = fund.querySelectorAll('[data-bar]');
    const outcome = fund.querySelector('[data-outcome]');
    const verdict = fund.querySelector('[data-verdict]');
    const remaining = fund.querySelector('[data-remaining]');
    const payButton = fund.querySelector('[data-pay]');
    const tomorrow = fund.querySelector('[data-tomorrow]');
    const vote = fund.querySelector('[data-vote]');
    const voteTitle = fund.querySelector('[data-vote-title]');
    const voters = fund.querySelector('[data-voters]');
    const log = fund.querySelector('[data-log]');
    const balance = fund.querySelector('[data-balance]');
    const day = fund.querySelector('[data-day]');
    const payerName = fund.querySelector('[data-payer-name]');

    const yours = i => (i === 0 ? 'your' : names[i] + '’s');
    const cents = () => {
      const value = Math.round(amount.valueAsNumber * 100);
      return amount.validity.valid && Number.isFinite(value) && value > 0 ? value : null;
    };

    // Only committed outcomes pulse; typing an amount updates the text quietly.
    function setResult(kind, title, detail, pulse = false) {
      outcome.dataset.state = kind;
      verdict.textContent = title;
      remaining.textContent = detail;
      if (!pulse) return;
      outcome.classList.remove('pulse');
      void outcome.offsetWidth;
      outcome.classList.add('pulse');
    }

    function drawPeople() {
      state.left.forEach((left, i) => {
        countTo(lefts[i], left);
        bars[i].style.setProperty('--fill', String(left / allowance));
      });
      countTo(balance, state.balance);
      day.textContent = 'Day ' + state.day;
    }

    function addLog(text, kind) {
      const item = document.createElement('li');
      item.dataset.kind = kind;
      item.textContent = text;
      log.prepend(item);
      while (log.children.length > 4) log.lastElementChild.remove();
      log.hidden = false;
    }

    // Shows what would happen before anything is sent.
    function preview() {
      const value = cents();
      const who = state.payer;
      payerName.textContent = names[who];
      for (const preset of presets) {
        preset.setAttribute('aria-pressed', String(Math.round(Number(preset.dataset.amount) * 100) === value));
      }
      if (state.vote) return;
      payButton.disabled = value === null;
      if (value === null) {
        payButton.textContent = 'Pay';
        setResult('invalid', 'Enter an amount.', 'Try something between $0.01 and $10,000.');
      } else if (value > state.balance) {
        payButton.disabled = true;
        payButton.textContent = 'Pay ' + show(value);
        setResult('rejected', 'More than the fund holds.', 'The fund has ' + show(state.balance) + '. No vote can spend money that is not there.');
      } else if (value <= state.left[who]) {
        payButton.textContent = 'Pay ' + show(value);
        setResult('ready', 'Within ' + yours(who) + ' budget.', (who === 0 ? 'You' : names[who]) + ' would have ' + show(state.left[who] - value) + ' left today. No one else needs to sign.');
      } else {
        payButton.textContent = 'Ask the group';
        setResult('over', show(value - state.left[who]) + ' over ' + yours(who) + ' budget.', 'Sent alone, it would be refused. Ask the group: it needs ' + need + ' of 3, and ' + (who === 0 ? 'you count' : names[who] + ' counts') + ' as one.');
      }
    }

    function pay() {
      const value = cents();
      if (value === null) return;
      const who = state.payer;
      if (value <= state.left[who]) {
        state.left[who] -= value;
        state.balance -= value;
        drawPeople();
        addLog(names[who] + ' paid ' + show(value) + ' from ' + yours(who) + ' budget.', 'paid');
        preview();
        setResult('approved', 'Paid.', (who === 0 ? 'You have ' : names[who] + ' has ') + show(state.left[who]) + ' left today.', true);
        return;
      }
      startVote(who, value);
    }

    function startVote(who, value) {
      state.vote = { who, value, answers: names.map((_, i) => (i === who ? true : null)) };
      voteTitle.textContent = names[who] + (who === 0 ? ' ask' : ' asks') + ' the group to pay ' + show(value) + '. It needs ' + need + ' of 3.';
      voters.replaceChildren(...names.map((name, i) => {
        const row = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = name;
        row.append(label);
        if (i === who) {
          const done = document.createElement('span');
          done.className = 'said yes';
          done.textContent = 'Approved';
          row.append(done);
        } else {
          for (const [text, answer] of [['Approve', true], ['Decline', false]]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.className = answer ? 'yes' : 'no';
            button.addEventListener('click', () => answerVote(i, answer, row));
            row.append(button);
          }
        }
        return row;
      }));
      vote.hidden = false;
      payButton.hidden = true;
      amount.disabled = true;
      for (const radio of radios) radio.disabled = true;
      for (const preset of presets) preset.disabled = true;
      setResult('waiting', 'Waiting for the group.', 'Nothing has moved. Answer as ' + names.filter((_, i) => i !== who).join(' and ') + '.', true);
      voters.querySelector('button')?.focus();
    }

    function answerVote(i, answer, row) {
      const { who, value, answers } = state.vote;
      answers[i] = answer;
      const said = document.createElement('span');
      said.className = 'said ' + (answer ? 'yes' : 'no');
      said.textContent = answer ? 'Approved' : 'Declined';
      row.querySelectorAll('button').forEach(button => button.remove());
      row.append(said);

      const yes = answers.filter(a => a === true).length;
      const no = answers.filter(a => a === false).length;
      if (yes >= need) {
        state.balance -= value;
        drawPeople();
        addLog('The group approved ' + show(value) + ' for ' + names[who] + '.', 'voted');
        endVote('approved', 'Approved by ' + yes + ' of 3. Paid.', 'It came from the fund, not from anyone’s daily budget.');
      } else if (names.length - no < need) {
        addLog('The group declined ' + show(value) + '. Nothing moved.', 'declined');
        endVote('rejected', 'Declined.', 'Not enough people said yes, so nothing left the fund.');
      } else {
        setResult('waiting', yes + ' of ' + need + ' approvals.', 'One more answer decides it.');
      }
    }

    function endVote(kind, title, detail) {
      state.vote = null;
      vote.hidden = true;
      payButton.hidden = false;
      amount.disabled = false;
      for (const radio of radios) radio.disabled = false;
      for (const preset of presets) preset.disabled = false;
      preview();
      setResult(kind, title, detail, true);
      payButton.focus();
    }

    amount.addEventListener('input', preview);
    amount.addEventListener('keydown', event => {
      if (event.key === 'Enter') pay();
    });
    for (const preset of presets) {
      preset.addEventListener('click', () => {
        amount.value = Number(preset.dataset.amount).toFixed(2);
        preview();
      });
    }
    for (const radio of radios) {
      radio.addEventListener('change', () => {
        state.payer = Number(radio.value);
        preview();
      });
    }
    payButton.addEventListener('click', pay);
    tomorrow.addEventListener('click', () => {
      if (state.vote) return;
      state.day += 1;
      state.left = state.left.map(() => allowance);
      drawPeople();
      addLog('Day ' + state.day + ': every budget is back to $50.00.', 'day');
      preview();
    });

    lefts.forEach((el, i) => { el.dataset.cents = String(state.left[i]); });
    balance.dataset.cents = String(state.balance);
    preview();
  }

  // Kinds: a web port of the app's "Create a Venn" carousel. Each card scales as one solid piece
  // (padding and content grow with it, nothing moves inside). The card contents and their
  // interactive parts come from kinds.js. Scroll position is the clock, so nothing here is eased.
  const deck = document.querySelector('[data-deck]');
  if (deck) {
    const track = deck.querySelector('[data-track]');
    const cards = [...track.querySelectorAll('.pick')];
    const dots = [...deck.querySelectorAll('[data-dots] button')];
    const arrows = deck.querySelectorAll('[data-step]');
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    // Dimming a light card over the dark page turns it grey, so dark mode only scales.
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    let frame = 0;

    const interval = () => cards[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || '0');
    const position = () => track.scrollLeft / interval();
    const current = () => Math.round(position());

    function render() {
      frame = 0;
      const at = position();
      cards.forEach((card, i) => {
        const distance = Math.min(1, Math.abs(at - i));
        if (!reduceMotion.matches) {
          card.style.transform = `scale(${1 - 0.06 * distance})`;
          card.style.opacity = dark.matches ? '' : String(1 - 0.3 * distance);
        }
        card.classList.toggle('is-side', Math.round(at) !== i);
      });
      dots.forEach((dot, i) => {
        dot.style.setProperty('--d', String(Math.min(1, Math.abs(at - i))));
        dot.setAttribute('aria-current', String(Math.round(at) === i));
      });
      arrows[0].disabled = at < 0.5;
      arrows[1].disabled = at > cards.length - 1.5;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

    const goTo = index => {
      const i = clamp(index, 0, cards.length - 1);
      track.scrollTo({ left: i * interval(), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    };
    dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
    arrows.forEach(arrow => arrow.addEventListener('click', () => goTo(current() + Number(arrow.dataset.step))));
    track.addEventListener('keydown', event => {
      if (event.target !== track || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      goTo(current() + (event.key === 'ArrowRight' ? 1 : -1));
    });
    track.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    dark.addEventListener('change', schedule);

    // A card's last part offers the next kind.
    track.addEventListener('venn:next', event => goTo(event.detail.index + 1 < cards.length ? event.detail.index + 1 : 0));

    // Tapping a card at the side brings it to the centre instead of pressing what's inside it.
    cards.forEach((card, i) => card.addEventListener('click', event => {
      if (current() === i) return;
      event.preventDefault();
      event.stopPropagation();
      goTo(i);
    }, true));

    // Mouse drag, like a finger: the card follows the pointer, then a flick or the nearest card wins.
    // The drag only starts after a few pixels, so clicks on buttons inside a card still work.
    let drag = null;
    let dragEnded = -Infinity;
    track.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if (event.target.closest('input, label')) return;
      drag = { id: event.pointerId, x: event.clientX, left: track.scrollLeft, start: position(), v: 0, last: event.clientX, t: performance.now(), on: false };
    });
    track.addEventListener('pointermove', event => {
      if (!drag) return;
      if (!drag.on) {
        if (Math.abs(event.clientX - drag.x) < 6) return;
        drag.on = true;
        track.setPointerCapture(drag.id);
        track.classList.add('dragging');
      }
      const now = performance.now();
      drag.v = (event.clientX - drag.last) / Math.max(1, now - drag.t);
      drag.last = event.clientX;
      drag.t = now;
      track.scrollLeft = drag.left - (event.clientX - drag.x);
    });
    const release = () => {
      if (!drag) return;
      const was = drag;
      drag = null;
      if (!was.on) return;
      dragEnded = performance.now();
      const flick = Math.abs(was.v) > 0.4 ? -Math.sign(was.v) : 0;
      const target = flick ? Math.round(was.start) + flick : current();
      track.classList.remove('dragging');
      goTo(target);
    };
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    // A drag that ends over a button must not press it.
    track.addEventListener('click', event => {
      if (performance.now() - dragEnded > 80) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    render();
  }

  // Try to break it: plays out an attempt line by line.
  const replay = document.querySelector('[data-replay]');
  if (replay) {
    const scripts = {
      creator: [
        ['step', 'Alex set up the Venn and tries to send all $450 to themselves.'],
        ['step', 'A payment that big needs 2 of 3 approvals. Alex has 1.'],
        ['fail', 'Refused. The fund still holds $450.'],
      ],
      overspend: [
        ['step', 'Sam has $50 left today and signs an $80 payment alone.'],
        ['step', 'The contract checks Sam’s budget before anything moves.'],
        ['fail', 'Refused. Sam still has $50 left.'],
      ],
      phone: [
        ['step', 'Lee loses their phone with their seat on it.'],
        ['step', 'Lee’s friends ask to move the seat to Lee’s new phone. A waiting period starts.'],
        ['step', 'If the old phone turns up, Lee can cancel the move from it.'],
        ['ok', 'After the wait, the seat moves. Lee’s budget and vote come back.'],
      ],
    };
    const buttons = document.querySelectorAll('[data-attack]');
    let timers = [];
    for (const button of buttons) {
      button.hidden = false;
      button.addEventListener('click', () => {
        timers.forEach(clearTimeout);
        timers = [];
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
        replay.replaceChildren();
        replay.hidden = false;
        const gap = reduceMotion.matches ? 0 : 650;
        scripts[button.dataset.attack].forEach(([kind, text], i) => {
          timers.push(setTimeout(() => {
            const line = document.createElement('li');
            line.dataset.kind = kind;
            line.textContent = text;
            replay.append(line);
          }, i * gap));
        });
      });
    }
  }

  // Header: marks the section in view.
  const navLinks = [...document.querySelectorAll('.top nav a[href^="#"]')];
  if (navLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(navLinks.map(link => [link.getAttribute('href').slice(1), link]));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const link = byId.get(entry.target.id);
        if (!link) continue;
        if (entry.isIntersecting) {
          navLinks.forEach(other => other.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'location');
        } else if (link.hasAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const id of byId.keys()) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
  }

  const checklist = document.querySelector('[data-checklist]');
  if (!checklist) return;

  const tasks = [...checklist.querySelectorAll('input[type="checkbox"]')];
  const progress = checklist.querySelector('progress');
  const count = checklist.querySelector('[data-count]');
  const storageKey = 'venn-blaze-2026-publishing';

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) {
      for (const task of tasks) task.checked = stored.includes(task.id);
    }
  } catch {
    // The checklist still works for this session when storage is unavailable.
  }

  function showProgress() {
    const completed = tasks.filter((task) => task.checked).map((task) => task.id);
    progress.value = completed.length;
    progress.max = tasks.length;
    count.textContent = completed.length + ' of ' + tasks.length + ' complete';
    return completed;
  }

  checklist.addEventListener('change', () => {
    const completed = showProgress();
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(completed));
    } catch {
      // Some file URLs and private browsing modes restrict storage.
    }
  });
  showProgress();
})();
