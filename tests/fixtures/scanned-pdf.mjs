// A PDF holding only a photo of each page, like a scanned statement: no text layer, so it must be read with OCR.
// pages: [{jpeg, width, height}] in pixels; each page is printed 595 points wide (A4) at the image's proportions.
export function scannedPDF(pages){
 let out=Buffer.from('%PDF-1.4\n');const at=[],push=b=>{out=Buffer.concat([out,Buffer.isBuffer(b)?b:Buffer.from(b,'binary')]);},obj=(n,body)=>{at[n]=out.length;push(`${n} 0 obj\n`);push(body);push('\nendobj\n');};
 const kids=pages.map((_,i)=>`${3+i*3} 0 R`).join(' ');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
 pages.forEach(({jpeg,width,height},i)=>{const n=3+i*3,w=595,h=Math.round(595*height/width),content=`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  obj(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n+1} 0 R >> >> /Contents ${n+2} 0 R >>`);
  obj(n+1,Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream')]));
  obj(n+2,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);});
 const count=at.length,xref=out.length;push(`xref\n0 ${count}\n0000000000 65535 f \n${at.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 return out;
}
