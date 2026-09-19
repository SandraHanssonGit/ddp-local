// Replaces native window.alert()/confirm() (unstyleable OS dialogs)
// with a modal that matches admin.css. Same call sites, just await
// dppAlert(...)/dppConfirm(...) instead - see CHANGELOG.md.
(function () {
  function ensureModal() {
    if (document.getElementById('dpp-modal-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dpp-modal-overlay';
    overlay.className = 'dpp-modal-overlay hidden';
    overlay.innerHTML =
      '<div class="dpp-modal">' +
      '<p class="dpp-modal-message" id="dpp-modal-message"></p>' +
      '<div class="dpp-modal-actions" id="dpp-modal-actions"></div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  function showModal(message, buttons) {
    ensureModal();
    const overlay = document.getElementById('dpp-modal-overlay');
    document.getElementById('dpp-modal-message').textContent = message;
    const actions = document.getElementById('dpp-modal-actions');
    actions.innerHTML = '';

    return new Promise(function (resolve) {
      buttons.forEach(function (btn) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = btn.primary ? 'btn btn-primary' : 'btn';
        el.textContent = btn.label;
        el.onclick = function () {
          overlay.classList.add('hidden');
          resolve(btn.value);
        };
        actions.appendChild(el);
      });
      overlay.classList.remove('hidden');
    });
  }

  window.dppAlert = function (message) {
    return showModal(message, [{ label: 'OK', primary: true, value: true }]);
  };

  window.dppConfirm = function (message) {
    return showModal(message, [
      { label: 'Cancel', primary: false, value: false },
      { label: 'OK', primary: true, value: true }
    ]);
  };

  // Optional free-text reason capture (CLAUDE.md §13, ROADMAP.md
  // freeze-at-production gap) - used when editing a value that's
  // already locked, so the audit trail can record *why*, not just
  // who/when. Resolves '' (not null) on Cancel/blank, since the
  // reason is optional - callers should never block a save on this.
  window.dppPrompt = function (message, placeholder) {
    ensureModal();
    const overlay = document.getElementById('dpp-modal-overlay');
    document.getElementById('dpp-modal-message').textContent = message;
    const actions = document.getElementById('dpp-modal-actions');
    actions.innerHTML = '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dpp-modal-input';
    input.placeholder = placeholder || 'Optional';
    actions.parentNode.insertBefore(input, actions);

    return new Promise(function (resolve) {
      function finish(value) {
        input.remove();
        overlay.classList.add('hidden');
        resolve(value);
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') finish(input.value.trim());
      });
      [
        { label: 'Skip', primary: false, value: '' },
        { label: 'OK', primary: true, value: null }
      ].forEach(function (btn) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = btn.primary ? 'btn btn-primary' : 'btn';
        el.textContent = btn.label;
        el.onclick = function () {
          finish(btn.value === null ? input.value.trim() : btn.value);
        };
        actions.appendChild(el);
      });
      overlay.classList.remove('hidden');
      input.focus();
    });
  };
})();
