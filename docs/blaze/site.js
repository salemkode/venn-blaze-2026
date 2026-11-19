(() => {
  const budget = document.querySelector('[data-budget]');

  if (budget) {
    const allowance = 50_000;
    const format = new Intl.NumberFormat('en-US');
    const amount = budget.querySelector('input');
    const outcome = budget.querySelector('[data-outcome]');
    const verdict = budget.querySelector('[data-verdict]');
    const remaining = budget.querySelector('[data-remaining]');
    const presets = budget.querySelectorAll('[data-amount]');

    function showPayment() {
      const payment = amount.valueAsNumber;
      const valid = amount.validity.valid && Number.isInteger(payment);
      const approved = valid && payment <= allowance;

      for (const preset of presets) {
        preset.setAttribute('aria-pressed', String(Number(preset.dataset.amount) === payment));
      }

      if (!valid) {
        outcome.dataset.state = 'invalid';
        verdict.textContent = 'Enter a whole amount';
        remaining.textContent = 'Choose between 1 and 1,000,000 sat.';
      } else if (approved) {
        outcome.dataset.state = 'approved';
        verdict.textContent = 'Fits the budget';
        remaining.textContent = format.format(allowance - payment) + ' sat would remain.';
      } else {
        outcome.dataset.state = 'rejected';
        verdict.textContent = 'Over the budget';
        remaining.textContent = format.format(payment - allowance) + ' sat above the allowance. The balance stays at 50,000 sat.';
      }
    }

    amount.addEventListener('input', showPayment);
    for (const preset of presets) {
      preset.addEventListener('click', () => {
        amount.value = preset.dataset.amount;
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
