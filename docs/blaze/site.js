(() => {
  const budget = document.querySelector('[data-budget]');

  if (budget) {
    const allowance = 5000; // cents: $50.00 a day
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const show = cents => money.format(cents / 100);
    const amount = budget.querySelector('input');
    const outcome = budget.querySelector('[data-outcome]');
    const verdict = budget.querySelector('[data-verdict]');
    const remaining = budget.querySelector('[data-remaining]');
    const left = budget.querySelector('[data-left]');
    const bar = budget.querySelector('[data-bar]');
    const presets = budget.querySelectorAll('[data-amount]');

    function setYou(cents) {
      left.textContent = show(cents);
      bar.style.setProperty('--fill', String(cents / allowance));
    }

    function showPayment() {
      const cents = Math.round(amount.valueAsNumber * 100);
      const valid = amount.validity.valid && Number.isFinite(cents) && cents > 0;

      for (const preset of presets) {
        preset.setAttribute('aria-pressed', String(Math.round(Number(preset.dataset.amount) * 100) === cents));
      }

      if (!valid) {
        outcome.dataset.state = 'invalid';
        verdict.textContent = 'Enter an amount.';
        remaining.textContent = 'Try something between $0.01 and $10,000.';
        setYou(allowance);
      } else if (cents <= allowance) {
        outcome.dataset.state = 'approved';
        verdict.textContent = 'Paid.';
        remaining.textContent = cents === allowance
          ? 'That uses your whole budget for today. Sam and Lee still have $50.00.'
          : 'You have ' + show(allowance - cents) + ' left today. Sam and Lee still have $50.00.';
        setYou(allowance - cents);
      } else {
        outcome.dataset.state = 'rejected';
        verdict.textContent = 'Not sent.';
        remaining.textContent = 'That is ' + show(cents - allowance) + ' over your budget, so nothing leaves the fund. Ask the group to approve it.';
        setYou(allowance);
      }
    }

    amount.addEventListener('input', showPayment);
    for (const preset of presets) {
      preset.addEventListener('click', () => {
        amount.value = Number(preset.dataset.amount).toFixed(2);
        showPayment();
      });
    }
    showPayment();
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
