(function(){
  function ensureLive(id){
    id = id || 'globalA11yLive';
    var el = document.getElementById(id);
    if (!el){
      el = document.createElement('div');
      el.id = id;
      el.className = 'aria-live';
      el.setAttribute('aria-live','polite');
      el.setAttribute('aria-atomic','true');
      document.body.appendChild(el);
    }
    return el;
  }

  window.announce = function(message, mode){
    try {
      var live = ensureLive('globalA11yLive');
      mode = mode || 'polite';
      live.setAttribute('aria-live', mode);
      // Use a short timed clear to allow repeated messages
      live.textContent = message;
      window.clearTimeout(window.__a11y_clear_timeout);
      window.__a11y_clear_timeout = window.setTimeout(function(){ live.textContent = ''; }, 4000);
    } catch (e) {
      // noop
      console.error && console.error('announce error', e);
    }
  };
})();
