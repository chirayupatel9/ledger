// Tax tags group transactions by ITR income head and deduction section. Section names follow the Income-tax Act, 1961,
// which governs FY 2025-26. The Income-tax Act, 2025 applies from tax year 2026-27 and renumbers these sections.
export const taxTags=[
 {id:'salary',label:'Salary',group:'income',head:'Salaries'},
 {id:'business',label:'Business / professional receipts',group:'income',head:'Business or profession'},
 {id:'rent-received',label:'Rent received',group:'income',head:'House property'},
 {id:'interest-savings',label:'Savings account interest',group:'income',head:'Other sources',note:'80TTA / 80TTB deduction in the old regime'},
 {id:'interest-deposit',label:'FD / RD interest',group:'income',head:'Other sources'},
 {id:'dividend',label:'Dividends',group:'income',head:'Other sources'},
 {id:'capital-gains',label:'Sale proceeds of investments',group:'income',head:'Capital gains',note:'Proceeds, not gains: use your broker’s capital-gains statement'},
 {id:'other-income',label:'Other income',group:'income',head:'Other sources'},
 {id:'80c',label:'80C · PPF, ELSS, life insurance, tuition',group:'deduction',section:'80C',regime:'old',limit:15000000},
 {id:'80ccd1b',label:'80CCD(1B) · NPS own contribution',group:'deduction',section:'80CCD(1B)',regime:'old',limit:5000000},
 {id:'80d',label:'80D · Health insurance',group:'deduction',section:'80D',regime:'old'},
 {id:'80e',label:'80E · Education-loan interest',group:'deduction',section:'80E',regime:'old'},
 {id:'80g',label:'80G · Donations',group:'deduction',section:'80G',regime:'old'},
 {id:'24b',label:'24(b) · Home-loan EMI',group:'deduction',section:'24(b)',regime:'old',limit:20000000,note:'EMIs include principal (80C) and interest (24(b)); split them using the lender’s certificate'},
 {id:'rent-paid',label:'Rent paid · HRA / 80GG',group:'deduction',section:'HRA / 80GG',regime:'old'},
 {id:'tax-paid',label:'Income tax paid (advance, self-assessment, TDS)',group:'tax'},
 {id:'gst-paid',label:'GST paid',group:'tax'},
 {id:'business-expense',label:'Business expense',group:'business'},
 {id:'none',label:'Not tax-relevant',group:'none'},
];
export const taxTagIds=taxTags.map(t=>t.id);
const byId=Object.fromEntries(taxTags.map(t=>[t.id,t]));
// Conservative narration-based suggestions; anything ambiguous (e.g. motor insurance) stays untagged.
function suggest(t){
 const d=t.description||'',c=t.category;
 if(t.amount>0){
  if(c==='Salary')return 'salary';
  if(c==='Interest')return /\b(?:fd|td|rd)\b|fixed dep|term dep|recurring/i.test(d)?'interest-deposit':'interest-savings';
  if(c==='Dividends')return 'dividend';
  if(c==='Rental income')return 'rent-received';
  if(c==='Freelance & business'&&t.type==='Income')return 'business';
  return null;
 }
 if(/\bppf\b|public provident|\belss\b|tax ?saver|sukanya|\bssy\b|\bnsc\b/i.test(d))return '80c';
 if(/\bnps\b|nsdl cra|protean|\bpran\b/i.test(d))return '80ccd1b';
 if(c==='Insurance')return /health|mediclaim|niva bupa|manipal cigna/i.test(d)?'80d':/\blic\b|life|max life|sbi life|tata aia|icici pru/i.test(d)?'80c':null;
 if(c==='Donations')return '80g';
 if(c==='Education'&&/school|college|universit|tuition/i.test(d))return '80c';
 if(c==='Loan EMI')return /education loan|edu(?:cation)? ?loan/i.test(d)?'80e':/home loan|\bhsg\b|housing/i.test(d)?'24b':null;
 if(c==='Rent')return 'rent-paid';
 if(c==='Fees & charges'&&/^(?:[cis]?gst)\b|\bgst on\b/i.test(d))return 'gst-paid';
 if(c==='Taxes')return /\bgst\b|\bcbic\b/i.test(d)?'gst-paid':/property tax|professional tax/i.test(d)?null:'tax-paid';
 return null;
}
export function taxTagFor(t){
 if(t.taxTag)return t.taxTag==='none'?null:{...byId[t.taxTag],source:'Your tag'};
 const id=suggest(t);return id?{...byId[id],source:'Suggested'}:null;
}
export function taxSummary(rows){
 const groups={income:{},deduction:{},tax:{},business:{}};let untagged={amount:0,count:0};
 for(const t of rows){
  const tag=taxTagFor(t);
  if(!tag){if(t.type==='Income'&&!t.taxTag){untagged.amount+=t.amount;untagged.count++;}continue;}
  const line=groups[tag.group][tag.id]??={...tag,amount:0,count:0,suggested:0};
  line.amount+=tag.group==='income'?t.amount:-t.amount;line.count++;if(tag.source==='Suggested')line.suggested++;
 }
 const list=g=>Object.values(groups[g]).sort((a,b)=>taxTagIds.indexOf(a.id)-taxTagIds.indexOf(b.id));
 return {income:list('income'),deductions:list('deduction'),taxes:list('tax'),business:list('business'),untagged};
}
export function financialYear(date){const y=Number(date.slice(0,4));return Number(date.slice(5,7))<4?y-1:y;}
