// static/ticketflow/risk_calc.js
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function findField(labelText) {
    const labels = document.querySelectorAll("label");
    for (const lbl of labels) {
      if (lbl.textContent.trim().startsWith(labelText)) {
        const forId = lbl.getAttribute("for");
        if (forId) return document.getElementById(forId);
      }
    }
    return null;
  }

  function setValue(field, value, cssClass) {
    if (!field) return;

    field.value = value;

    // write to hidden shadow field
    const hidden = document.getElementById(field.id + "__hidden");
    if (hidden) hidden.value = value;

    field.className = field.className.replace(/\brisk-\S+/g, "");
    if (cssClass) field.classList.add(cssClass);
  }

  function calculate() {
    const impact = findField("Impact Rating");
    const likelihood = findField("Likelihood Rating");

    const inherent = findField("Inherent Risk level");
    const residual = findField("Residual Risk level");
    const overall = findField("Overall Control Effectiveness");

    if (!impact || !likelihood) return;

    const impactMap = {
      "Very Significant": 4,
      "Significant": 3,
      "Moderate": 2,
      "Minor": 1,
    };

    const likelihoodMap = {
      "Very Likely": 4,
      "Likely": 3,
      "Possible": 2,
      "Rare": 1,
    };

    const score =
      (impactMap[impact.value] || 0) *
      (likelihoodMap[likelihood.value] || 0);

    if (!score) return;

    if (score >= 12) {
      setValue(inherent, "Critical", "risk-critical");
      setValue(residual, "75%", "risk-critical");
      setValue(overall, "Weak", "risk-critical");
    } else if (score >= 8) {
      setValue(inherent, "High", "risk-high");
      setValue(residual, "50%", "risk-high");
      setValue(overall, "Moderate", "risk-high");
    } else if (score >= 4) {
      setValue(inherent, "Medium", "risk-medium");
      setValue(residual, "25%", "risk-medium");
      setValue(overall, "Good", "risk-medium");
    } else {
      setValue(inherent, "Low", "risk-low");
      setValue(residual, "10%", "risk-low");
      setValue(overall, "Strong", "risk-low");
    }
  }

  function bind() {
    const impact = findField("Impact Rating");
    const likelihood = findField("Likelihood Rating");

    if (impact) impact.addEventListener("change", calculate);
    if (likelihood) likelihood.addEventListener("change", calculate);

    calculate();
  }

  ready(() => {
    bind();
    setTimeout(bind, 500);
    setTimeout(bind, 1000);
  });
})();