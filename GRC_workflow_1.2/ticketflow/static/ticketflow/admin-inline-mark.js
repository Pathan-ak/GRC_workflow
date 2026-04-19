(function () {
  function markInlineTables() {
    document.querySelectorAll('.inline-group table.tabular').forEach(function (tbl) {
      tbl.classList.add('tf-inline'); // used by the CSS below
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markInlineTables);
  } else {
    markInlineTables();
  }
})();