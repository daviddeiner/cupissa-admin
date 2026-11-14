/* CUPISSA Studio | Campañas push para la aplicación, con sesión administrativa. */
(() => {
  'use strict';
  const previousSwitch = window.switchTab;
  window.switchTab = function(tab) {
    if (tab !== 'notificaciones') {
      document.getElementById('tab-section-notificaciones')?.classList.add('hidden');
      ['tab-btn-notificaciones','tab-btn-notificaciones-mob'].forEach(id => {
        document.getElementById(id)?.classList.remove('bg-pink-50','fuchsia-text');
      });
      return previousSwitch?.(tab);
    }
    // Utilizar la navegación existente; cerrar todas las demás secciones.
    const other = ['tab-section-clientes','tab-section-creditos','tab-section-web-clientes',
      'tab-section-catalogo','tab-section-web-pedidos','tab-section-alquileres',
      'tab-section-domicilios','tab-section-vistas'];
    other.forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('tab-section-notificaciones')?.classList.remove('hidden');
    ['creditos','catalogo','web-pedidos','alquileres','domicilios','vistas'].forEach(key => {
      ['','-mob'].forEach(suffix => document.getElementById(`tab-btn-${key}${suffix}`)?.classList.remove('bg-pink-50','fuchsia-text'));
    });
    ['tab-btn-notificaciones','tab-btn-notificaciones-mob'].forEach(id =>
      document.getElementById(id)?.classList.add('bg-pink-50','fuchsia-text'));
    document.getElementById('cupissa-admin-more-menu')?.classList.add('hidden');
    document.querySelectorAll('[data-app-tab]').forEach(btn=>btn.classList.toggle('is-active',false));
  };
  let selectedImage = null;
  let imagePreviewUrl = '';
  const imageInput = document.getElementById('cupissa-push-image-input');
  const imageZone = document.getElementById('cupissa-push-image-zone');
  const imagePreview = document.getElementById('cupissa-push-image-preview');
  const imageRemove = document.getElementById('cupissa-push-image-remove');
  const imageError = message => {document.getElementById('cupissa-push-result').textContent=message;};
  function setImage(file) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return imageError('Selecciona JPG, PNG o WEBP.');
    if (file.size>4*1024*1024) return imageError('La imagen debe pesar menos de 4 MB.');
    if(imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl=URL.createObjectURL(file);
    selectedImage=file;
    imagePreview.src=imagePreviewUrl;
    imagePreview.classList.remove('hidden');
    imageRemove.classList.remove('hidden');
    document.getElementById('cupissa-push-result').textContent='Fotografía lista para enviar.';
  }
  imageInput?.addEventListener('change',event=>setImage(event.target.files?.[0]));
  imageZone?.addEventListener('click',event=>{
    if(event.target.closest('input,button')) return;
    imageInput?.click();
  });
  imageZone?.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ') && event.target===imageZone) {event.preventDefault();imageInput?.click();}
  });
  ['dragenter','dragover'].forEach(name=>imageZone?.addEventListener(name,event=>{
    event.preventDefault();imageZone.classList.add('border-pink-600','bg-pink-100');
  }));
  ['dragleave','drop'].forEach(name=>imageZone?.addEventListener(name,event=>{
    event.preventDefault();imageZone.classList.remove('border-pink-600','bg-pink-100');
    if(name==='drop') setImage(event.dataTransfer?.files?.[0]);
  }));
  document.addEventListener('paste',event=>{
    if(document.getElementById('tab-section-notificaciones')?.classList.contains('hidden')) return;
    const file=Array.from(event.clipboardData?.items || []).find(item=>item.kind==='file' && item.type.startsWith('image/'))?.getAsFile();
    if(file) {event.preventDefault();setImage(file);}
  });
  imageRemove?.addEventListener('click',event=>{
    event.stopPropagation();selectedImage=null;
    if(imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl='';imagePreview.removeAttribute('src');imagePreview.classList.add('hidden');
    imageRemove.classList.add('hidden');if(imageInput) imageInput.value='';
  });
  async function imageToBase64(file) {
    const buffer=await file.arrayBuffer();
    const bytes=new Uint8Array(buffer);
    let binary='';
    for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  document.getElementById('cupissa-push-campaign-form')?.addEventListener('submit',async event => {
    event.preventDefault();
    const form=event.currentTarget;
    const btn=document.getElementById('cupissa-push-submit');
    const result=document.getElementById('cupissa-push-result');
    const values=new FormData(form);
    const title=String(values.get('title') || '').trim();
    const message=String(values.get('message') || '').trim();
    const url=String(values.get('url') || '').trim();
    if (!title || !message || !url) return;
    if (!window.confirm(`¿Enviar la notificación «${title}» a todos los dispositivos suscritos de CUPISSA?`)) return;
    btn.disabled=true;
    result.textContent='Enviando notificaciones…';
    try {
      let imageUrl='';
      if(selectedImage) {
        result.textContent='Subiendo fotografía…';
        const {data:uploaded,error:uploadError}=await supabaseClient.functions.invoke('cupissa-push',{
          body:{action:'upload_image',mime:selectedImage.type,fileBase64:await imageToBase64(selectedImage)},
        });
        if(uploadError || !uploaded?.ok) throw new Error(uploaded?.error || uploadError?.message || 'No se pudo subir la fotografía.');
        imageUrl=uploaded.imageUrl;
      }
      const {data,error}=await supabaseClient.functions.invoke('cupissa-push',{
        body:{action:'campaign',title,message,url,imageUrl},
      });
      if(error || !data?.ok) throw new Error(data?.error || error?.message || 'Error desconocido');
      result.className='text-sm font-bold text-green-700';
      result.textContent=`Enviado a ${data.result.sent} dispositivos. Suscripciones: ${data.result.targets}. Fallidos: ${data.result.failed}.`;
    } catch(error) {
      console.error('[CUPISSA PUSH]',error);
      result.className='text-sm font-bold text-red-600';
      result.textContent='No fue posible enviar la notificación: '+String(error.message || error);
    } finally {btn.disabled=false;}
  });
})();
