// Firestore disallows arrays directly inside arrays. Preserve domain tuples at the boundary.
const key='__formArray';
export function encodeStorage(v:any):any{
 if(Array.isArray(v))return v.map(item=>Array.isArray(item)?{[key]:encodeStorage(item)}:encodeStorage(item));
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encodeStorage(x)]));
 return v;
}
export function decodeStorage(v:any):any{
 if(Array.isArray(v))return v.map(decodeStorage);
 if(v&&typeof v==='object'){if(Object.keys(v).length===1&&Array.isArray(v[key]))return v[key].map(decodeStorage);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decodeStorage(x)]));}
 return v;
}
