(function () {
  "use strict";

  var fieldDefinitions = {
    primary: [
      ["income", "Annual household income ($)", 120000, 1000],
      ["down", "Down payment ($)", 60000, 1000],
      ["debt", "Other monthly debt payments ($)", 500, 50]
    ],
    ratios: [
      ["housing", "Housing budget / gross income (%)", 28, 1],
      ["dti", "Housing + debt / gross income (%)", 36, 1]
    ],
    costs: [
      ["rate", "Interest rate (%)", 6.5, 0.125],
      ["years", "Loan term (years)", 30, 1],
      ["tax", "Annual property tax / price (%)", 1.2, 0.1],
      ["insurance", "Home insurance ($ / year)", 3600, 100],
      ["flood", "Extra wind / flood ($ / year)", 0, 100],
      ["hoa", "HOA / condo fees ($ / month)", 0, 25],
      ["pmi", "Annual PMI / loan balance (%)", 0.5, 0.1],
      ["maintenance", "Annual maintenance / price (%)", 1, 0.1]
    ],
    extras: [
      ["roommate", "Roommate contribution ($ / month)", 0, 50],
      ["closing", "Estimated closing costs (%)", 3, 0.1]
    ]
  };

  var percentageFields = ["housing", "dti", "tax", "pmi", "maintenance", "closing"];
  var costNames = [
    "Principal & interest",
    "Property taxes",
    "Home + extra insurance",
    "HOA / condo fees",
    "Mortgage insurance (PMI)",
    "Maintenance reserve"
  ];
  var costColors = ["#9dcaab", "#d9dfad", "#e9c489", "#b5d4d5", "#b5a3c5", "#779e8c"];
  var form = document.getElementById("budget-form");
  var statusMessage = document.getElementById("message");

  function element(id) {
    return document.getElementById(id);
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }

  function fieldMarkup(id, label, value, step) {
    var maximum = "";
    if (percentageFields.indexOf(id) !== -1) maximum = ' max="100"';
    if (id === "years") maximum = ' max="50"';
    if (id === "rate") maximum = ' max="30"';
    var minimum = id === "years" || id === "income" ? 1 : 0;

    return '<label for="' + id + '">' + label +
      '<input id="' + id + '" name="' + id + '" type="number" min="' + minimum + '"' +
      maximum + ' step="' + step + '" value="' + value + '" inputmode="decimal" required></label>';
  }

  Object.keys(fieldDefinitions).forEach(function (group) {
    fieldDefinitions[group].forEach(function (field) {
      element(group).insertAdjacentHTML("beforeend", fieldMarkup(field[0], field[1], field[2], field[3]));
    });
  });

  function ownershipCosts(price, values) {
    var loan = Math.max(0, price - values.down);
    var monthlyRate = values.rate / 1200;
    var paymentCount = values.years * 12;
    var principalAndInterest = loan === 0 ? 0 : monthlyRate === 0 ? loan / paymentCount :
      loan * monthlyRate / (1 - Math.pow(1 + monthlyRate, -paymentCount));
    var mortgageInsurance = price > 0 && loan / price > 0.80000000001 ? loan * values.pmi / 1200 : 0;

    return [
      principalAndInterest,
      price * values.tax / 1200,
      (values.insurance + values.flood) / 12,
      values.hoa,
      mortgageInsurance,
      price * values.maintenance / 1200
    ];
  }

  function calculate(values) {
    var grossMonthlyIncome = values.income / 12;
    var monthlyBudget = Math.min(
      grossMonthlyIncome * values.housing / 100,
      grossMonthlyIncome * values.dti / 100 - values.debt
    );
    var monthlyCost = function (price) {
      return ownershipCosts(price, values).reduce(function (sum, cost) { return sum + cost; }, 0);
    };

    if (monthlyBudget < monthlyCost(values.down)) {
      return { price: 0, budget: monthlyBudget, unavailable: true };
    }

    var low = values.down;
    var high = Math.max(values.down + 1, 100000);
    while (monthlyCost(high) <= monthlyBudget && high < 1e12) high *= 2;

    for (var index = 0; index < 100; index += 1) {
      var midpoint = (low + high) / 2;
      if (monthlyCost(midpoint) <= monthlyBudget) low = midpoint;
      else high = midpoint;
    }

    return { price: low, budget: monthlyBudget, unavailable: false };
  }

  function clearResult() {
    element("price").textContent = "Check inputs";
    element("breakdown").textContent = "";
    element("cost-bar").innerHTML = "";
    ["total", "net", "stats", "caveat", "limit"].forEach(function (id) {
      element(id).textContent = "";
    });
  }

  function render() {
    var valid = form.checkValidity();
    element("error").style.display = valid ? "none" : "block";
    if (!valid) {
      clearResult();
      return;
    }

    var values = {};
    Array.prototype.forEach.call(form.elements, function (input) {
      if (input.id) values[input.id] = Number(input.value);
    });

    var result = calculate(values);
    var price = result.price;
    var grossMonthlyIncome = values.income / 12;
    var housingLimit = grossMonthlyIncome * values.housing / 100;
    var debtLimit = grossMonthlyIncome * values.dti / 100 - values.debt;

    element("price").textContent = result.unavailable ? "No fit yet" : money(Math.floor(price));
    element("limit").textContent = housingLimit <= debtLimit ?
      "Housing budget is the limit" : "Total debt budget is the limit";

    if (result.unavailable) {
      element("breakdown").textContent = "Your monthly limit cannot cover the modeled costs even with no mortgage at your down-payment amount. Try lower fixed costs, lower debt, or a different budget.";
      ["total", "net", "stats", "caveat"].forEach(function (id) { element(id).textContent = ""; });
      element("cost-bar").innerHTML = "";
      return;
    }

    var costs = ownershipCosts(price, values);
    var total = costs.reduce(function (sum, cost) { return sum + cost; }, 0);
    var housingForRatio = total - costs[5];

    element("breakdown").innerHTML = costs.map(function (cost, index) {
      return '<div class="result-row"><span><span style="color:' + costColors[index] + '">●</span> ' +
        costNames[index] + '</span><span>' + money(cost) + '</span></div>';
    }).join("");

    element("cost-bar").innerHTML = costs.map(function (cost, index) {
      var width = total ? cost / total * 100 : 0;
      return '<span style="width:' + width + '%;background:' + costColors[index] + '"></span>';
    }).join("");

    element("total").textContent = money(total) + "/mo";
    element("net").textContent = money(Math.max(0, total - values.roommate)) + "/mo";
    element("stats").innerHTML =
      '<div class="result-row"><span>Estimated loan amount</span><strong>' + money(Math.max(0, price - values.down)) + '</strong></div>' +
      '<div class="result-row"><span>Down payment</span><strong>' + (price ? values.down / price * 100 : 0).toFixed(1) + '%</strong></div>' +
      '<div class="result-row"><span>Down payment + closing costs</span><strong>' + money(values.down + price * values.closing / 100) + '</strong></div>' +
      '<div class="result-row"><span>Housing / income · total debt / income</span><strong>' +
      (housingForRatio / grossMonthlyIncome * 100).toFixed(1) + '% · ' +
      ((housingForRatio + values.debt) / grossMonthlyIncome * 100).toFixed(1) + '%</strong></div>';

    element("caveat").textContent =
      "Both price limits include maintenance; the debt ratios above exclude maintenance and roommate income. Cash needed is additional to emergency reserves." +
      (values.roommate > total ? " Roommate contribution exceeds the monthly budget; out-of-pocket is shown as $0." : "");
  }

  form.addEventListener("input", render);
  form.addEventListener("submit", function (event) { event.preventDefault(); });

  element("reset").addEventListener("click", function () {
    form.reset();
    statusMessage.textContent = "Example values restored.";
    render();
  });

  element("print").addEventListener("click", function () {
    window.print();
  });

  element("share").addEventListener("click", function () {
    var pageUrl = window.location.href.split("#")[0];
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pageUrl).then(function () {
        statusMessage.textContent = "Page link copied.";
      }).catch(function () {
        statusMessage.textContent = "Copy this link: " + pageUrl;
      });
    } else {
      statusMessage.textContent = "Copy this link: " + pageUrl;
    }
  });

  render();
}());
