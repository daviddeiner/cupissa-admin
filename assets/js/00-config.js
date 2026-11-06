/* Configuración pública de CUPISSA ADMIN.
   La clave publishable/anon es pública; nunca colocar aquí service_role ni sb_secret. */
window.CUPISSA_SUPABASE_URL = 'https://lkdxtesgwqoizobxaawp.supabase.co';
window.CUPISSA_SUPABASE_ANON_KEY = (function () {
  try {
    return localStorage.getItem('cupissa_supabase_public_key') || '';
  } catch (_) {
    return '';
  }
})();
window.CUPISSA_ADMIN_EMAIL = 'contactocupissa@gmail.com';
