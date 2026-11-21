/* CUPISSA Studio | Moderación de reseñas (requiere migración SQL). */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'});
 let rows=[],shown=30,loading=false,seen=false;
 const db=()=>typeof supabaseClient!=='undefined'?supabaseClient:null;
 const status=(value,err=false)=>{const el=$('admin-review-status');if(el){el.textContent=value;el.style.color=err?'#be123c':'';}};
 async function load(){
  if(loading)return;const client=db();if(!client){status('No hay conexión con Supabase.',true);return;}
  loading=true;status('Cargando reseñas…');
  try {
   const all=[];let offset=0;
   while(true){const {data,error}=await client.rpc('cupissa_admin_listar_resenas',{p_limit:500,p_offset:offset});if(error)throw error;
    const part=Array.isArray(data)?data:[];all.push(...part);offset+=part.length;if(part.length<500||offset>=10000)break;
   }
   rows=all.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));shown=30;seen=true;render();
  }catch(e){status('No se pudieron leer las reseñas. Ejecuta la migración SQL de moderación y verifica la sesión del administrador: '+(e.message||e),true);}
  finally{loading=false;}
 }
 function render(){const list=$('admin-review-list');if(!list)return;
  const stars=$('admin-review-stars')?.value||'',visibility=$('admin-review-visibility')?.value||'',q=String($('admin-review-search')?.value||'').trim().toLowerCase();
  const items=rows.filter(r=>(!stars||Number(r.calificacion)===Number(stars))&&(!visibility||(visibility==='hidden')===Boolean(r.ocultada))&&(!q||[r.comentario,r.autor,r.producto_id,r.producto_nombre].some(x=>String(x||'').toLowerCase().includes(q))));
  status(`${items.length} reseña(s) encontradas · ${rows.filter(r=>r.ocultada).length} oculta(s).`);
  list.innerHTML=items.slice(0,shown).map(r=>`<article class="admin-review-card" aria-disabled="${Boolean(r.ocultada)}"><div class="admin-review-top"><div><div class="admin-review-stars" aria-label="${Number(r.calificacion)} de 5 estrellas">${'★'.repeat(Math.min(5,Math.max(0,Number(r.calificacion)||0)))}${'☆'.repeat(5-Math.min(5,Math.max(0,Number(r.calificacion)||0)))}</div><strong>${esc(r.producto_nombre||('Producto '+r.producto_id))}</strong><div class="admin-review-meta">${esc(r.autor||'Cliente')} · ${r.created_at?esc(fmt.format(new Date(r.created_at))):'Sin fecha'}</div></div>${r.ocultada?'<span class="admin-review-hidden">Oculta</span>':`<button type="button" class="admin-review-hide" data-hide-review="${esc(r.id)}">Eliminar de la tienda</button>`}</div><p>${esc(r.comentario||'Sin comentario')}</p></article>`).join('')||'<p class="text-sm text-slate-500">No hay reseñas con estos filtros.</p>';
  const more=$('admin-review-more');if(more)more.classList.toggle('hidden',items.length<=shown);
 }
 async function hide(id){const row=rows.find(r=>String(r.id)===String(id));if(!row||row.ocultada)return;
  if(!confirm('¿Ocultar esta reseña de la tienda y del promedio de estrellas? El registro seguirá guardado y el cliente no podrá publicar otra reseña del mismo producto.'))return;
  try{const {data,error}=await db().rpc('cupissa_admin_ocultar_resena',{p_review_id:String(id)});if(error)throw error;
   if(data!==true)throw new Error('La operación no fue confirmada.');row.ocultada=true;render();
  }catch(e){status('No se pudo ocultar: '+(e.message||e),true);}
 }
 $('admin-review-list')?.addEventListener('click',e=>{const button=e.target.closest('[data-hide-review]');if(button)hide(button.dataset.hideReview);});
 window.cupissaLoadReviews=load;window.cupissaFilterReviews=()=>{shown=30;render();};window.cupissaMoreReviews=()=>{shown+=30;render();};
 const prev=window.switchTab;window.switchTab=function(tab){if(tab!=='resenas'){prev?.call(this,tab);$('tab-section-resenas')?.classList.add('hidden');['','-mob'].forEach(s=>{const b=$('tab-btn-resenas'+s);b?.classList.remove('admin-web-active','bg-pink-50','fuchsia-text');});return;}
   prev?.call(this,'clientes');
   ['tab-section-clientes','tab-section-creditos','tab-section-web-clientes','tab-section-catalogo','tab-section-web-pedidos','tab-section-alquileres','tab-section-domicilios','tab-section-vistas','tab-section-notificaciones'].forEach(id=>$(id)?.classList.add('hidden'));
   $('tab-section-resenas')?.classList.remove('hidden');if(!seen)load();
   document.querySelectorAll('[data-app-tab]').forEach(b=>b.classList.remove('is-active'));
   ['', '-mob'].forEach(s=>{const b=$('tab-btn-resenas'+s);b?.classList.add('admin-web-active','bg-pink-50','fuchsia-text');});
   document.querySelectorAll('#cupissa-admin-more-menu button').forEach(b=>b.classList.toggle('is-active',b.getAttribute('onclick')?.includes("'resenas'")));
   try{localStorage.setItem('cupissa_admin_last_tab','resenas');}catch(_){ }
 };
 document.addEventListener('DOMContentLoaded',()=>{try{if(localStorage.getItem('cupissa_admin_last_tab')==='resenas')window.switchTab('resenas');}catch(_){}});
})();
