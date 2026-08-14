// Behaviour for the design system reference page.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── The scan sequence ─────────────────────────────────────────────────────
   Runs once when the hero scrolls into view, and again on demand. Bubble
   ink-in delays are set as a custom property so the CSS owns the timing and
   this file only decides when the sequence starts. */

const stage = document.querySelector('[data-scan]');

if (stage) {
  const filled = stage.querySelectorAll('.bubbles i.f');
  filled.forEach((bubble, index) => {
    bubble.style.setProperty('--d', `${String(1150 + index * 70)}ms`);
  });

  const run = () => {
    stage.classList.remove('run');
    // Force a reflow so removing and adding the class restarts the animation.
    void stage.offsetWidth;
    stage.classList.add('run');
  };

  if (reduced) {
    stage.classList.add('run');
  } else {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            run();
            seen.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    seen.observe(stage);
  }

  document.querySelector('[data-replay]')?.addEventListener('click', run);
}

/* ── Explain popovers ──────────────────────────────────────────────────────
   Every control and section title carries one. Opens on click and on keyboard
   focus, never on hover alone, and closes on Escape or an outside click. */

const closeAll = (except) => {
  for (const button of document.querySelectorAll('.explain > button')) {
    if (button !== except) button.setAttribute('aria-expanded', 'false');
  }
};

document.querySelectorAll('.explain').forEach((group, index) => {
  const button = group.querySelector('button');
  const bubble = group.querySelector('.bubble');
  if (!button || !bubble) return;

  const id = `explain-${String(index)}`;
  bubble.id = id;
  button.setAttribute('aria-describedby', id);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('type', 'button');

  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    closeAll(button);
    button.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAll();
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('.explain')) {
    closeAll();
  }
});
