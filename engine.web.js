/* TaxFile — 2025 Form 1040 engine (browser build).
 * Faithful port of the tested TypeScript engine. Pure functions; runs in the
 * browser (attaches to window.TaxEngine) and in Node (module.exports) for tests.
 * Figures: IRS Rev. Proc. 2024-40 + One Big Beautiful Bill Act (July 2025). */
(function (root) {
  "use strict";

  var ORD = {
    single: [[0.1,11925],[0.12,48475],[0.22,103350],[0.24,197300],[0.32,250525],[0.35,626350],[0.37,Infinity]],
    married_jointly: [[0.1,23850],[0.12,96950],[0.22,206700],[0.24,394600],[0.32,501050],[0.35,751600],[0.37,Infinity]],
    married_separately: [[0.1,11925],[0.12,48475],[0.22,103350],[0.24,197300],[0.32,250525],[0.35,375800],[0.37,Infinity]],
    head_of_household: [[0.1,17000],[0.12,64850],[0.22,103350],[0.24,197300],[0.32,250500],[0.35,626350],[0.37,Infinity]],
    qualifying_surviving_spouse: [[0.1,23850],[0.12,96950],[0.22,206700],[0.24,394600],[0.32,501050],[0.35,751600],[0.37,Infinity]]
  };
  var STD = { single:15750, married_jointly:31500, married_separately:15750, head_of_household:23625, qualifying_surviving_spouse:31500 };
  var ADD_STD = { single:2000, head_of_household:2000, married_jointly:1600, married_separately:1600, qualifying_surviving_spouse:1600 };
  var LTCG = {
    single:{z:48350,f:533400}, married_jointly:{z:96700,f:600050}, married_separately:{z:48350,f:300000},
    head_of_household:{z:64750,f:566700}, qualifying_surviving_spouse:{z:96700,f:600050}
  };
  var CTC_PER=2200, CTC_REF_CAP=1700, ODC=500, CTC_RATE=0.05, ACTC_FLOOR=2500, ACTC_RATE=0.15;
  var CTC_PHASE = { single:200000, head_of_household:200000, married_separately:200000, married_jointly:400000, qualifying_surviving_spouse:400000 };
  var EITC = {
    0:{rate:0.0765,max:649,psS:10620,peS:19104,psJ:17730,peJ:26214,por:0.0765},
    1:{rate:0.34,max:4328,psS:23350,peS:50434,psJ:30470,peJ:57554,por:0.1598},
    2:{rate:0.40,max:7152,psS:23350,peS:57310,psJ:30470,peJ:64430,por:0.2106},
    3:{rate:0.45,max:8046,psS:23350,peS:61555,psJ:30470,peJ:68675,por:0.2106}
  };
  var EITC_INV_LIMIT=11950;
  var QBI_RATE=0.20, QBI_THRESH={ single:197300, head_of_household:197300, married_separately:197300, married_jointly:394600, qualifying_surviving_spouse:394600 };
  var SE_FACTOR=0.9235, SS_BASE=176100, SS_RATE=0.124, MED_RATE=0.029;
  var ADDL_MED_RATE=0.009, ADDL_MED_THRESH={ single:200000, head_of_household:200000, qualifying_surviving_spouse:200000, married_jointly:250000, married_separately:125000 };
  var NIIT_RATE=0.038, NIIT_THRESH={ single:200000, head_of_household:200000, qualifying_surviving_spouse:250000, married_jointly:250000, married_separately:125000 };
  var SENIOR_AMT=6000, SENIOR_RATE=0.06, SENIOR_START={ single:75000, head_of_household:75000, married_separately:75000, married_jointly:150000, qualifying_surviving_spouse:150000 };
  var TIPS_CAP=25000, TIPS_START={ single:150000, head_of_household:150000, married_separately:150000, married_jointly:300000, qualifying_surviving_spouse:300000 }, TIPS_PER1000=100;
  var OT_CAP={ single:12500, head_of_household:12500, married_separately:12500, married_jointly:25000, qualifying_surviving_spouse:25000 };
  var OT_START={ single:150000, head_of_household:150000, married_separately:150000, married_jointly:300000, qualifying_surviving_spouse:300000 }, OT_PER1000=100;
  var MED_FLOOR=0.075, SALT_CAP=10000;

  // --- v2 (pro) constants: AMT, education, saver's, SS worksheet, cap-loss ---
  var AMT_EX={ single:88100, head_of_household:88100, married_jointly:137000, qualifying_surviving_spouse:137000, married_separately:68500 };
  var AMT_PHASE={ single:626350, head_of_household:626350, married_jointly:1252700, qualifying_surviving_spouse:1252700, married_separately:626350 };
  var AMT_PHASE_RATE=0.25, AMT_LOW=0.26, AMT_HIGH=0.28;
  var AMT_BP={ single:239100, head_of_household:239100, married_jointly:239100, qualifying_surviving_spouse:239100, married_separately:119550 };
  var SS_B1={ single:25000, head_of_household:25000, qualifying_surviving_spouse:25000, married_separately:25000, married_jointly:32000 };
  var SS_B2={ single:34000, head_of_household:34000, qualifying_surviving_spouse:34000, married_separately:34000, married_jointly:44000 };
  var AOTC_MAX=2500, AOTC_REFUND=0.40, LLC_RATE2=0.20, LLC_MAXEXP=10000;
  var EDU_PH={ single:{s:80000,e:90000}, joint:{s:160000,e:180000} };
  var SAVERS_MAX=2000;
  var SAVERS={
    married_jointly:[[0.5,47500],[0.2,51000],[0.1,79000],[0,Infinity]],
    qualifying_surviving_spouse:[[0.5,47500],[0.2,51000],[0.1,79000],[0,Infinity]],
    head_of_household:[[0.5,35625],[0.2,38250],[0.1,59250],[0,Infinity]],
    single:[[0.5,23750],[0.2,25500],[0.1,39500],[0,Infinity]],
    married_separately:[[0.5,23750],[0.2,25500],[0.1,39500],[0,Infinity]]
  };
  var CAP_LOSS_LIMIT=3000, CAP_LOSS_LIMIT_MFS=1500;

  function r2(n){ return Math.round((n+Number.EPSILON)*100)/100; }
  function pos(n){ return n>0?n:0; }
  function nz(n){ return (typeof n==="number"&&!isNaN(n))?n:0; }

  // --- Social Security Benefits Worksheet (exact) ----------------------------
  function ssWorksheet(status, benefits, otherIncome, taxExempt, adjustments){
    if(benefits<=0) return 0;
    var l2=r2(benefits*0.5);
    var l5=l2+pos(otherIncome)+pos(taxExempt);
    var l7=pos(l5-pos(adjustments));
    var b1=SS_B1[status], b2=SS_B2[status];
    var l9=pos(l7-b1);
    if(l9<=0) return 0;
    var l10=b2-b1;
    var l11=pos(l9-l10);
    var l12=Math.min(l9,l10);
    var l13=r2(l12*0.5);
    var l14=Math.min(l2,l13);
    var l16=l14+r2(l11*0.85);
    return r2(Math.min(l16, r2(benefits*0.85)));
  }
  // --- Alternative Minimum Tax (Form 6251) -----------------------------------
  function amtTax(status, taxableIncome, usedStd, stdDed, saltAddback, otherPref, regularTax, pref){
    var amti=taxableIncome + (usedStd?stdDed:0) + pos(saltAddback) + pos(otherPref);
    amti=r2(pos(amti));
    var ex=r2(pos(AMT_EX[status]-pos(amti-AMT_PHASE[status])*AMT_PHASE_RATE));
    var base=pos(amti-ex);
    var pr=Math.min(pos(pref),base), ord=pos(base-pr);
    var bp=AMT_BP[status];
    var tmt=(ord<=bp?ord*AMT_LOW:bp*AMT_LOW+(ord-bp)*AMT_HIGH)+pr*0.15;
    return r2(pos(r2(tmt)-regularTax));
  }
  // --- Education credits (Form 8863) -----------------------------------------
  function educationCredits(status, magi, aotcExp, aotcStudents, llcExp){
    if(status==="married_separately") return {nonref:0, refund:0};
    var joint=(status==="married_jointly"||status==="qualifying_surviving_spouse");
    var ph=joint?EDU_PH.joint:EDU_PH.single;
    var factor=1;
    if(magi>ph.e) factor=0; else if(magi>ph.s) factor=(ph.e-magi)/(ph.e-ph.s);
    var per=aotcStudents>0?aotcExp/aotcStudents:0, aotcGross=0;
    for(var i=0;i<aotcStudents;i++){
      var exp=Math.min(per,4000);
      aotcGross+=Math.min(Math.min(exp,2000)+0.25*pos(Math.min(exp,4000)-2000), AOTC_MAX);
    }
    var aotc=r2(aotcGross*factor);
    var refund=r2(aotc*AOTC_REFUND), nonref=r2(aotc-refund);
    var llc=r2(Math.min(llcExp,LLC_MAXEXP)*LLC_RATE2*factor);
    return { nonref:r2(nonref+llc), refund:refund };
  }
  // --- Saver's Credit (Form 8880) --------------------------------------------
  function saversCredit(status, agi, contrib){
    var tiers=SAVERS[status], rate=0;
    for(var i=0;i<tiers.length;i++){ if(agi<=tiers[i][1]){ rate=tiers[i][0]; break; } }
    var joint=(status==="married_jointly"||status==="qualifying_surviving_spouse");
    var cap=joint?SAVERS_MAX*2:SAVERS_MAX;
    return r2(Math.min(contrib,cap)*rate);
  }
  // --- Schedule D netting + loss limit + carryover ---------------------------
  function scheduleD(status, st, lt){
    var line16=st+lt;
    if(line16>=0) return { gain:r2(line16), eligibleLT:r2(pos(Math.min(lt,line16))), carry:0 };
    var limit=status==="married_separately"?CAP_LOSS_LIMIT_MFS:CAP_LOSS_LIMIT;
    var allowed=Math.max(line16,-limit);
    return { gain:r2(allowed), eligibleLT:0, carry:r2(line16-allowed) };
  }

  function taxFromBrackets(amount, brackets){
    if(amount<=0) return 0;
    var tax=0, lower=0;
    for(var i=0;i<brackets.length;i++){
      var rate=brackets[i][0], up=brackets[i][1];
      if(amount>lower){ tax += (Math.min(amount,up)-lower)*rate; lower=up; } else break;
    }
    return tax;
  }
  function marginalRate(ti, status){
    var b=ORD[status], rate=0, lower=0;
    for(var i=0;i<b.length;i++){ if(ti>lower) rate=b[i][0]; lower=b[i][1]; }
    return rate;
  }
  function stdDeduction(inp, earned){
    var s=inp.filingStatus, base=STD[s];
    if(inp.claimedAsDependent){ base=Math.min(base, Math.max(1350, earned+450)); }
    var boxes=0;
    if(inp.taxpayerAge65OrOlder) boxes++;
    if(inp.taxpayerBlind) boxes++;
    if(s==="married_jointly"||s==="qualifying_surviving_spouse"||s==="married_separately"){
      if(inp.spouseAge65OrOlder) boxes++;
      if(inp.spouseBlind) boxes++;
    }
    return base + boxes*ADD_STD[s];
  }
  function itemized(inp, agi){
    var it=inp.itemized||{};
    var medical=pos(nz(it.medicalExpenses)-agi*MED_FLOOR);
    var salt=Math.min(nz(it.stateAndLocalTaxes), SALT_CAP);
    return pos(medical+salt+nz(it.mortgageInterest)+nz(it.charitableContributions)+nz(it.other));
  }
  function qbiDeduction(qbi, tiBeforeQBI, netCapPref, status, warnings){
    if(qbi<=0) return 0;
    var tentative=qbi*QBI_RATE;
    var limit=pos(tiBeforeQBI-netCapPref)*QBI_RATE;
    if(tiBeforeQBI>QBI_THRESH[status]) warnings.push("QBI: taxable income exceeds the Section 199A threshold; W-2 wage / UBIA limits may reduce this deduction. Verify with Form 8995-A.");
    return r2(Math.min(tentative, limit));
  }
  function seniorDeduction(inp, magi){
    var c=0;
    if(inp.taxpayerAge65OrOlder) c++;
    if((inp.filingStatus==="married_jointly"||inp.filingStatus==="qualifying_surviving_spouse")&&inp.spouseAge65OrOlder) c++;
    if(c===0) return 0;
    var gross=c*SENIOR_AMT, reduction=pos(magi-SENIOR_START[inp.filingStatus])*SENIOR_RATE;
    return r2(pos(gross-reduction));
  }
  function tipsDeduction(inp, magi){
    var claimed=Math.min(nz(inp.qualifiedTips), TIPS_CAP);
    if(claimed<=0) return 0;
    var over=Math.ceil(pos(magi-TIPS_START[inp.filingStatus])/1000);
    return r2(pos(claimed - over*TIPS_PER1000));
  }
  function overtimeDeduction(inp, magi){
    var cap=OT_CAP[inp.filingStatus], claimed=Math.min(nz(inp.qualifiedOvertime), cap);
    if(claimed<=0) return 0;
    var over=Math.ceil(pos(magi-OT_START[inp.filingStatus])/1000);
    return r2(pos(claimed - over*OT_PER1000));
  }
  function taxWithPreferential(ti, pref, status){
    var b=ORD[status];
    pref=Math.min(pos(pref), pos(ti));
    var ordinary=pos(ti-pref);
    var ordinaryTax=taxFromBrackets(ordinary,b);
    var bp=LTCG[status], remaining=pref, stack=ordinary, prefTax=0;
    var at0=Math.min(remaining, pos(bp.z-stack)); stack+=at0; remaining-=at0;
    var at15=Math.min(remaining, pos(bp.f-stack)); prefTax+=at15*0.15; stack+=at15; remaining-=at15;
    prefTax+=pos(remaining)*0.20;
    return { ordinaryTax:r2(ordinaryTax), preferentialTax:r2(prefTax) };
  }
  function seTax(netProfit, wages){
    if(netProfit<=0) return 0;
    var ne=netProfit*SE_FACTOR;
    if(ne<400) return 0;
    var ssRoom=pos(SS_BASE-pos(wages));
    return r2(Math.min(ne,ssRoom)*SS_RATE + ne*MED_RATE);
  }
  function addlMedicare(wages, seNe, status){
    return r2(pos(pos(wages)+pos(seNe)-ADDL_MED_THRESH[status])*ADDL_MED_RATE);
  }
  function niit(inv, magi, status){
    return r2(pos(Math.min(pos(inv), pos(magi-NIIT_THRESH[status])))*NIIT_RATE);
  }
  function childCredits(inp, agi, taxBefore, earned){
    var deps=inp.dependents||[];
    var numCTC=deps.filter(function(d){return d.qualifiesForCTC;}).length;
    var numODC=deps.filter(function(d){return d.qualifiesForODC&&!d.qualifiesForCTC;}).length;
    if(numCTC===0&&numODC===0) return {ctc:0, ctcRef:0, odc:0};
    var potCTC=numCTC*CTC_PER, potODC=numODC*ODC;
    var over=Math.ceil(pos(agi-CTC_PHASE[inp.filingStatus])/1000);
    var phase=over*1000*CTC_RATE;
    var ctcAfter=pos(potCTC-phase);
    phase=pos(phase-potCTC);
    var odcAfter=pos(potODC-phase);
    var ctcNon=Math.min(ctcAfter, pos(taxBefore));
    var odcNon=Math.min(odcAfter, pos(taxBefore-ctcNon));
    var ctcLeft=pos(ctcAfter-ctcNon);
    var refCap=numCTC*CTC_REF_CAP;
    var earnedBased=pos(earned-ACTC_FLOOR)*ACTC_RATE;
    var ctcRef=r2(Math.min(ctcLeft, refCap, earnedBased));
    return { ctc:r2(ctcNon), ctcRef:ctcRef, odc:r2(odcNon) };
  }
  function eitc(inp, agi, earned, inv){
    if(inv>EITC_INV_LIMIT) return 0;
    if(inp.filingStatus==="married_separately") return 0;
    var deps=inp.dependents||[];
    var kids=deps.filter(function(d){return d.qualifiesForCTC||d.qualifiesForODC;}).length;
    var p=EITC[Math.min(kids,3)];
    var joint=(inp.filingStatus==="married_jointly"||inp.filingStatus==="qualifying_surviving_spouse");
    var ps=joint?p.psJ:p.psS, pe=joint?p.peJ:p.peS;
    var fromEarned=Math.min(earned*p.rate, p.max);
    var base=Math.max(earned, agi), credit=fromEarned;
    if(base>ps){ credit=pos(p.max-(base-ps)*p.por); credit=Math.min(credit, fromEarned); }
    if(base>=pe) credit=0;
    return r2(credit);
  }

  function computeTax(inp){
    var warnings=[];
    var s=inp.filingStatus;
    var wages=nz(inp.wages), interest=nz(inp.taxableInterest), ordDiv=nz(inp.ordinaryDividends);
    var qualDiv=Math.min(nz(inp.qualifiedDividends), ordDiv);
    var stcg=nz(inp.netShortTermCapitalGains), ltcgIn=nz(inp.netLongTermCapitalGains);
    var d=scheduleD(s, stcg, ltcgIn);
    var capTotal=d.gain;
    var retire=nz(inp.retirementDistributions);
    var seProfit=nz(inp.selfEmploymentNetProfit), other=nz(inp.otherIncome);
    var taxExempt=nz(inp.taxExemptInterest);

    var seNe=seProfit>0?seProfit*SE_FACTOR:0;
    var seT=seTax(seProfit, wages);
    var seDed=r2(seT/2);
    var adjustments=r2(nz(inp.adjustments)+seDed);

    // Taxable Social Security via the exact worksheet (from gross benefits),
    // unless an explicit taxable amount was provided.
    var incomeExclSS=r2(wages+interest+ordDiv+capTotal+retire+seProfit+other);
    var ss = (typeof inp.taxableSocialSecurity==="number")
      ? r2(inp.taxableSocialSecurity)
      : ssWorksheet(s, nz(inp.socialSecurityBenefits), incomeExclSS, taxExempt, adjustments);

    var totalIncome=r2(incomeExclSS+ss);
    var agi=r2(pos(totalIncome-adjustments));
    var magi=r2(agi+taxExempt);
    var earned=r2(wages+pos(seProfit));

    var std=r2(stdDeduction(inp, earned));
    var item=r2(itemized(inp, agi));
    var method = inp.deductionMethod==="itemized"?"itemized":inp.deductionMethod==="standard"?"standard":(item>std?"itemized":"standard");
    var baseDed=method==="itemized"?item:std;

    var senior=seniorDeduction(inp, magi), tips=tipsDeduction(inp, magi), ot=overtimeDeduction(inp, magi);
    var pref=r2(pos(qualDiv)+pos(d.eligibleLT));
    var tiBeforeQBI=r2(pos(agi-baseDed-senior-tips-ot));
    var qbi=qbiDeduction(nz(inp.qualifiedBusinessIncome), tiBeforeQBI, pref, s, warnings);
    var taxableIncome=r2(pos(tiBeforeQBI-qbi));

    var cappedPref=Math.min(pref, taxableIncome);
    var tw=taxWithPreferential(taxableIncome, cappedPref, s);
    var tentative=r2(tw.ordinaryTax+tw.preferentialTax);

    // Alternative Minimum Tax (Form 6251).
    var saltAdd = method==="itemized" ? Math.min(nz(inp.stateAndLocalTaxes)||(inp.itemized&&nz(inp.itemized.stateAndLocalTaxes))||0, SALT_CAP) : 0;
    var amt=amtTax(s, taxableIncome, method==="standard", std, saltAdd, nz(inp.amtPreferences), tentative, cappedPref);

    var am=addlMedicare(wages, seNe, s);
    var inv=r2(interest+ordDiv+pos(capTotal));
    var ni=niit(inv, magi, s);
    var totalBefore=r2(tentative+amt+seT+am+ni);

    // Credits: CTC/ODC (8812), education (8863), saver's (8880), EIC.
    var taxForNonref=r2(tentative+amt);
    var cc=childCredits(inp, agi, taxForNonref, earned);
    var edu=educationCredits(s, magi, nz(inp.aotcExpenses), nz(inp.aotcStudents), nz(inp.llcExpenses));
    var savers=saversCredit(s, agi, nz(inp.retirementContributions));
    var eic=eitc(inp, agi, earned, inv);
    var nonRef=r2(Math.min(cc.ctc+cc.odc+edu.nonref+savers, taxForNonref));
    var refCredits=r2(cc.ctcRef+eic+edu.refund);

    var totalTax=r2(pos(totalBefore-nonRef));
    var withholding=nz(inp.federalWithholding), estimated=nz(inp.estimatedPayments);
    var totalPayments=r2(withholding+estimated+refCredits);
    var refundOwed=r2(totalPayments-totalTax);
    var effRate=totalIncome>0?r2(totalTax/totalIncome*1000)/1000:0;

    var lineItems=[
      ["1a","Wages (W-2 box 1)",wages],
      ["2b","Taxable interest",interest],
      ["3a","Qualified dividends",qualDiv],
      ["3b","Ordinary dividends",ordDiv],
      ["4b/5b","Retirement distributions (taxable)",retire],
      ["6b","Taxable Social Security",ss],
      ["7","Capital gain (Schedule D)",capTotal],
      ["8","Schedule C / other income",r2(seProfit+other)],
      ["9","Total income",totalIncome],
      ["10","Adjustments to income",adjustments],
      ["11","Adjusted gross income (AGI)",agi],
      ["12","Deduction ("+method+")",baseDed],
      ["13a","OBBBA senior deduction",senior],
      ["13b","OBBBA tips deduction",tips],
      ["13c","OBBBA overtime deduction",ot],
      ["13d","Qualified business income deduction",qbi],
      ["15","Taxable income",taxableIncome],
      ["16","Tax (with cap-gain worksheet)",tentative],
      ["S2-1","Alternative Minimum Tax",amt],
      ["23a","Self-employment tax",seT],
      ["23b","Additional Medicare Tax",am],
      ["23c","Net Investment Income Tax",ni],
      ["19","Child Tax Credit (non-refundable)",cc.ctc],
      ["19b","Credit for Other Dependents",cc.odc],
      ["S3-3","Education credits (nonrefundable)",edu.nonref],
      ["S3-4","Saver's credit",savers],
      ["27","Earned Income Tax Credit",eic],
      ["28","Additional Child Tax Credit (refundable)",cc.ctcRef],
      ["29","Education credit (refundable AOTC)",edu.refund],
      ["22","Total tax",totalTax],
      ["25","Federal tax withheld",withholding],
      ["26","Estimated payments",estimated],
      ["33","Total payments",totalPayments],
      [refundOwed>=0?"34":"37", refundOwed>=0?"Refund":"Amount you owe", Math.abs(refundOwed)]
    ];

    return {
      totalIncome:totalIncome, adjustedGrossIncome:agi, modifiedAGI:magi, deductionMethodUsed:method,
      standardDeduction:std, itemizedDeduction:item, deductionTaken:baseDed,
      seniorDeduction:senior, tipsDeduction:tips, overtimeDeduction:ot,
      obbbaAdditionalDeductions:r2(senior+tips+ot), qbiDeduction:qbi,
      taxableIncome:taxableIncome, preferentialIncome:cappedPref, tentativeTax:tentative,
      regularTax:tentative, alternativeMinimumTax:amt,
      adjustmentsToIncome:adjustments, scheduleCNetProfit:seProfit,
      taxableSocialSecurity:ss, netCapitalGain:capTotal, capitalLossCarryoverNextYear:d.carry,
      selfEmploymentTax:seT, additionalMedicareTax:am, netInvestmentIncomeTax:ni,
      totalOtherTaxes:r2(seT+am+ni),
      childTaxCredit:cc.ctc, otherDependentCredit:cc.odc, additionalChildTaxCredit:cc.ctcRef,
      educationCreditNonRefundable:edu.nonref, educationCreditRefundable:edu.refund, saversCredit:savers,
      earnedIncomeCredit:eic, totalTax:totalTax, totalPayments:totalPayments,
      refundOwed:refundOwed, effectiveRate:effRate, marginalRate:marginalRate(taxableIncome,s),
      lineItems:lineItems, warnings:warnings
    };
  }

  var api = { computeTax:computeTax, taxFromBrackets:taxFromBrackets, ORD:ORD };
  if (typeof module!=="undefined" && module.exports) module.exports = api;
  root.TaxEngine = api;
})(typeof window!=="undefined" ? window : this);
