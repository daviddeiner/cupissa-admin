/* CUPISSA ADMIN · cuadros de diálogo de la marca */
(() => {
 const nativeAlert = window.alert;
 let root;
 function ensure() {
  if (root) return root;
  root=document.createElement('div');root.id='cupissa-dialog-layer';
  root.style.cssText='position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.60);backdrop-filter:blur(8px);padding:20px';
  root.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="cupissa-dialog-title" style="width:100%;max-width:440px;background:white;border:1px solid #fce7f3;border-radius:28px;box-shadow:0 28px 90px #0004;overflow:hidden;font-family:Inter,sans-serif"><div style="height:7px;background:linear-gradient(90deg,#db2777,#f472b6)"></div><div style="padding:27px"><div style="width:48px;height:48px;border-radius:16px;background:#fdf2f8;color:#db2777;display:grid;place-items:center;font-size:23px;margin-bottom:16px"><i class="fa-solid fa-circle-info"></i></div><h3 id="cupissa-dialog-title" style="font-weight:900;font-size:19px;color:#0f172a;margin:0 0 10px">CUPISSA</h3><p id="cupissa-dialog-text" style="font-size:14px;line-height:1.6;color:#475569;white-space:pre-line;overflow-wrap:anywhere"></p><div id="cupissa-dialog-fields" style="display:grid;gap:12px;margin-top:16px"></div><div id="cupissa-dialog-actions" style="display:flex;gap:10px;margin-top:24px;justify-content:flex-end"></div></div></div>`;
  document.body.append(root);return root;
 }
 function dialog(message,{title='CUPISSA',cancel=false,fields=[]}={}) {return new Promise(resolve=>{
  const el=ensure();el.style.display='flex';el.querySelector('#cupissa-dialog-title').textContent=title;el.querySelector('#cupissa-dialog-text').textContent=String(message||'');
  const fieldWrap=el.querySelector('#cupissa-dialog-fields');fieldWrap.replaceChildren();
  fields.forEach(field=>{const label=document.createElement('label');label.style.cssText='font-size:12px;font-weight:750;color:#334155;display:grid;gap:6px';label.textContent=field.label;const input=document.createElement('input');input.type=field.type||'text';input.value=field.value||'';input.required=true;input.min=field.min||'';input.style.cssText='padding:12px;border:1px solid #e2e8f0;border-radius:12px;outline-color:#db2777;font-size:14px';input.dataset.field=field.key;label.append(input);fieldWrap.append(label)});
  const actions=el.querySelector('#cupissa-dialog-actions');actions.replaceChildren();
  const finish=result=>{el.style.display='none';resolve(result)};
  if(cancel){const b=document.createElement('button');b.textContent='Cancelar';b.style.cssText='padding:11px 18px;border:0;border-radius:12px;background:#f1f5f9;color:#475569;font-weight:800;cursor:pointer';b.onclick=()=>finish(null);actions.append(b)}
  const ok=document.createElement('button');ok.textContent=cancel?'Aceptar':'Entendido';ok.style.cssText='padding:11px 22px;border:0;border-radius:12px;background:#db2777;color:#fff;font-weight:800;cursor:pointer';ok.onclick=()=>{const values={};for(const input of fieldWrap.querySelectorAll('input')){if(!input.checkValidity()){input.reportValidity();return} values[input.dataset.field]=input.value}finish(fields.length?values:true)};actions.append(ok);if(fields.length)fieldWrap.querySelector('input')?.focus();else ok.focus();
 })}
 window.cupissaDialog=dialog;
 window.cupissaConfirm=async message=>!!(await dialog(message,{title:'Confirmar acción',cancel:true}));
 window.cupissaDebtForm=()=>dialog('Registra una nueva deuda para el cliente seleccionado.',{title:'Crear nueva deuda',cancel:true,fields:[{key:'monto',label:'Monto de la deuda ($)',type:'number',min:'1'},{key:'cuotas',label:'Número de cuotas',type:'number',min:'1',value:'4'},{key:'fecha',label:'Próximo vencimiento',type:'date',value:new Date().toLocaleDateString('en-CA')},{key:'frecuencia',label:'Frecuencia (Quincenal, Semanal, Diario, Mensual)',value:'Quincenal'}]});
 window.alert=message=>{void dialog(message);};
})();
