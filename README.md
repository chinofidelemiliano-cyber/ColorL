# ColorL

Laboratorio digital de color para impresión flexográfica. ColorL requiere iniciar sesión. Las cuentas nuevas sin código pueden comparar colores. Las cuentas invitadas tienen su propio espacio de laboratorio.

## Desarrollo

Requiere Node.js 24 o posterior. Ejecuta `npm start` en la raíz. La aplicación sirve HTTP en el puerto 3000. No requiere instalar paquetes. Configura `PORT` para otro puerto y `DATA_DIR` para guardar SQLite en un volumen persistente. Usa HTTPS en despliegue y configura `SECURE_COOKIE=1` para marcar la cookie de sesión como segura.

## Cuentas y permisos

### Crear o recuperar el acceso del administrador

1. En Cloudflare, abre el Worker **colorlab → Settings → Variables and Secrets**. Define `ADMIN_EMAIL` con el correo del propietario y `ADMIN_INVITE` como secreto con un valor aleatorio privado. Puedes generar un valor de 32 caracteres con el gestor de contraseñas del navegador. Guarda los cambios.
2. Si aún no tienes cuenta, usa ese correo y el secreto privado en el campo de código del registro. Si ya tienes cuenta, inicia sesión con tu contraseña y escribe el secreto en **Mi perfil → Activar código de acceso**.
3. Cuando aparezca **Administración**, elimina `ADMIN_INVITE` de Cloudflare para cerrar el acceso de configuración inicial. El rol administrador permanece en la cuenta.

### Invitar usuarios al laboratorio

En **Administración → Generar código de acceso**, copia y comparte un código por persona. El código concede acceso de laboratorio durante toda la vigencia de la cuenta. Puede usarse una sola vez y vence a los siete días si nadie lo canjea. El registro admite el código opcional. Una cuenta existente puede activarlo en **Mi perfil → Activar código de acceso**.

Una cuenta sin código solo puede comparar colores. Los registros de cuentas existentes se conservan y vuelven a estar disponibles al canjear una invitación. Las cuentas que ya eran administradoras mantienen ese acceso. El menú de Administración se reserva para administradores. Supervisor y administrador pueden aprobar fórmulas y publicarlas en la biblioteca compartida.

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

## Formulación con tus tintas

En **Catálogo de tintas**, agrega tus productos o importa fichas PDF, Excel `.xlsx`, CSV o imágenes. El navegador extrae texto o aplica OCR en español e inglés. Confirma los códigos, la tecnología y las existencias antes de guardar. Se conservan el archivo original y el texto revisado en la cuenta. Los documentos admiten hasta 1 MB, 20 páginas de PDF o 20 tintas por archivo. Los PDF e imágenes con maquetación compleja pueden requerir corrección manual.

En **Caracterización**, registra CIELAB, componentes y gramos, sustrato, anilox, BCM real, condición de medición e iluminante. Conserva el orden de incorporación y el procedimiento en el ensayo. Para los ajustes registra también la medición inicial y las cantidades añadidas. Solo los ensayos marcados como verificados alimentan la búsqueda. Una fórmula aprobada aporta contexto cuando se vincula con un ensayo medido.

En **Igualación inteligente**, selecciona un patrón guardado con CIELAB o ingresa un objetivo manual. Las propuestas reutilizan mezclas medidas en condiciones compatibles, se ordenan por diferencia ΔE₀₀ y se escalan al lote solicitado. Para correcciones, la herramienta solo reutiliza dosis observadas en mezclas iniciales equivalentes. La diferencia estimada se contrasta con la siguiente medición. Las alternativas corresponden a otras mezclas completas ensayadas con tintas disponibles. Las curvas de reflectancia se conservan y visualizan como evidencia. Esta versión no calcula mezclas predictivas a partir de curvas de reflectancia.

El diagnóstico filtra productos con una ficha confirmada, un rango de dosificación y coincidencias explícitas para la tecnología, familia, sustrato y objetivo. Añade esos datos al editar el producto. Las existencias opcionales en gramos sirven para filtrar propuestas. Actualízalas en el catálogo cuando cambien.

Para el desarrollo local ejecuta `npm ci` antes de `npm start`. La instalación prepara los lectores de PDF, Excel y OCR como archivos del sitio. Workers Builds ejecuta esta instalación en Cloudflare. Conserva el comando de despliegue que aplica las migraciones D1 antes de publicar. Ejecuta `npm test` para verificar importación tabular y reglas de formulación, corrección y diagnóstico.
