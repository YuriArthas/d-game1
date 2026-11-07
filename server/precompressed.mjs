/** Explicit gzip;q=0 overrides a wildcard. No header means use identity. */
function qualityOf(header,encoding) {
  const encodings=new Map(String(header).split(',').map(part=>{
    const [name,...parameters]=part.trim().toLowerCase().split(';');
    const quality=parameters.map(p=>p.trim()).find(p=>p.startsWith('q='));
    const q=quality===undefined?1:Number(quality.slice(2));
    return [name.trim(),Number.isFinite(q)&&q>=0&&q<=1?q:0];
  }));
  return encodings.get(encoding)??encodings.get('*')??0;
}
export const acceptsGzip=(header='')=>qualityOf(header,'gzip')>0;
// identity is acceptable unless it (or a wildcard without an identity override)
// is explicitly refused. It need not appear in Accept-Encoding.
export function acceptsIdentity(header=''){
  const parts=String(header).toLowerCase().split(',').map(p=>p.trim().split(';')[0].trim());
  return parts.includes('identity')?qualityOf(header,'identity')>0:!parts.includes('*')||qualityOf(header,'*')>0;
}
export function selectContentEncoding(header='',available={br:false,gzip:false}){
  return ['br','gzip'].filter(name=>available[name]&&qualityOf(header,name)>0).sort((a,b)=>qualityOf(header,b)-qualityOf(header,a))[0]??null;
}
