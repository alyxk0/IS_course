import { useEffect, useRef } from "react";
import { Check } from "./SheetIcons.jsx";
export default function AllSheetsMenu({sheets,activeId,onSelect,onClose}) {
  const menu=useRef(null);
  useEffect(()=>{menu.current?.querySelector('[aria-checked="true"]')?.focus();},[]);
  function keydown(e){
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();return;}
    if(["ArrowUp","ArrowDown","Home","End"].includes(e.key)){
      e.preventDefault();const buttons=[...menu.current.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
      buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:(index+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  }
  return <div ref={menu} className="popover bottom-popover all-sheets-menu" role="menu" aria-label="Все листы" onKeyDown={keydown}>{sheets.filter(s=>!s.hidden).map(s=><button key={s.id} type="button" role="menuitemcheckbox" aria-checked={s.id===activeId} onClick={()=>{onSelect(s);onClose();}}><i>{s.id===activeId&&<Check size={15}/>}</i><span>{s.name}</span></button>)}</div>;
}
