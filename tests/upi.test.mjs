import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionLabel,parseUPI} from '../packages/domain/transaction-labels.js';

const label=(description,amount=-50000)=>transactionLabel({description,amount,type:amount<0?'Expense':'Income'});
const pick=(d,a)=>{const l=label(d,a);return [l.title,l.upi?.id||'',l.upi?.note||''];};

test('UPI narrations from each bank name the payee, their UPI ID and your note',()=>{
 const cases=[
  // ICICI statements: the name, its UPI ID, your note ("UPI" when you wrote none), the payee's bank, the reference.
  ['RAMESH KUMAR UPI/RAMESH KUMAR/ramesh.k@okhdfcbank/UPI/YES BANK LIMITED/628512345678/YBL0f3a19c 2d4e/',['Ramesh Kumar','ramesh.k@okhdfcbank','']],
  ['RAMESH KUMAR UPI/RAMESH KUMAR/ramesh.k@okhdfcbank/Rent October/HDFC BANK/628512345678/HDF1a2b3c4d 5e/',['Ramesh Kumar','ramesh.k@okhdfcbank','Rent October']],
  ['UPI/RAMESH KUMAR/ramesh@ybl/Dinner/YES BANK LIMITED/628512345678/YBL1a2b3c4d5e',['Ramesh Kumar','ramesh@ybl','Dinner']],
  ['ANITA S UPI/ANITA S/9876543210-2@ybl/UPI/YES BANK LIMITED/628512345679/YBL99aa',['Anita S','9876543210-2@ybl','']],
  // HDFC: hyphens, with the payee bank's IFSC.
  ['UPI-RAMESH KUMAR-ramesh@ybl-YESB0000001-628512345678-Rent',['Ramesh Kumar','ramesh@ybl','Rent']],
  ['UPI-MEENA DEVI-meena.devi@okicici-ICIC0001234-628512345678-UPI',['Meena Devi','meena.devi@okicici','']],
  // SBI, IDFC, Yes: direction and reference first; names may be cut short.
  ['UPI/DR/628512345678/RAMESH KUM/YESB/ramesh@yb/Rent',['Ramesh Kum','ramesh@yb','Rent']],
  ['TO TRANSFER-UPI/DR/628512345678/PRIYA SHAR/SBIN/priya.s@oksbi/UPI--',['Priya Shar','priya.s@oksbi','']],
  ['UPI/628512345678/DR/MEENA DEVI/HDFC/meena@okhdfcbank',['Meena Devi','meena@okhdfcbank','']],
  // Axis: P2A to a person, P2M to a merchant.
  ['UPI/P2A/628512345678/RAMESH KUMAR/Dinner/YES BANK',['Ramesh Kumar','','Dinner']],
  // Kotak.
  ['UPI/RAMESH KUMAR/628512345678/Rent',['Ramesh Kumar','','Rent']],
 ];
 for(const [d,want] of cases)assert.deepEqual(pick(d),want,d);
});

test('merchants are named by brand, even when the narration has the company’s legal name',()=>{
 for(const [d,brand] of [['BUNDL TECHNOLOGIES UPI/BUNDL TECHNOLOGIES/swiggy.stores@axisbank/UPI/AXIS BANK/628512345670/AXL123abc45','Swiggy'],
  ['UPI/P2M/628512345678/AVENUE SUPERMARTS/Payment fo/YES BANK','DMart'],['UPI-KIRANAKART TECHNOLOGIES-zepto.payu@hdfcbank-HDFC0MERUPI-628512345678-UPI','Zepto'],
  ['ONE97 COMMUNICATIONS UPI/ONE97 COMMUNICATIONS/paytm-12345@paytm/UPI/YES BANK LIMITED/628512345678/YBL12ab34cd','Paytm'],['UPI/P2M/628512345678/ROPPEN TRANSPORTATION/Ride/AXIS BANK','Rapido']])
  assert.equal(label(d).title,brand,d);
 assert.equal(label('UPI/P2M/628512345678/AVENUE SUPERMARTS/Payment fo/YES BANK').upi,undefined,'a default note adds nothing');
});

test('with no name, the UPI ID says who; with nothing at all, it stays a UPI payment',()=>{
 assert.equal(label('UPI/9988776655@paytm/628500000001/Paid via Paytm').title,'9988776655@paytm');
 assert.equal(label('UPI/CR/628500000002/q123456789@ybl/YES BANK').title,'q123456789@ybl');
 assert.equal(label('UPI/DR/628500000003').title,'UPI payment');assert.equal(label('UPI/CR/628500000004',50000).title,'UPI credit');
});

test('money received names who paid you; refunds and reversals keep their meaning',()=>{
 assert.deepEqual(pick('KAVYA RAO UPI/KAVYA RAO/kavya.rao@okaxis/Dinner split/AXIS BANK/628512345678/AXL0a1b2c3d',75000),['Kavya Rao','kavya.rao@okaxis','Dinner split']);
 assert.equal(label('UPI/REFUND/628512345678/RAHUL/HDFC',50000).title,'Refund · Rahul');
 assert.equal(label('UPI/REV/628512345678/SWIGGY',50000).title,'Reversal · Swiggy');
});

test('reading a UPI narration never changes the transaction',()=>{
 const t={description:'UPI-RAMESH KUMAR-ramesh@ybl-YESB0000001-628512345678-Rent',amount:-50000};const copy=JSON.stringify(t);
 transactionLabel(t);assert.equal(JSON.stringify(t),copy);
 assert.equal(parseUPI('NEFT CR-HDFC0000123-ACME'),null,'not UPI');
 assert.equal(label('UPI/RAMESH KUMAR/ramesh@ybl/Rent/YES BANK/628512345678',-1).upi.reference,'628512345678');
});

test('app-generated notes are not shown as your note',()=>{
 for(const note of ['UPI','Payment from Ph','Paid via Paytm','Sent using Paytm U','COLLECT REQ','Amazon Pay','Pay To','NA','4021234567'])
  assert.equal(label(`RAMESH KUMAR UPI/RAMESH KUMAR/ramesh@ybl/${note}/YES BANK L/628512345678/YBL0a1b2c3d`).upi?.note||'','',note);
 assert.equal(label('RAMESH KUMAR UPI/RAMESH KUMAR/ramesh@ybl/Momos/KOTAK MAHINDRA B/628512345678/KKB0a1b2c3d').upi.note,'Momos','a note you typed, with the bank name cut short');
 assert.equal(label('RAMESH KUMAR UPI/RAMESH KUMAR/rameshkumar/UPI/STATE BANK OF I/628512345678/SBI0a1b2c3').upi.id,'rameshkumar','an ID without @ in the ID position');
});
