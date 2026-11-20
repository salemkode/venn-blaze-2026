// The four kinds of Venn as hands-on cards. Each card has four parts (basics, spending,
// voting, weakness); every part explains one rule and lets the visitor act it out.
// Numbers follow the app's presets for three people: $50 daily budgets, 2 of 3 votes,
// a 7-day recovery wait (14 days for the stronger request), and 30-day Circle rounds.
(() => {
  const deck = document.querySelector('[data-deck]');
  if (!deck) return;

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  // Whole dollars read as "$50"; anything else keeps its cents, "$12.50".
  const usd = dollars => (Number.isInteger(dollars) ? `$${dollars}` : money.format(dollars));
  const NAMES = ['You', 'Sam', 'Lee'];
  const SEAT_X = [53, 160, 267];
  const NODE_X = [70, 160, 250];
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  };
  const svg = markup => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg viewBox="0 0 320 186" aria-hidden="true">${markup}</svg>`;
    return wrap.firstChild;
  };
  const check = (x, y) => `<path class="check" d="M${x - 12} ${y - 1} l8 9 17 -19"/>`;
  const cross = (x, y) => `<path class="cross" d="M${x - 9} ${y - 9} l18 18 M${x + 9} ${y - 9} l-18 18"/>`;

  // People above a shared hub. Tapping a person calls onPick(i).
  function hub(ui, { label, links = ['solid', 'solid', 'solid'], onPick, sub = '' }) {
    const art = svg(`
      ${NODE_X.map((x, i) => `<line class="link ${links[i]}" x1="${x}" y1="82" x2="${160 + (x - 160) * 0.35}" y2="112"/>`).join('')}
      <g class="hub" data-hub><circle cx="160" cy="142" r="32"/><text x="160" y="${sub ? 139 : 147}" text-anchor="middle" font-size="15" font-weight="700">${label}</text>
      ${sub ? `<text x="160" y="157" text-anchor="middle" font-size="13" data-hub-sub>${sub}</text>` : ''}</g>
      ${NODE_X.map((x, i) => `<g class="node" data-node="${i}" role="button" tabindex="0" aria-label="${NAMES[i]}">
        <circle cx="${x}" cy="52" r="30"/><text x="${x}" y="57" text-anchor="middle" font-size="15" font-weight="600">${NAMES[i]}</text></g>`).join('')}`);
    art.querySelectorAll('[data-node]').forEach(node => {
      const pick = () => onPick(Number(node.dataset.node), art);
      node.addEventListener('click', pick);
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); }
      });
    });
    ui.stage(art);
    return art;
  }
  const select = (art, i) => art.querySelectorAll('[data-node]').forEach(node => node.classList.toggle('on', Number(node.dataset.node) === i));

  // Three seats that approve (or decline) a payment.
  function seats(ui, { tags = [], dashed = [] } = {}) {
    const art = svg(`
      <line class="link solid" x1="53" y1="78" x2="267" y2="78"/>
      ${SEAT_X.map((x, i) => `<g class="seat${dashed.includes(i) ? ' away' : ''}" data-seat="${i}" role="button" tabindex="0" aria-pressed="false" aria-label="${NAMES[i]}">
        <circle class="ring" cx="${x}" cy="78" r="32"/>
        <circle class="stamp" cx="${x}" cy="78" r="32"/>${check(x, 78)}${cross(x, 78)}
        <text x="${x}" y="136" text-anchor="middle" font-size="15" font-weight="600">${NAMES[i]}</text>
        ${tags[i] ? `<text class="tag" x="${x}" y="156" text-anchor="middle" font-size="12">${tags[i]}</text>` : ''}</g>`).join('')}`);
    const set = (i, state) => {
      const seat = art.querySelector(`[data-seat="${i}"]`);
      seat.dataset.state = state || '';
      seat.setAttribute('aria-pressed', String(state === 'yes'));
    };
    const onTap = handler => art.querySelectorAll('[data-seat]').forEach(seat => {
      const tap = () => handler(Number(seat.dataset.seat));
      seat.addEventListener('click', tap);
      seat.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); tap(); }
      });
    });
    ui.stage(art);
    return { art, set, onTap };
  }

  // A vote on one payment: tap seats to approve. `required` must be among the approvals.
  function vote(ui, { item, amount, required = -1, intro }) {
    const votes = [false, false, false];
    const tags = NAMES.map((_, i) => (i === required ? 'must sign' : ''));
    const { set, onTap } = seats(ui, { tags });
    const show = () => {
      votes.forEach((yes, i) => set(i, yes ? 'yes' : ''));
      const yes = votes.filter(Boolean).length;
      const hasRequired = required < 0 || votes[required];
      if (yes >= 2 && hasRequired) ui.note('ok', `Approved by ${yes} of 3. The ${usd(amount)} ${item} is paid.`);
      else if (yes >= 2) ui.note('bad', 'Sam and Lee agree, but your signature is required. Nothing moves.');
      else if (yes === 1) ui.note('wait', `1 of 2 so far. The ${item} is pending until one more person approves.`);
      else ui.note('', intro);
    };
    onTap(i => { votes[i] = !votes[i]; show(); });
    ui.controls(el('button', { type: 'button', class: 'pick-btn quiet', text: 'Clear votes', onclick: () => { votes.fill(false); show(); } }));
    show();
  }

  // Budget bars for three people.
  function bars(ui, left, max = 50) {
    const art = svg(NAMES.map((name, i) => {
      const y = 8 + i * 60;
      return `<g data-row="${i}"><text x="18" y="${y + 14}" font-size="15" font-weight="600">${name}</text>
        <text x="302" y="${y + 14}" text-anchor="end" font-size="15" font-weight="600" data-value>${usd(left[i])} left</text>
        <rect class="track" x="18" y="${y + 24}" width="284" height="22" rx="11"/>
        <rect class="fill" x="18" y="${y + 24}" width="284" height="22" rx="11" data-fill style="transform: scaleX(${left[i] / max})"/></g>`;
    }).join(''));
    ui.stage(art);
    return {
      set(i, value, flash) {
        const row = art.querySelector(`[data-row="${i}"]`);
        row.querySelector('[data-fill]').style.transform = `scaleX(${value / max})`;
        row.querySelector('[data-value]').textContent = `${usd(value)} left`;
        row.classList.remove('refused', 'drained');
        void row.getBBox();
        if (flash) row.classList.add(flash);
      },
    };
  }

  // A labelled day track with a moving fill.
  function timeline(ui, { title, days, marks }) {
    const x = d => 24 + (272 * d) / days;
    const art = svg(`
      <text x="24" y="40" font-size="15" font-weight="600">${title}</text>
      <rect class="track" x="24" y="70" width="272" height="22" rx="11"/>
      <rect class="fill" x="24" y="70" width="272" height="22" rx="11" data-fill style="transform: scaleX(0)"/>
      ${marks.map(([d, label]) => `<line class="tick" x1="${x(d)}" y1="62" x2="${x(d)}" y2="100"/>
        <text x="${x(d)}" y="122" text-anchor="${d === 0 ? 'start' : d === days ? 'end' : 'middle'}" font-size="13">${label}</text>`).join('')}
      <text x="160" y="164" text-anchor="middle" font-size="15" font-weight="600" data-status></text>`);
    ui.stage(art);
    return {
      to(d, status = '') {
        art.querySelector('[data-fill]').style.transform = `scaleX(${d / days})`;
        art.querySelector('[data-status]').textContent = status;
      },
    };
  }

  const KINDS = {
    personal: {
      title: 'Personal',
      line: 'Your money, guarded by people you trust.',
      tabs: ['Basics', 'Spending', 'Voting', 'Weakness'],
      parts: [
        {
          title: 'Your own money, with a safety net.',
          body: 'You hold it and spend it. Two friends you trust stand behind you: they vote with you on big payments and can help if you lose your phone.',
          mount(ui) {
            const roles = [
              'You spend alone from a daily budget, and you sign every vote.',
              'Sam never spends. Sam votes with you on big payments and can help you get a new key.',
              'Lee never spends. Lee votes with you on big payments and can help you get a new key.',
            ];
            hub(ui, { label: 'Venn', links: ['solid', 'dash', 'dash'], onPick: (i, art) => { select(art, i); ui.note('', roles[i]); } });
            ui.note('', 'Tap a person to see what they can do.');
          },
        },
        {
          title: 'You, from a budget that refills.',
          body: 'Spend up to $50 a day without asking anyone. Spend it all and it comes back gradually over the next 24 hours.',
          mount(ui) {
            const art = svg(`
              <g class="grid">${[30, 84, 138].map(y => `<line x1="40" y1="${y}" x2="298" y2="${y}"/>`).join('')}</g>
              <g font-size="12" text-anchor="end"><text x="30" y="34">$50</text><text x="30" y="88">$25</text><text x="30" y="142">$0</text></g>
              <path class="area" data-area/><line class="stroke" x1="40" y1="138" data-line/>
              <circle class="head" r="11" data-head/><circle class="head-dot" r="4" data-head/>
              <g font-size="12"><text x="40" y="164">0 h</text><text x="169" y="164" text-anchor="middle">12 h</text><text x="298" y="164" text-anchor="end">24 h</text></g>`);
            ui.stage(art);
            const input = el('input', { type: 'range', min: '0', max: '24', step: '1', value: '6', 'aria-label': 'Hours since you spent your whole budget' });
            const draw = () => {
              const h = Number(input.value);
              const px = 40 + (258 * h) / 24;
              const py = 138 - (108 * h) / 24;
              art.querySelector('[data-area]').setAttribute('d', `M40 138 L${px} ${py} V138 Z`);
              const line = art.querySelector('[data-line]');
              line.setAttribute('x2', px);
              line.setAttribute('y2', py);
              art.querySelectorAll('[data-head]').forEach(c => { c.setAttribute('cx', px); c.setAttribute('cy', py); });
              const back = (50 * h) / 24;
              ui.note(h === 24 ? 'ok' : '', h === 0
                ? 'You just spent all $50. Drag to see it come back.'
                : h === 24 ? 'A day later, all $50 is back.' : `${h} ${h === 1 ? 'hour' : 'hours'} later: ${usd(Math.round(back * 100) / 100)} is back to spend.`);
            };
            input.addEventListener('input', draw);
            ui.controls(el('label', { class: 'pick-range' }, el('span', { text: 'Hours since you spent it all' }), input));
            draw();
          },
        },
        {
          title: 'Above your budget, a friend signs too.',
          body: 'A bigger payment needs 2 of 3 signatures, and one of them must be yours. Tap people to sign for a $120 laptop.',
          mount(ui) {
            vote(ui, { item: 'laptop', amount: 120, required: 0, intro: 'Nobody has signed yet. Try Sam and Lee without you.' });
          },
        },
        {
          title: 'Friends can move your seat to a new phone.',
          body: 'That saves you when a phone is lost. It also means both friends together could take your place.',
          mount(ui) {
            const line = timeline(ui, { title: 'Request to move your seat', days: 14, marks: [[0, 'Day 0'], [7, 'Day 7'], [14, 'Day 14']] });
            const lost = el('button', { type: 'button', class: 'pick-btn', text: 'I lost my phone' });
            const without = el('button', { type: 'button', class: 'pick-btn quiet', text: 'Friends act without me' });
            let step = 0;
            lost.addEventListener('click', () => {
              step = 0;
              without.textContent = 'Friends act without me';
              line.to(7, 'Day 7: your seat moves to your new phone');
              ui.note('ok', 'Both friends asked, you waited 7 days, and your budget and vote are back on your new phone.');
            });
            without.addEventListener('click', () => {
              if (step === 0) {
                line.to(3, 'Day 3: you stop it with your phone');
                ui.note('wait', 'The 7-day request can be stopped with your phone, so you cancel it.');
                without.textContent = 'They try the 14-day request';
                step = 1;
              } else {
                line.to(14, 'Day 14: they take over your seat');
                ui.note('bad', 'With both friends behind it, the stronger 14-day request can’t be stopped by you alone. Choose friends you trust.');
                without.textContent = 'Friends act without me';
                step = 0;
              }
            });
            ui.controls(lost, without);
            ui.note('', 'Try both: what happens when you lose your phone, and when friends act without you.');
          },
        },
      ],
    },
    shared: {
      title: 'Shared',
      line: 'For a household, a couple or a team.',
      tabs: ['Basics', 'Spending', 'Voting', 'Weakness'],
      parts: [
        {
          title: 'One fund, everyone’s own budget.',
          body: 'Groceries, rent, team tools. The money sits in one place, and each person gets $50 a day to spend from it.',
          mount(ui) {
            hub(ui, {
              label: 'Fund',
              onPick: (i, art) => {
                select(art, i);
                ui.note('', `${i === 0 ? 'You spend' : `${NAMES[i]} spends`} up to $50 a day alone, and ${i === 0 ? 'vote' : 'votes'} on anything bigger.`);
              },
            });
            ui.note('', 'Tap a person to see what they can do.');
          },
        },
        {
          title: 'Each person, within their budget.',
          body: 'Small payments need nobody’s permission. A payment above what you have left today is refused.',
          mount(ui) {
            const left = [50, 50, 50];
            const view = bars(ui, left);
            const pay = (i, amount, what) => {
              if (amount > left[i]) {
                view.set(i, left[i], 'refused');
                ui.note('bad', `Refused: ${i === 0 ? 'you have' : `${NAMES[i]} has`} only ${usd(left[i])} left today. Bigger payments go to a vote.`);
                return;
              }
              left[i] -= amount;
              view.set(i, left[i]);
              ui.note('ok', `${i === 0 ? 'You paid' : `${NAMES[i]} paid`} ${usd(amount)} for ${what}. ${i === 0 ? 'You have' : `${NAMES[i]} has`} ${usd(left[i])} left.`);
            };
            ui.controls(
              el('button', { type: 'button', class: 'pick-btn', text: 'You pay $20', onclick: () => pay(0, 20, 'groceries') }),
              el('button', { type: 'button', class: 'pick-btn', text: 'Sam pays $35', onclick: () => pay(1, 35, 'cleaning') }),
              el('button', { type: 'button', class: 'pick-btn quiet', text: 'Next day', onclick: () => { left.fill(50); left.forEach((v, i) => view.set(i, v)); ui.note('', 'A new day: every budget is back to $50.'); } }),
            );
            ui.note('', 'Pay a few times and see what happens when a budget runs out.');
          },
        },
        {
          title: 'A majority decides the big ones.',
          body: 'Anything above a budget needs 2 of the 3 of you. Tap people to approve a $300 sofa.',
          mount(ui) {
            vote(ui, { item: 'sofa', amount: 300, intro: 'Nobody has approved yet. Any two of you are enough.' });
          },
        },
        {
          title: 'Budgets can go at once, and you can be outvoted.',
          body: 'Each budget is a promise of what someone may spend, not how slowly. And the majority wins even when you say no.',
          mount(ui) {
            const allAtOnce = () => {
              const view = bars(ui, [50, 50, 50]);
              requestAnimationFrame(() => view.set(2, 0, 'drained'));
              ui.note('bad', 'Lee spent the whole $50 in one payment. That is allowed: it is within Lee’s budget for today.');
            };
            const outvoted = () => {
              const { set } = seats(ui);
              set(0, 'no');
              requestAnimationFrame(() => { set(1, 'yes'); set(2, 'yes'); });
              ui.note('bad', 'You said no to a $300 payment, but Sam and Lee said yes. 2 of 3 is a majority, so it is paid.');
            };
            ui.controls(
              el('button', { type: 'button', class: 'pick-btn', text: 'Lee spends it all', onclick: allAtOnce }),
              el('button', { type: 'button', class: 'pick-btn', text: 'You get outvoted', onclick: outvoted }),
            );
            bars(ui, [50, 50, 50]);
            ui.note('', 'Try both to see the catch before you join.');
          },
        },
      ],
    },
    pot: {
      title: 'Pot',
      line: 'Collect together for one goal.',
      tabs: ['Basics', 'Spending', 'Voting', 'Weakness'],
      parts: [
        {
          title: 'Everyone adds, nobody holds.',
          body: 'Save together for a trip, a gift or a project. Anyone can add money; nobody can take it out alone.',
          mount(ui) {
            let total = 0;
            const art = hub(ui, {
              label: 'Pot',
              sub: '$0',
              onPick: (i, view) => {
                total += 20;
                select(view, i);
                view.querySelector('[data-hub-sub]').textContent = usd(total);
                view.querySelector('[data-hub]').style.transform = `scale(${Math.min(1.35, 1 + total / 400)})`;
                ui.note('ok', `${i === 0 ? 'You added' : `${NAMES[i]} added`} $20. The Pot holds ${usd(total)} for the trip.`);
              },
            });
            art.classList.add('pot-hub');
            ui.note('', 'Tap people to add $20 each.');
          },
        },
        {
          title: 'Nobody spends alone. Not even you.',
          body: 'A Pot has no personal budgets. A payment sent by one person is refused, however small.',
          mount(ui) {
            const art = svg(`
              <g class="node on"><circle cx="70" cy="93" r="30"/><text x="70" y="98" text-anchor="middle" font-size="15" font-weight="600">You</text></g>
              <line class="link solid" x1="102" y1="93" x2="218" y2="93" data-path/>
              <g class="blocked" data-block>${cross(160, 93)}</g>
              <g class="hub"><circle cx="250" cy="93" r="32"/><text x="250" y="98" text-anchor="middle" font-size="15" font-weight="700">Pot</text></g>
              <text x="160" y="160" text-anchor="middle" font-size="15" font-weight="600" data-status></text>`);
            ui.stage(art);
            ui.controls(
              el('button', {
                type: 'button', class: 'pick-btn', text: 'Pay $90 alone',
                onclick: () => {
                  art.classList.remove('tried');
                  void art.getBBox();
                  art.classList.add('tried');
                  art.querySelector('[data-status]').textContent = 'Refused';
                  ui.note('bad', 'Refused. Even the person who made the Pot can’t pay alone: it needs 2 of 3 votes.');
                },
              }),
              el('button', { type: 'button', class: 'pick-btn quiet', text: 'Ask the group', onclick: () => ui.go(2) }),
            );
            ui.note('', 'Try paying the $90 deposit on your own.');
          },
        },
        {
          title: 'Two of three votes pay the deposit.',
          body: 'Every payment is a vote. Your vote leaves it pending; one more makes it happen.',
          mount(ui) {
            vote(ui, { item: 'deposit', amount: 90, intro: 'Tap You first, then Sam.' });
          },
        },
        {
          title: 'Slow when people are away.',
          body: 'If people don’t answer, nothing moves. That keeps the money safe, and it can also keep it stuck.',
          mount(ui) {
            const away = [false, false, false];
            const { set } = seats(ui);
            const draw = () => {
              away.forEach((a, i) => set(i, a ? 'away' : 'yes'));
              const here = away.filter(a => !a).length;
              if (here >= 2) ui.note('ok', `${here} of 3 can answer, and 2 are enough. Payments still go through.`);
              else ui.note('bad', 'Only you can answer. Nothing leaves the Pot until someone is back.');
            };
            const toggle = (i, button) => {
              away[i] = !away[i];
              button.setAttribute('aria-pressed', String(away[i]));
              draw();
            };
            const sam = el('button', { type: 'button', class: 'pick-btn toggle', 'aria-pressed': 'false', text: 'Sam is away' });
            const lee = el('button', { type: 'button', class: 'pick-btn toggle', 'aria-pressed': 'false', text: 'Lee is away' });
            sam.addEventListener('click', () => toggle(1, sam));
            lee.addEventListener('click', () => toggle(2, lee));
            ui.controls(sam, lee);
            draw();
          },
        },
      ],
    },
    circle: {
      title: 'Circle',
      line: 'A jam’eya: take turns receiving the pot.',
      tabs: ['Basics', 'Paying', 'Payout', 'Weakness'],
      parts: [
        {
          title: 'Pay in together, take turns.',
          body: 'Each round everyone pays $100 and one person receives the whole $300. The order is fixed before anyone joins.',
          mount(ui) {
            const stops = [-90, 30, 150];
            const art = svg(`
              <circle class="orbit" cx="160" cy="93" r="70"/>
              ${stops.map((a, i) => {
                const r = (a * Math.PI) / 180;
                const x = 160 + 70 * Math.cos(r);
                const y = 93 + 70 * Math.sin(r);
                const lx = i === 0 ? x + 18 : i === 1 ? x + 20 : x - 20;
                const ly = i === 0 ? y + 5 : y + 22;
                return `<circle class="stop" cx="${x}" cy="${y}" r="10"/><text x="${lx}" y="${ly}" text-anchor="${i === 2 ? 'end' : 'start'}" font-size="14" font-weight="600">${i + 1} · ${NAMES[i]}</text>`;
              }).join('')}
              <text x="160" y="90" text-anchor="middle" font-size="17" font-weight="700" data-round>Round 1</text>
              <text x="160" y="110" text-anchor="middle" font-size="13">$300 pot</text>
              <g class="spin" data-spin><circle class="token" cx="160" cy="23" r="13"/></g>`);
            ui.stage(art);
            let round = 0;
            const next = el('button', { type: 'button', class: 'pick-btn', text: 'Next round' });
            const draw = () => {
              art.querySelector('[data-spin]').style.transform = `rotate(${round * 120}deg)`;
              if (round < 3) {
                art.querySelector('[data-round]').textContent = `Round ${round + 1}`;
                ui.note('', `Round ${round + 1}: everyone pays $100, and ${round === 0 ? 'you receive' : `${NAMES[round]} receives`} $300.`);
                next.textContent = 'Next round';
              } else {
                art.querySelector('[data-round]').textContent = 'Done';
                ui.note('ok', 'Everyone paid $300 in total and received $300 once. The ones who went first got theirs earlier.');
                next.textContent = 'Start again';
              }
            };
            next.addEventListener('click', () => { round = round < 3 ? round + 1 : 0; draw(); });
            ui.controls(next);
            draw();
          },
        },
        {
          title: 'Everyone pays the same, every round.',
          body: 'The money waits in the Circle until everyone has paid. Then it goes to whoever’s turn it is, with no vote.',
          mount(ui) {
            const paid = [false, false, false];
            const { set, onTap } = seats(ui, { tags: ['receives', '', ''] });
            const draw = () => {
              paid.forEach((p, i) => set(i, p ? 'yes' : ''));
              const count = paid.filter(Boolean).length;
              if (count === 3) ui.note('ok', 'Everyone paid, so the Circle pays you $300 straight away. Round 2 is Sam’s turn.');
              else if (count) ui.note('wait', `${usd(count * 100)} of $300 is in. Waiting for ${NAMES.filter((_, i) => !paid[i]).map(n => (n === 'You' ? 'you' : n)).join(' and ')}.`);
              else ui.note('', 'Round 1 is your turn. Tap people to pay their $100.');
            };
            onTap(i => { paid[i] = true; draw(); });
            ui.controls(el('button', { type: 'button', class: 'pick-btn quiet', text: 'Reset round', onclick: () => { paid.fill(false); draw(); } }));
            draw();
          },
        },
        {
          title: 'A deadline keeps it moving.',
          body: 'If someone hasn’t paid when the round ends, anyone can pay the round out. Missed payments are recorded for everyone to see.',
          mount(ui) {
            const line = timeline(ui, { title: 'Round 2 · Sam’s turn · Lee hasn’t paid', days: 30, marks: [[0, 'Day 0'], [15, 'Day 15'], [30, 'Deadline']] });
            const input = el('input', { type: 'range', min: '0', max: '30', step: '1', value: '12', 'aria-label': 'Day of the round' });
            const draw = () => {
              const day = Number(input.value);
              if (day < 30) {
                line.to(day, `Day ${day} of 30`);
                ui.note('wait', 'You and Sam have paid. The $200 waits in the Circle for Lee.');
              } else {
                line.to(30, 'Paid out to Sam');
                ui.note('bad', 'The deadline passed. Sam receives the $200, and Lee’s missed payment is on record for everyone.');
              }
            };
            input.addEventListener('input', draw);
            ui.controls(el('label', { class: 'pick-range' }, el('span', { text: 'Day of the round' }), input));
            draw();
          },
        },
        {
          title: 'Paying in is a promise.',
          body: 'The Circle can’t make anyone pay. Someone who stops after their own turn keeps what they received.',
          mount(ui) {
            const rounds = [
              { to: 'You', paid: [1, 1, 1], got: 300 },
              { to: 'Sam', paid: [1, 1, 1], got: 300 },
              { to: 'Lee', paid: [1, 0, 1], got: 200 },
            ];
            const list = el('ol', { class: 'ledger' });
            ui.stage(list);
            let shown = 0;
            const next = el('button', { type: 'button', class: 'pick-btn', text: 'Play round 1' });
            const draw = () => {
              list.replaceChildren(...rounds.slice(0, shown).map((round, n) => el('li', {},
                el('strong', { text: `Round ${n + 1}` }),
                el('span', { class: 'who' }, ...NAMES.map((name, i) => el('span', { class: round.paid[i] ? 'in' : 'out', text: round.paid[i] ? `${name} paid` : `${name} missed` }))),
                el('span', { class: 'gets', text: `${round.to} gets ${usd(round.got)}` }))));
              if (shown === 0) ui.note('', 'Play the three rounds and watch Sam.');
              else if (shown < 3) ui.note('', shown === 2 ? 'Sam has had the $300 turn.' : 'Everyone paid.');
              else ui.note('bad', 'Sam paid $200 and received $300. The miss is recorded, but nothing forces Sam to pay. Lee loses $100.');
              next.textContent = shown < 3 ? `Play round ${shown + 1}` : 'Start again';
            };
            next.addEventListener('click', () => { shown = shown < 3 ? shown + 1 : 0; draw(); });
            ui.controls(next);
            draw();
          },
        },
      ],
    },
  };

  const cards = [...deck.querySelectorAll('.pick')];
  cards.forEach((card, index) => {
    const id = [...card.classList].find(c => c.startsWith('pick-') && KINDS[c.slice(5)])?.slice(5);
    const kind = KINDS[id];
    if (!kind) return;

    const tabs = el('div', { class: 'pick-tabs', role: 'tablist', 'aria-label': `${kind.title} explained` });
    const panel = el('div', { class: 'pick-panel', role: 'tabpanel' });
    const title = el('h4', { class: 'pick-title' });
    const body = el('p', { class: 'pick-body' });
    const stage = el('div', { class: 'pick-stage' });
    const note = el('p', { class: 'pick-note', role: 'status' });
    const controls = el('div', { class: 'pick-controls' });
    const next = el('button', { type: 'button', class: 'pick-next' });
    panel.append(title, body, stage, note, controls);

    const buttons = kind.tabs.map((label, i) => el('button', {
      type: 'button', role: 'tab', id: `${id}-tab-${i}`, 'aria-controls': `${id}-panel`, class: i === 3 ? 'weak' : '', text: label,
    }));
    panel.id = `${id}-panel`;
    tabs.append(...buttons);

    let part = -1;
    const ui = {
      stage: node => stage.replaceChildren(node),
      note: (tone, text) => { note.dataset.tone = tone; note.textContent = text; },
      controls: (...nodes) => controls.replaceChildren(...nodes),
      go: i => show(i, true),
    };
    function show(i, focus) {
      if (i === part) return;
      part = i;
      buttons.forEach((button, n) => {
        button.setAttribute('aria-selected', String(n === i));
        button.tabIndex = n === i ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', buttons[i].id);
      panel.classList.remove('enter');
      void panel.offsetWidth;
      panel.classList.add('enter');
      title.textContent = kind.parts[i].title;
      body.textContent = kind.parts[i].body;
      stage.replaceChildren();
      controls.replaceChildren();
      ui.note('', '');
      kind.parts[i].mount(ui);
      const last = i === kind.parts.length - 1;
      const nextKind = cards[index + 1] && KINDS[[...cards[index + 1].classList].find(c => KINDS[c.slice(5)])?.slice(5)];
      next.textContent = last ? (nextKind ? `Next kind: ${nextKind.title} →` : 'Back to the start ↺') : `Next: ${kind.tabs[i + 1]} →`;
      if (focus) buttons[i].focus();
    }
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => show(i));
      button.addEventListener('keydown', event => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        show((i + step + buttons.length) % buttons.length, true);
      });
    });
    next.addEventListener('click', () => {
      if (part < kind.parts.length - 1) return show(part + 1);
      card.dispatchEvent(new CustomEvent('venn:next', { bubbles: true, detail: { index } }));
    });

    const head = el('header', { class: 'pick-head' }, el('h3', { text: kind.title }), el('p', { class: 'pick-line', text: kind.line }));
    card.replaceChildren(head, tabs, panel, next);
    card.classList.add('live');
    show(0);
  });
})();
