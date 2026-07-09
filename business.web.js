/* TaxFile — 2025 business & entity tax engine (browser build).
 * Covers the IRS "other" filer types beyond the individual 1040:
 *   C corporation (Form 1120)      — flat 21%
 *   S corporation (Form 1120-S)    — pass-through, K-1 allocation
 *   Partnership / multi-member LLC (Form 1065) — pass-through, K-1
 *   Estate / Trust (Form 1041)     — compressed brackets
 *   Nonprofit (Form 990 / 990-T)   — tax-exempt; UBIT at 21% on UBTI
 * Figures verified July 2026 (Rev. Proc. 2024-40; TCJA 21% corporate rate).
 * Deterministic; runs in the browser (window.BusinessEngine) and Node. */
(function (root) {
  "use strict";

  var CORP_RATE = 0.21;

  // Estate/Trust compressed brackets (Form 1041, 2025).
  var TRUST_BRACKETS = [[0.10,3150],[0.24,11450],[0.35,15650],[0.37,Infinity]];
  // Trust preferential (LTCG/qualified dividends) breakpoints (2025).
  var TRUST_LTCG = { zero:3250, fifteen:15900 };

  function r2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
  function pos(n){ return n>0?n:0; }
  function nz(n){ return (typeof n==="number"&&!isNaN(n))?n:0; }

  function taxFromBrackets(amount, brackets){
    if(amount<=0) return 0;
    var tax=0, lower=0;
    for(var i=0;i<brackets.length;i++){
      var rate=brackets[i][0], up=brackets[i][1];
      if(amount>lower){ tax+=(Math.min(amount,up)-lower)*rate; lower=up; } else break;
    }
    return r2(tax);
  }

  // ---- C corporation (Form 1120) --------------------------------------------
  function cCorp(inp){
    var receipts=nz(inp.grossReceipts), cogs=nz(inp.costOfGoodsSold), expenses=nz(inp.operatingExpenses);
    var taxableIncome = (typeof inp.taxableIncome==="number") ? nz(inp.taxableIncome) : pos(receipts-cogs-expenses);
    var tax=r2(pos(taxableIncome)*CORP_RATE);
    var credits=nz(inp.credits);
    var afterCredits=r2(pos(tax-credits));
    var payments=nz(inp.estimatedPayments)+nz(inp.withholding);
    var balance=r2(payments-afterCredits);
    return {
      entity:"C corporation (Form 1120)", taxableIncome:r2(taxableIncome),
      taxRate:CORP_RATE, taxBeforeCredits:tax, credits:r2(credits), totalTax:afterCredits,
      payments:r2(payments), refundOwed:balance,
      lineItems:[
        ["1a","Gross receipts or sales",receipts],
        ["2","Cost of goods sold",cogs],
        ["27","Total deductions (operating expenses)",expenses],
        ["30","Taxable income",r2(taxableIncome)],
        ["31","Total tax (21% flat rate)",tax],
        ["","Credits",r2(credits)],
        ["","Total tax after credits",afterCredits],
        ["","Payments (estimated + withholding)",r2(payments)],
        [balance>=0?"Refund":"Balance due","",Math.abs(balance)]
      ],
      notes:["C corporations pay a flat 21% federal income tax on taxable income. "+
             "Owners are taxed again on dividends (double taxation)."]
    };
  }

  // ---- Pass-through: S corp (1120-S) & Partnership (1065) --------------------
  function passThrough(inp, kind){
    var receipts=nz(inp.grossReceipts), cogs=nz(inp.costOfGoodsSold), expenses=nz(inp.operatingExpenses);
    var ordinaryIncome = (typeof inp.ordinaryBusinessIncome==="number") ? nz(inp.ordinaryBusinessIncome) : r2(receipts-cogs-expenses);
    var owners=(inp.owners&&inp.owners.length)?inp.owners:[{name:"Owner 1",percent:100}];
    // Normalize percentages.
    var totalPct=owners.reduce(function(a,o){return a+nz(o.percent);},0)||100;
    var k1=owners.map(function(o){
      var share=r2(ordinaryIncome*(nz(o.percent)/totalPct));
      return { name:o.name||"Owner", percent:nz(o.percent), ordinaryIncomeShare:share,
               seTaxNote: kind==="partnership" ? "General partners owe self-employment tax on this share." : "S-corp shareholders are not subject to SE tax on this share (reasonable W-2 wages required)." };
    });
    return {
      entity: kind==="s_corp" ? "S corporation (Form 1120-S)" : "Partnership / LLC (Form 1065)",
      ordinaryBusinessIncome:r2(ordinaryIncome),
      entityLevelTax:0, // pass-through: no federal income tax at the entity level
      k1:k1,
      lineItems:[
        ["1a","Gross receipts or sales",receipts],
        ["2","Cost of goods sold",cogs],
        ["","Total deductions",expenses],
        [kind==="s_corp"?"21":"22","Ordinary business income (loss)",r2(ordinaryIncome)],
        ["","Federal income tax at entity level",0]
      ],
      notes:[
        (kind==="s_corp"?"S corporations":"Partnerships")+" generally pay NO federal income tax. "+
        "Income passes through to owners on Schedule K-1 and is reported on their personal returns.",
        "Each owner's K-1 share is shown below; paste it into that owner's individual return."
      ]
    };
  }

  // ---- Estate / Trust (Form 1041) -------------------------------------------
  function trust(inp, kind){
    var income=nz(inp.totalIncome);
    var deductions=nz(inp.deductions);
    var distributionDeduction=nz(inp.incomeDistributionDeduction);
    var exemption = kind==="estate" ? 600 : (inp.simpleTrust ? 300 : 100);
    var taxableIncome=pos(income-deductions-distributionDeduction-exemption);
    var tax=taxFromBrackets(taxableIncome, TRUST_BRACKETS);
    var payments=nz(inp.estimatedPayments)+nz(inp.withholding);
    var balance=r2(payments-tax);
    return {
      entity: kind==="estate" ? "Estate (Form 1041)" : "Trust (Form 1041)",
      taxableIncome:r2(taxableIncome), totalTax:tax, exemption:exemption,
      payments:r2(payments), refundOwed:balance,
      lineItems:[
        ["1-8","Total income",income],
        ["","Deductions",deductions],
        ["18","Income distribution deduction",distributionDeduction],
        ["20","Exemption",exemption],
        ["23","Taxable income",r2(taxableIncome)],
        ["24","Total tax (compressed brackets)",tax],
        ["","Payments",r2(payments)],
        [balance>=0?"Refund":"Balance due","",Math.abs(balance)]
      ],
      notes:["Estates and trusts hit the top 37% rate at only ~$15,650 of taxable income. "+
             "Income distributed to beneficiaries is deducted here and taxed on their returns (K-1)."]
    };
  }

  // ---- Nonprofit (Form 990 / 990-T) -----------------------------------------
  function nonprofit(inp){
    var ubti=nz(inp.unrelatedBusinessIncome);
    var ubit=r2(pos(ubti)*CORP_RATE);
    return {
      entity:"Tax-exempt organization (Form 990 / 990-T)",
      unrelatedBusinessTaxableIncome:r2(ubti), totalTax:ubit,
      refundOwed:r2(nz(inp.estimatedPayments)-ubit),
      lineItems:[
        ["990","Exempt-function activity — federal income tax",0],
        ["990-T","Unrelated business taxable income (UBTI)",r2(ubti)],
        ["","Unrelated business income tax (UBIT, 21%)",ubit]
      ],
      notes:["Exempt organizations file Form 990 (informational) and pay NO tax on exempt-function income. "+
             "They owe 21% UBIT only on unrelated business taxable income (Form 990-T)."]
    };
  }

  function computeBusinessTax(inp){
    switch(inp.entityType){
      case "c_corp": return cCorp(inp);
      case "s_corp": return passThrough(inp,"s_corp");
      case "partnership": return passThrough(inp,"partnership");
      case "trust": return trust(inp,"trust");
      case "estate": return trust(inp,"estate");
      case "nonprofit": return nonprofit(inp);
      default: throw new Error("Unknown entity type: "+inp.entityType);
    }
  }

  var api={ computeBusinessTax:computeBusinessTax, taxFromBrackets:taxFromBrackets, CORP_RATE:CORP_RATE };
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  root.BusinessEngine=api;
})(typeof window!=="undefined"?window:this);
