(function(root){
 const usd=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const cop=n=>Number(n).toLocaleString('en-US')+' COP';
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const monthLabel=m=>new Date(m+'-02T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
 function render(el,entries,{detail=false}={}){
  const f=ChambaFinance.calculate(entries), revenue=f.totalRevenueCOP;
  const expenses=f.actual.filter(e=>e.type==='Expense').reduce((s,e)=>s+Number(e.amount_cop),0);
  const monthly=f.monthly.map(r=>({...r,expenses:f.actual.filter(e=>e.type==='Expense'&&e.date.slice(0,7)===r.month).reduce((s,e)=>s+Number(e.amount_cop),0)}));
  const max=Math.max(1,...monthly.flatMap(r=>[r.revenueCOP,r.expenses,r.appliedCOP]));
  const progress=Math.min(100,f.appliedUSD/70000*100);
  el.innerHTML=`<div class="fv">
   <div class="fv-kicker">Chamba / ${detail?'Investment & payback':'Financial overview'}</div>
   <h1>${detail?'Your investment, clearly tracked.':'See where the money goes.'}</h1>
   <p>${detail?'Follow your funding and calculated repayment credit in one place.':'Revenue, spending, and your share. Choose a month to see the full calculation.'}</p>
   <div class="fv-status"><span>Average rate · 3,300 COP/USD</span><span>${f.actual.length} actual transactions</span><span>Current month is provisional</span></div>
   ${!detail?`<div class="fv-grid">${[['Revenue',revenue,'fv-green'],['Operating expenses',expenses,''],['Business net',revenue-expenses,revenue-expenses<0?'fv-red':'fv-green']].map(([label,value,color])=>`<div class="fv-card"><small>${label} · all time</small><div class="fv-value ${color}">${usd(value/3300)}</div><small>${cop(value)}</small></div>`).join('')}</div>`:''}
   <div class="fv-split">
    <section class="fv-card"><div class="fv-row"><h2>${detail?'Repayment progress':'Your payback credit'}</h2><small>${progress.toFixed(1)}% of target</small></div><div class="fv-value fv-gold">${usd(f.appliedUSD)}</div><p>Calculated credit toward your $70,000 target</p><progress aria-label="Calculated payback progress" max="70000" value="${Math.min(70000,f.appliedUSD)}"></progress><div class="fv-row"><small>${usd(Math.max(0,70000-f.appliedUSD))} remaining</small><strong>$70,000 target</strong></div><p class="fv-note">75% of positive monthly eligible profit. Loss months add zero and never reduce earlier credit.</p>${!detail?'<a href="/money#payback">Investment & payback details →</a>':''}</section>
    <section class="fv-card"><h2>Investment funding</h2><div class="fv-value">$24,474 <small>of $35,000</small></div><progress aria-label="Investment funding progress" max="35000" value="24474"></progress><div class="fv-row"><small>Still to fund</small><strong>$10,526</strong></div><details ${detail?'open':''}><summary>Three recorded tranches</summary>${[10000,9474,5000].map((n,i)=>`<div class="fv-row"><small>Tranche ${i+1}</small><strong>${usd(n)}</strong></div>`).join('')}<small>Funding totals reflect the existing investment plan.</small></details></section>
   </div>
   <section class="fv-card"><h2>Month by month</h2><p>Compare business activity with your payback credit. All bars use the same COP scale.</p><div class="fv-legend">${[['Revenue','#7ad5ab'],['Operating expenses','#8c99b4'],['Payback credit','#e8bd69']].map(([l,c])=>`<span><i class="fv-dot" style="background:${c}"></i>${l}</span>`).join('')}</div><div class="fv-chart">${monthly.map(r=>`<button type="button" class="fv-month" data-month="${r.month}" aria-label="${monthLabel(r.month)}: revenue ${cop(r.revenueCOP)}, expenses ${cop(r.expenses)}, payback ${usd(r.appliedUSD)}"><div class="fv-bars">${[[r.revenueCOP,'#7ad5ab'],[r.expenses,'#8c99b4'],[r.appliedCOP,'#e8bd69']].map(([v,c])=>`<span class="fv-bar" style="height:${v/max*100}%;background:${c}"></span>`).join('')}</div><small>${monthLabel(r.month)}</small></button>`).join('')||'<p>No actual transactions yet.</p>'}</div></section>
   <section class="fv-card" style="margin-top:20px"><div class="fv-row"><h2>How your share is calculated</h2><label><small>Month </small><select class="fv-select" aria-label="Payback month">${monthly.map(r=>`<option value="${r.month}">${monthLabel(r.month)}</option>`).join('')}</select></label></div><div class="fv-breakdown"></div></section>
   ${detail?`<div class="fv-grid"><section class="fv-card"><small>Calculated credit</small><div class="fv-value fv-gold">${usd(f.appliedUSD)}</div><p>Earned under your agreed formula.</p></section><section class="fv-card"><small>Cash paid to you</small><div class="fv-value">Not tracked</div><p>No separate payment ledger is connected. Credit does not confirm a cash transfer.</p></section><section class="fv-card"><small>Reinvested payback</small><div class="fv-value">Not tracked</div><p>Your plan is to reinvest. Actual reinvestments need separate records.</p></section></div>`:''}
  </div>`;
  const select=el.querySelector('select');
  function show(month){
   const r=monthly.find(r=>r.month===month);if(!r){el.querySelector('.fv-breakdown').innerHTML='<p>Add actual transactions to see the calculation.</p>';return;}
   select.value=month;
   const rows=f.actual.filter(e=>e.date.slice(0,7)===month);
   el.querySelector('.fv-breakdown').innerHTML=`<div class="fv-flow">${[['Revenue',r.revenueCOP],['− Studio rent',r.rentCOP],['− Javier allowance',r.salaryCOP],['= Eligible profit',r.netCOP]].map(([label,n])=>`<div class="fv-step"><small>${label}</small><strong>${usd(n/3300)}</strong><small>${cop(n)}</small></div>`).join('')}</div><div class="fv-row"><span>${r.netCOP>0?'Positive eligible profit × 75%':'No positive eligible profit this month'}</span><strong class="fv-gold">${usd(r.appliedUSD)} credit</strong></div><p class="fv-note">Other salaries and variable expenses affect business net, but do not reduce your payback. Javier’s allowance is 2,750,000 COP once per month, independent of recorded salary payments.</p><details><summary>View ${rows.length} underlying transactions</summary><div class="fv-table-wrap"><table><thead><tr><th>Transaction</th><th>Date</th><th>Type</th><th>COP</th><th>Payback treatment</th></tr></thead><tbody>${rows.map(e=>`<tr><td>${esc(e.description)}</td><td>${esc(e.date.slice(0,10))}</td><td>${esc(e.type)}</td><td>${cop(Number(e.amount_cop))}</td><td>${e.type==='Income'?'Revenue':e.category==='Studio Rent'?'Rent deduction':e.category==='Javier Salary'?'Covered by monthly allowance':'Excluded from payback'}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  select.addEventListener('change',()=>show(select.value));
  el.querySelectorAll('[data-month]').forEach(b=>b.addEventListener('click',()=>{show(b.dataset.month);select.focus();}));
  show(monthly.at(-1)?.month);
 }
 root.ChambaFinanceView={render};
})(globalThis);
