import { namedRangeKey, namedRangeDisplay, mapNamedReferences } from "../shared/namedRanges.js";
const uuid=()=>globalThis.crypto.randomUUID();
function truncate(value,length){let text="";for(const char of value){if(text.length+char.length>length)break;text+=char;}return text;}
export function duplicateSheetName(sourceName,sheets){
  const base=`Копия листа ${sourceName}`,used=new Set(sheets.map(s=>namedRangeKey(s.name)));let n=1,name;
  do{const suffix=n===1?"":` (${n})`;name=truncate(base,60-suffix.length)+suffix;n++;}while(used.has(namedRangeKey(name)));
  return name;
}
export function duplicateSheet(state,sourceId,newId=uuid()){
  const source=state.sheets.find(s=>s.id===sourceId);
  if(!source)throw new Error("Лист больше не существует");
  if(state.sheets.length>=30)throw new Error("Не более 30 листов");
  if(typeof newId!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(newId)||state.sheets.some(s=>s.id===newId))throw new Error("Неверный или занятый идентификатор копии");
  const copy=structuredClone(source);copy.id=newId;copy.name=duplicateSheetName(source.name,state.sheets);
  for(const property of ["conditionalFormats","validations","bandedRanges","charts"])for(const item of copy[property]||[])item.id=uuid();
  const originals=state.namedRanges||[],byName=new Map();
  for(const item of originals.filter(n=>!n.scopeSheetId&&n.sheetId===source.id))byName.set(namedRangeKey(item.name),item);
  for(const item of originals.filter(n=>n.scopeSheetId===source.id))byName.set(namedRangeKey(item.name),item);
  const names=[...byName.values()].map(item=>({...structuredClone(item),id:uuid(),sheetId:item.sheetId===source.id?newId:item.sheetId,scopeSheetId:newId}));
  if(originals.length+names.length>1000)throw new Error("Не более 1000 именованных диапазонов");
  const mapping=new Map([...byName.values()].map((item,index)=>[item.id,names[index]])),sheets=[...state.sheets,copy];
  for(const cell of Object.values(copy.cells))if(!cell.literal&&cell.value?.startsWith("="))cell.value=mapNamedReferences(cell.value,originals,state.sheets,source.id,(item,raw)=>mapping.has(item.id)?namedRangeDisplay(mapping.get(item.id),sheets):raw);
  const warnings=(state.protections||[]).filter(rule=>rule.warningOnly&&rule.sheetId===source.id).map(rule=>{
    const next={...structuredClone(rule),id:uuid(),sheetId:newId};
    if(rule.namedRangeId){if(mapping.has(rule.namedRangeId))next.namedRangeId=mapping.get(rule.namedRangeId).id;else{delete next.namedRangeId;const named=originals.find(n=>n.id===rule.namedRangeId);if(named?.allRows)next.allRows=true;if(named?.allCols)next.allCols=true;}}
    return next;
  });
  if((state.protections||[]).length+warnings.length>1000)throw new Error("Не более 1000 защищённых диапазонов");
  state.sheets.splice(state.sheets.indexOf(source)+1,0,copy);
  if(names.length)state.namedRanges=[...originals,...names];
  if(warnings.length)state.protections=[...(state.protections||[]),...warnings];
  return copy;
}
