/* Shared financial rules confirmed by Ryan on 2026-10-28. */
(function (root) {
  const RATE = 3300, SALARY_COP = 2750000, TARGET_USD = 70000;
  function calculate(entries, asOf = new Date().toISOString().slice(0, 10)) {
    const actual = entries.filter(e => e.mode === 'Actual' && String(e.date).slice(0,10) <= asOf);
    const months = {};
    for (const e of actual) {
      const month = String(e.date).slice(0,7);
      const row = months[month] ||= { month, revenueCOP: 0, rentCOP: 0 };
      if (e.type === 'Income') row.revenueCOP += Number(e.amount_cop || 0);
      if (e.type === 'Expense' && e.category === 'Studio Rent') row.rentCOP += Number(e.amount_cop || 0);
    }
    // The agreed monthly allowance applies once per operating month, even if no salary payment was entered.
    const first = Object.keys(months).sort()[0];
    if (first) {
      let [year, month] = first.split('-').map(Number);
      while (`${year}-${String(month).padStart(2,'0')}` <= asOf.slice(0,7)) {
        const key = `${year}-${String(month).padStart(2,'0')}`;
        months[key] ||= { month: key, revenueCOP: 0, rentCOP: 0 };
        if (++month > 12) { month = 1; year++; }
      }
    }
    let cumulativeCOP = 0;
    const monthly = Object.values(months).sort((a,b)=>a.month.localeCompare(b.month)).map(row => {
      const fixedCOP = row.rentCOP + SALARY_COP;
      const netCOP = row.revenueCOP - fixedCOP;
      const appliedCOP = Math.round(Math.max(0, netCOP) * 75) / 100;
      cumulativeCOP += appliedCOP;
      return { ...row, salaryCOP: SALARY_COP, fixedCOP, netCOP, appliedCOP, appliedUSD: appliedCOP / RATE, cumulativeUSD: cumulativeCOP / RATE };
    });
    return { actual, monthly, totalRevenueCOP: monthly.reduce((s,r)=>s+r.revenueCOP,0), totalFixedCOP: monthly.reduce((s,r)=>s+r.fixedCOP,0), appliedUSD: cumulativeCOP / RATE, rate: RATE, targetUSD: TARGET_USD };
  }
  async function allEntries(fetchPage, query = '') {
    const params = new URLSearchParams(query); params.set('limit','500');
    const all = [];
    for (let offset=0; ; offset+=500) {
      params.set('offset',String(offset));
      const page = await fetchPage('/entries?' + params);
      all.push(...page);
      if (page.length < 500) return all;
    }
  }
  const api = { RATE, SALARY_COP, TARGET_USD, calculate, allEntries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChambaFinance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
