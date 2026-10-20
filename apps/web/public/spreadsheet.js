import {findTable} from './core.js';
// Excel exports (SBI, HDFC, ICICI, Axis, Kotak). Dates are read from cell serials so a US "m/d/yy" cell format cannot flip day and month.
function cellText(XLSX,cell){
 if(!cell||cell.v==null)return '';
 if(cell.t==='n'){if(cell.z&&XLSX.SSF.is_date(cell.z)){const d=XLSX.SSF.parse_date_code(cell.v);if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}return String(Math.round(cell.v*1e6)/1e6);}
 if(cell.t==='d'&&cell.v instanceof Date)return cell.v.toISOString().slice(0,10);
 return String(cell.w??cell.v).trim();
}
function sheetRows(XLSX,sheet){
 if(!sheet?.['!ref'])return [];const range=XLSX.utils.decode_range(sheet['!ref']),rows=[];
 for(let r=range.s.r;r<=Math.min(range.e.r,range.s.r+60000);r++){const row=[];for(let c=range.s.c;c<=Math.min(range.e.c,range.s.c+60);c++)row.push(cellText(XLSX,sheet[XLSX.utils.encode_cell({r,c})]));if(row.some(Boolean))rows.push(row);}
 return rows;
}
export async function readSpreadsheet(buffer){
 const XLSX=await import('./vendor/xlsx.mjs');
 let book;try{book=XLSX.read(new Uint8Array(buffer),{type:'array',cellNF:true,cellDates:false,dense:false});}catch{throw Error('This spreadsheet could not be opened. Export it again from your bank, or save it as CSV.');}
 let best=null;
 for(const name of book.SheetNames){try{const table=findTable(sheetRows(XLSX,book.Sheets[name]));if(!best||table.rows.length>best.rows.length)best=table;}catch{}}
 if(!best)throw Error('No transaction table found. The sheet needs Date, Narration/Description, and Debit/Credit or Amount columns.');
 return best;
}
