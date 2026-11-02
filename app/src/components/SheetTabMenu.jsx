import { useEffect, useRef, useState } from "react";
import TabColorPalette from "./TabColorPalette.jsx";
export default function SheetTabMenu({anchor,name,editable,canHide,canDelete,canMoveLeft,canMoveRight,color,customColors,onCustomColors,onColor,onAction,onClose}) {
  const menu=useRef(null),colorButton=useRef(null),timer=useRef(null),[colorAnchor,setColorAnchor]=useState(null),[colorFocus,setColorFocus]=useState(false);
  useEffect(()=>{menu.current?.focus();window.addEventListener("resize",onClose);return()=>{clearTimeout(timer.current);window.removeEventListener("resize",onClose);};},[]);
  function openColor(keyboard=false){clearTimeout(timer.current);setColorFocus(keyboard);const button=colorButton.current,rect=button.getBoundingClientRect();setColorAnchor({left:rect.left,right:rect.left+button.offsetWidth,top:rect.top,bottom:rect.bottom});}
  const rows=[
    {label:"Удалить",action:"delete",disabled:!editable||!canDelete},
    {label:"Создать копию",action:"duplicate",disabled:!editable},
    {label:"Переименовать",action:"rename",disabled:!editable},
    {label:"Изменить цвет",action:"color",disabled:!editable,arrow:true},
    {label:"Защитить лист",action:"protect",disabled:!editable},
    {label:"Скрыть лист",action:"hide",disabled:!editable||!canHide},
    {label:"Просмотреть комментарии",action:"comments"},null,
    {label:"Сдвинуть вправо",action:"move-right",disabled:!editable||!canMoveRight},
    {label:"Сдвинуть влево",action:"move-left",disabled:!editable||!canMoveLeft},
  ];
  function keydown(e){
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(colorAnchor){setColorAnchor(null);colorButton.current?.focus();}else onClose();return;}
    if(e.key==="ArrowRight"&&document.activeElement===colorButton.current){e.preventDefault();openColor(true);return;}
    if(["ArrowUp","ArrowDown","Home","End"].includes(e.key)){
      e.preventDefault();const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
      buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:index<0?e.key==="ArrowUp"?buttons.length-1:0:(index+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  }
  return <><div ref={menu} role="menu" aria-label={`Действия с листом ${name}`} tabIndex={-1} className="popover sheet-context-menu" onKeyDown={keydown} style={{left:Math.max(8,Math.min(anchor.left,innerWidth-223.375)),top:Math.max(8,Math.min(anchor.top+2-319,innerHeight-327))}}>{rows.map((item,index)=>item?<button key={item.label} ref={item.action==="color"?colorButton:undefined} type="button" role="menuitem" disabled={item.disabled} aria-haspopup={item.arrow?"dialog":undefined} aria-expanded={item.arrow?!!colorAnchor:undefined} onMouseEnter={()=>{clearTimeout(timer.current);if(item.action==="color"&&!item.disabled)timer.current=setTimeout(()=>openColor(),120);else setColorAnchor(null);}} onClick={()=>{if(item.action==="color")openColor(true);else{onClose();onAction(item.action);}}}>{item.label}{item.arrow&&<b className="format-arrow"/>}</button>:<div className="format-menu-divider" role="separator" key={index}/>)}</div>{colorAnchor&&<TabColorPalette anchor={colorAnchor} focusOnOpen={colorFocus} value={color} customColors={customColors} onCustomColors={onCustomColors} onChoose={value=>{onColor(value);onClose();}} onClose={()=>{setColorAnchor(null);colorButton.current?.focus();}}/>}</>;
}
