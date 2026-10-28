const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate,allEntries,RATE,SALARY_COP} = require('../public/finance');
const entry=(month,type,amount,category='',mode='Actual')=>({date:`2026-${month}-01`,type,amount_cop:amount,category,mode});
test('agreed rate and monthly salary; other salaries never deducted twice',()=>{
  const r=calculate([entry('06','Income',6050000),entry('06','Expense',2000000,'Studio Rent'),entry('06','Expense',2750000,'Javier Salary'),entry('06','Expense',9000000,'Other Salaries')],'2026-06-30');
  assert.equal(RATE,3300);assert.equal(SALARY_COP,2750000);assert.equal(r.appliedUSD,975000/3300);assert.equal(r.totalFixedCOP,4750000);
});
test('losses do not reduce later credit and monthly cumulative equals headline',()=>{
 const r=calculate([entry('05','Expense',2500000,'Studio Rent'),entry('06','Income',6050000)],'2026-06-30');
 assert.equal(r.appliedUSD,750);assert.equal(r.monthly[0].netCOP,-5250000);assert.equal(r.monthly[1].cumulativeUSD,750);
});
test('planned and future entries excluded; missing operating months get one allowance',()=>{
 const r=calculate([entry('05','Income',3300000),entry('07','Income',3300000),entry('07','Income',999999,'','Planned'),entry('08','Income',999999)],'2026-07-31');
 assert.equal(r.monthly.length,3);assert.equal(r.totalRevenueCOP,6600000);assert.equal(r.appliedUSD,250);
});
test('pagination includes records beyond 500',async()=>{
 const calls=[];const rows=await allEntries(async path=>{calls.push(path);return calls.length===1?Array(500).fill({}):[{}]},'track=Studio');
 assert.equal(rows.length,501);assert.match(calls[1],/offset=500/);assert.match(calls[1],/track=Studio/);
});
test('reviewed ledger monthly totals reconcile to agreed rules',()=>{
 const rows=[];
 for(const [m,income,rent] of [['05',0,2500000],['06',5920000,2500000],['07',6100000,2500000],['08',3200000,1500000],['09',180000,0],['10',4400000,2000000]]){
 rows.push(entry(m,'Income',income),entry(m,'Expense',rent,'Studio Rent'));
 }
 const r=calculate(rows,'2026-10-28');
 assert.equal(r.totalRevenueCOP,19800000);assert.equal(r.totalFixedCOP,27500000);
 assert.ok(Math.abs(r.appliedUSD-345.45454545454544)<0.000001);
 assert.deepEqual(r.monthly.map(m=>m.appliedCOP),[0,502500,637500,0,0,0]);
});
