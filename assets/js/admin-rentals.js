/* CUPISSA ADMIN — inventario de alquileres conectado a Supabase */
(() => {
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.loadRentalStock=async()=>{
  const root=$('cupissa-rental-stock');if(!root)return;
  root.innerHTML='<p class="text-sm text-slate-500">Consultando existencias…</p>';
  try{
   const [{data:products,error:e1},{data:stock,error:e2}]=await Promise.all([
    supabaseClient.from('productos').select('id,nombre,fotos').eq('alquiler',true).order('nombre'),
    supabaseClient.from('cupissa_stock_alquiler').select('producto_id,cantidad_total')
   ]);
   if(e1||e2)throw e1||e2;
   const stockMap=new Map((stock||[]).map(s=>[String(s.producto_id),Number(s.cantidad_total)||0]));
   if(!products?.length){root.innerHTML='<p class="text-sm text-slate-400">No hay productos marcados para alquiler.</p>';return}
   root.replaceChildren();
   for(const product of products){
    const row=document.createElement('div');row.className='flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 flex-wrap';
    const img=document.createElement('img');img.src=product.fotos?.[0]||'favicon.png';img.alt='';img.className='h-14 w-14 rounded-xl object-cover bg-white';
    const name=document.createElement('strong');name.className='font-black text-slate-800 text-xs flex-1 min-w-[140px]';name.textContent=product.nombre;
    const label=document.createElement('label');label.className='text-xs font-bold text-slate-600';label.textContent='Unidades totales';
    const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.value=stockMap.get(String(product.id))??0;input.className='block w-24 mt-1 px-3 py-2 border border-pink-100 bg-white rounded-xl font-bold';label.append(input);
    const btn=document.createElement('button');btn.className='fuchsia-btn px-4 py-2.5 rounded-xl font-bold text-xs';btn.textContent='Guardar';
    btn.onclick=async()=>{
     const amount=Number(input.value);if(!Number.isSafeInteger(amount)||amount<0)return alert('Indica un número de unidades válido.');
     btn.disabled=true;
     try{
      const {error}=await supabaseClient.from('cupissa_stock_alquiler').upsert({producto_id:product.id,cantidad_total:amount},{onConflict:'producto_id'});
      if(error)throw error;alert('Stock actualizado para '+product.nombre+'.');
     }catch(error){alert('No se pudo guardar el stock: '+error.message)}finally{btn.disabled=false}
    };
    row.append(img,name,label,btn);root.append(row);
   }
  }catch(error){root.innerHTML='<p class="text-sm text-red-600"></p>';root.firstChild.textContent='No se pudo cargar el stock: '+error.message+'. Verifica la configuración SQL de alquileres.'}
 };
})();
