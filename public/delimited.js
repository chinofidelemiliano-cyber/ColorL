export function parseSeparated(text){
 const lines=String(text).replace(/^\uFEFF/,'');
 const sample=(lines.split(/\r?\n/).find(line=>line.trim())||'').replace(/"(?:""|[^"])*"/g,'');
 const marks=['\t',';',',','|'];
 const separator=marks.sort((a,b)=>sample.split(b).length-sample.split(a).length)[0];
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<lines.length;i++){
  const char=lines[i];
  if(char==='"'){
   if(quoted&&lines[i+1]==='"'){cell+='"';i++;}
   else if(quoted||!cell)quoted=!quoted;
   else cell+=char;
  }else if(!quoted&&(char===separator||char==='\n'||char==='\r')){
   row.push(cell.trim());cell='';
   if(char!==separator){if(row.some(Boolean))rows.push(row);row=[];if(char==='\r'&&lines[i+1]==='\n')i++;}
  }else cell+=char;
 }
 if(quoted)throw new Error('Revisa las comillas sin cerrar del catálogo.');
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 return rows;
}
