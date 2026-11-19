# ColorL

Laboratorio digital de color para impresión flexográfica. El panel de invitado muestra datos de ejemplo. Las cuentas nuevas empiezan con su propio espacio vacío.

## Desarrollo

Requiere Node.js 24 o posterior. Ejecuta `npm start` en la raíz. La aplicación sirve HTTP en el puerto 3000. No requiere instalar paquetes. Configura `PORT` para otro puerto y `DATA_DIR` para guardar SQLite en un volumen persistente. Usa HTTPS en despliegue y configura `SECURE_COOKIE=1` para marcar la cookie de sesión como segura.

## Cuentas y permisos

Para crear el primer administrador, configura `ADMIN_EMAIL` y un `ADMIN_INVITE` aleatorio antes de registrar la cuenta. Escribe el código en el campo de invitación del registro. Retira la variable de invitación una vez creada la cuenta. El panel Administración asigna roles. Supervisor y administrador pueden aprobar fórmulas enviadas a revisión y publicarlas en la biblioteca compartida de la instancia.

La recuperación de contraseña necesita `RECOVERY_WEBHOOK`, una URL del servicio que envía por correo el código de recuperación. El servidor le envía un POST JSON con `email` y `token`. El código vence en 30 minutos. Si el servicio exige autenticación, configura `RECOVERY_SECRET` para enviar un encabezado Bearer.

## Datos y respaldo

Los registros, la configuración del perfil y las revisiones se guardan en SQLite. `npm run backup -- /ruta/segura/colorl.sqlite` genera una copia consistente y verifica su integridad. Usa una ruta nueva y guarda el respaldo fuera del volumen principal. Para recuperar una copia, detén el servidor y apunta `DATA_DIR` a un directorio nuevo que contenga únicamente el respaldo con el nombre `colorl.sqlite`. Se restauran cuentas, registros e historial de la instancia. El panel Historial también permite que cada cuenta exporte sus propios registros.

## Alcance técnico

Las fórmulas escalan proporciones conocidas. El flujo de corrección compara pruebas medidas. Una predicción de pigmentos requiere caracterización compatible. El asistente ofrece guías locales de diagnóstico. La biblioteca permite registrar referencias propias y códigos Pantone de forma manual.

## Publicar en Cloudflare desde el navegador

La rama `colorl-app` incluye un Cloudflare Worker que sirve la interfaz y la API. Usa D1 para guardar las cuentas y los registros. Los pasos se realizan en el panel web de Cloudflare y los comandos se ejecutan en sus servidores de compilación.

1. En **Storage & databases → D1**, crea una base de datos llamada `colorl`.
2. En **Workers & Pages → Create application**, elige **Workers** y conecta el repositorio GitHub `chinofidelemiliano-cyber/ColorL`. Selecciona `colorl-app` como rama de producción y la raíz del repositorio como directorio.
3. En el campo **Deploy command**, escribe `npx --yes wrangler@4.165.0 d1 migrations apply colorl --remote && npx --yes wrangler@4.165.0 deploy`. El campo **Build command** puede quedar vacío. El token de Workers Builds necesita acceso de edición a Workers y D1.
4. Guarda y despliega. Abre el dominio `workers.dev` que muestre el Worker. Comprueba que puedes crear una cuenta, guardar un registro y volver a verlo al iniciar sesión.

Si vas a usar los permisos de administración o la recuperación por correo, configura las variables y secretos descritos arriba en **Settings → Variables and Secrets** del Worker. La base D1 se crea vacía. La publicación no copia los datos de la instancia SQLite local. Las copias en producción se administran mediante D1, y el usuario puede seguir exportando sus registros desde ColorL.
