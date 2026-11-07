/* CUPISSA: aviso preventivo de seguridad en las herramientas de desarrollador. */
(()=>{
  if(window.__cupissaSecurityConsoleNotice) return;
  window.__cupissaSecurityConsoleNotice = true;
  console.log('%c ADVERTENCIA DE SEGURIDAD ', 'background:#fff000;color:#e00021;font-size:27px;font-weight:900;padding:8px 12px;');
  console.log('%cCUPISSA — Protege tus datos', 'font-size:21px;font-weight:800;color:#e50073;');
  console.log('%cSi alguien te pidió abrir esta consola o pegar un código aquí, NO lo hagas. Podrían robar tu sesión, suplantar tu identidad o realizar operaciones sin tu permiso. CUPISSA nunca te pedirá ejecutar código en esta consola.', 'font-size:15px;font-weight:600;color:#b91c1c;line-height:1.5;');
})();
