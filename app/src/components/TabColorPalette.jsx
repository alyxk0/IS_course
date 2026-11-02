import { useEffect, useRef, useState } from "react";
import { Check, AddCircle, Colorize, ColorReset } from "./SheetIcons.jsx";
import colors from "../assets/sheets-colors.json";
export default function TabColorPalette({anchor,value,customColors,onCustomColors,onChoose,onClose,focusOnOpen}) {
  const root=useRef(null),[error,setError]=useState("");
  const custom=[...new Set([...customColors,...(value&&!colors.palette.some(item=>item.color===value)?[value]:[])])].slice(-8);
  const left=anchor.right+243<=innerWidth-8?anchor.right:anchor.left-243;
  useEffect(()=>{if(focusOnOpen)(root.current?.querySelector('[aria-selected="true"]')||root.current?.querySelector('button'))?.focus();},[focusOnOpen]);
  const choose=color=>{if(color&&!colors.palette.some(item=>item.color===color))onCustomColors([...new Set([...customColors,color])].slice(-8));onChoose(color);};
  const swatch=({color,label})=>{
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),ink=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>150?"#202124":"white";
    return <button type="button" className="tab-color-swatch" key={color} role="gridcell" aria-label={label||color} title={label||color} aria-selected={value===color} onClick={()=>choose(color)}><i style={{backgroundColor:color}}>{value===color&&<Check size={14} color={ink}/>}</i></button>;
  };
  function keydown(e){
    const grid=e.target.closest('[role="grid"]');
    if(e.key==="Escape"||e.key==="ArrowLeft"&&!grid){e.preventDefault();e.stopPropagation();onClose();return;}
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key)){
      e.preventDefault();e.stopPropagation();
      const scope=grid||root.current.querySelector('[role="grid"]'),buttons=[...scope.querySelectorAll('button,input')],current=buttons.indexOf(document.activeElement),columns=scope.classList.contains("sheet-color-grid")?10:buttons.length;
      const delta=e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:e.key==="ArrowUp"?-columns:columns;
      buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:current<0?0:(current+delta+buttons.length)%buttons.length]?.focus();
    }
  }
  return <div ref={root} role="dialog" aria-label="Цвет вкладки листа" className="popover tab-color-palette" onKeyDown={keydown} style={{left:Math.max(8,Math.min(left,innerWidth-251)),top:Math.max(8,Math.min(anchor.bottom-282,innerHeight-290))}}>
    <button type="button" className="tab-color-reset" onClick={()=>choose(null)}><ColorReset size={20}/><span>Сбросить параметры</span></button>
    <div className="sheet-color-grid" role="grid" aria-label="Палитра цветов вкладки">{colors.palette.map(swatch)}</div>
    <div className="tab-color-custom-title">ДРУГОЙ</div>
    <div className="sheet-custom-colors" role="grid" aria-label="Пользовательские цвета вкладки">
      {custom.map(color=>swatch({color}))}
      <label className="custom-border-color" title="Добавить пользовательский цвет"><AddCircle size={18}/><input type="color" aria-label="Добавить пользовательский цвет вкладки" value={value||"#000000"} onChange={e=>choose(e.target.value)}/></label>
      <button type="button" className="border-eyedropper" aria-label="Выбрать цвет вкладки с экрана" disabled={typeof window.EyeDropper!=="function"} onClick={async()=>{try{choose((await new window.EyeDropper().open()).sRGBHex);}catch(e){if(e.name!=="AbortError")setError("Выбор цвета с экрана недоступен.");}}}><Colorize size={18}/></button>
    </div>{error&&<p className="error" role="alert">{error}</p>}
  </div>;
}
