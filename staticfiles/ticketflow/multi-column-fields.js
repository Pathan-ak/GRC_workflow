// ticketflow/static/ticketflow/multi-column-fields.js
// Adds multi-column layout when many fields are present

(function () {
  function findFieldsContainer() {
    // Try several probable selectors. Adjust if your form uses a different markup.
    // This should target the container holding the individual field blocks.
    var selectors = [
      '.dynamic-fields',         // common custom wrapper
      '.form-row',               // django form-row items
      '.field-block',            // custom field wrapper
      '.form-fields',            // alternative wrapper names
      'form .inline-group',      // when inline-group used
      'form'                     // last resort - check inside the form
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el.closest('form') || el;
    }
    return null;
  }

  function countVisibleFields(container) {
    if (!container) return 0;
    // Count likely field wrappers inside the container.
    // Adjust selector list if your field HTML uses other classes.
    return container.querySelectorAll('.form-row, .field-block, .form-group, .field').length;
  }

  function init() {
    try {
      var form = findFieldsContainer();
      if (!form) {
        console.log('Multi-column script: no form found.');
        return;
      }

      // Determine where exactly field blocks live. If there's a dedicated wrapper
      // use that; otherwise use the form itself to host the multi-column class.
      var fieldsParent = form.querySelector('.dynamic-fields') || form.querySelector('.inline-group') || form;

      var count = countVisibleFields(fieldsParent);
      console.log('Multi-column script: found fields count =', count);

      if (count > 50) {
        // wrap in an overflow container to allow horizontal scroll if necessary
        var wrapper = document.createElement('div');
        wrapper.className = 'tf-fields-wrapper';

        // insert wrapper before the fieldsParent and move fieldsParent inside wrapper
        fieldsParent.parentNode.insertBefore(wrapper, fieldsParent);
        wrapper.appendChild(fieldsParent);

        // add class to fieldsParent so CSS multi-column applies
        fieldsParent.classList.add('tf-fields-multi');

        console.log('Multi-column layout applied.');
      } else {
        console.log('Multi-column layout not required.');
      }
    } catch (e) {
      console.error('Multi-column script error:', e);
    }
  }

  // Run on DOMContentLoaded to ensure form was rendered by Viewflow/Django.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// multi-column-fields.js
// Detect long forms and apply horizontal multi-column layout.
// Logs to console so you can verify it ran.

(function () {
  if (typeof window === "undefined") return;
  function log() {
    try { console.info.apply(console, arguments); } catch(e) {}
  }

  // Wait until DOM ready
  function ready(fn) {
    if (document.readyState !== "loading") return fn();
    document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    try {
      // Find the viewflow form container. Adjust selector if your layout differs.
      // 'vf-form' is the custom tag in your template; actual elements inside may be <form class="vf-form"> etc.
      var form = document.querySelector("form.vf-form");
      if (!form) {
        log("Multi-column script: no form.vf-form found, aborting.");
        return;
      }

      // Count fields: prefer elements with class "field" (Viewflow generated), but fallback
      var fieldNodes = form.querySelectorAll(".field, .form-row, .vf-field, .vf-form-row, [name]");
      // filter out wrapper elements that are not actual form fields:
      var fieldEls = Array.prototype.filter.call(fieldNodes, function (el) {
        // we only want top-level immediate children that actually hold label+input
        // ignore nested elements like input inside label etc.
        // Heuristic: element contains a label OR input/select/textarea
        return el.querySelector && (el.querySelector("label") || el.querySelector("input,select,textarea"));
      });

      var count = fieldEls.length;
      log("Multi-column script: found fields count =", count);

      // threshold -- only apply layout if many fields
      var THRESHOLD = 50;
      if (count <= THRESHOLD) {
        log("Multi-column script: field count <= threshold (" + THRESHOLD + "), no layout applied.");
        return;
      }

      // Add css class to the form so the CSS will apply
      form.classList.add("tf-multi-cols");
      log("Multi-column script: TF multi-columns class added to form.");

      // Move each detected field element to be a direct child of the form so layout is predictable
      // (only if it's not already a direct child)
      fieldEls.forEach(function (el) {
        if (el.parentElement !== form) {
          // wrap or move: safer to append a clone placeholder if needed
          form.appendChild(el);
        }
      });

      // Optional: add a small floating hint
      var hint = document.createElement("div");
      hint.style.fontSize = "12px";
      hint.style.color = "#666";
      hint.style.margin = "6px 0 12px";
      hint.textContent = "This form is displayed in multi-column mode for long forms.";
      form.insertBefore(hint, form.firstChild);

      log("Multi-column script: multi-column layout applied.");
    } catch (err) {
      console.error("Multi-column script error:", err);
    }
  });
})();