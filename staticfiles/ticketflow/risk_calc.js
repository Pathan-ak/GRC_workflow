document.addEventListener("DOMContentLoaded", function () {

  function byLabel(labelText) {
    const labels = document.querySelectorAll("label");
    for (let l of labels) {
      if (l.innerText.trim() === labelText) {
        return document.getElementById(l.getAttribute("for"));
      }
    }
    return null;
  }

  // ADMIN FIELD LABELS (MUST MATCH EXACTLY)
  const impactField = byLabel("Impact Rating");
  const likelihoodField = byLabel("Likelihood Rating");

  const inherentField = byLabel("Inherent Risk level(calculated)");
  const residualField = byLabel("Residual Risk level(calculated)");
  const controlField = byLabel("Overall Control Effectiveness (calculated)");

  if (!impactField || !likelihoodField) return;

  const impactMap = {
    "Very Significant": 4,
    "Significant": 3,
    "Moderate": 2,
    "Minor": 1
  };

  const likelihoodMap = {
    "Very Likely": 4,
    "Likely": 3,
    "Possible": 2,
    "Rare": 1
  };

  function calculate() {
    const impact = impactMap[impactField.value];
    const likelihood = likelihoodMap[likelihoodField.value];

    if (!impact || !likelihood) return;

    const score = impact * likelihood;

    let inherent = "";
    let residual = "";
    let color = "";

    if (score >= 12) {
      inherent = "Critical";
      residual = "100%";
      color = "risk-red";
    } else if (score >= 8) {
      inherent = "High";
      residual = "75%";
      color = "risk-orange";
    } else if (score >= 4) {
      inherent = "Medium";
      residual = "50%";
      color = "risk-yellow";
    } else {
      inherent = "Low";
      residual = "25%";
      color = "risk-green";
    }

    if (inherentField) {
      inherentField.value = inherent;
      inherentField.className = color;
    }

    if (residualField) {
      residualField.value = residual;
      residualField.className = color;
    }

    if (controlField) {
      controlField.value = residual;
      controlField.className = color;
    }
  }

  impactField.addEventListener("change", calculate);
  likelihoodField.addEventListener("change", calculate);

  calculate(); // run once if values already selected
});