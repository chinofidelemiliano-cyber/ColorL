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
