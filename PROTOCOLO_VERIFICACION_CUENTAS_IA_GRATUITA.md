# Protocolo manual de cuentas de IA gratuita

Este procedimiento se realiza personalmente en la consola oficial de cada proveedor. No se deben enviar claves, capturas con secretos ni credenciales al asistente, a GitHub o al informe de pruebas.

## Reglas comunes

1. Abrir la consola oficial escribiendo su direccion o usando un marcador conocido.
2. Comprobar que la cuenta no tiene metodo de pago, facturacion, recarga automatica, creditos comprados ni plan de pago activo.
3. Comprobar que el modelo exacto permitido por Voltflow figura en el nivel gratuito de esa cuenta.
4. Revisar limites y fecha de reinicio en la propia consola. No usar estimaciones locales como prueba economica.
5. Crear, cuando el proveedor lo permita, una clave separada para Voltflow con el alcance minimo y restricciones de origen disponibles.
6. No pegar la clave en documentos, incidencias, capturas o registros. Introducirla directamente en Voltflow desde el dispositivo del usuario.
7. En Voltflow, confirmar el proveedor solo para la sesion actual. Al terminar, pulsar `Bloquear` y cerrar la pestana.
8. Si cualquier dato economico es ambiguo, no confirmar el proveedor y continuar con edicion manual.

## Gemini

1. Entrar en Google AI Studio: https://aistudio.google.com/apikey
2. Identificar el proyecto asociado a la clave.
3. Revisar en Google Cloud Billing que el proyecto no este vinculado a una cuenta de facturacion.
4. Verificar en AI Studio que `gemini-2.5-flash-lite` esta disponible dentro del Free Tier y consultar sus limites actuales.
5. Si el proyecto aparece como Pay-as-you-go, tiene billing vinculado o el modelo no figura como gratuito, mantener Gemini bloqueado.

Criterio de aprobacion: proyecto sin facturacion vinculada, modelo permitido incluido en Free Tier y limites visibles. El estado no puede comprobarse desde el JavaScript de Voltflow.

## Groq

1. Entrar en Groq Console: https://console.groq.com
2. Comprobar que la organizacion/cuenta figura en Free Plan.
3. Revisar que no haya plan Developer, metodo de pago ni facturacion activa.
4. Verificar que `openai/gpt-oss-20b` sigue disponible en Free Plan y revisar sus RPM, RPD, TPM y TPD actuales.
5. Si el modelo fue retirado del plan gratuito o la cuenta tiene facturacion, mantener Groq bloqueado.

Criterio de aprobacion: Free Plan visible, ausencia de facturacion y modelo permitido incluido en los limites gratuitos de la cuenta.

## OpenRouter

1. Entrar en OpenRouter: https://openrouter.ai/settings/keys
2. Revisar cuenta, creditos y pagos. No debe haber creditos comprados, recarga automatica ni metodo de pago.
3. Confirmar que la cuenta permanece en Free y que `openrouter/free` continua disponible.
4. Revisar privacidad y politica de los proveedores subyacentes antes de enviar datos empresariales.
5. No seleccionar identificadores sin sufijo gratuito ni routers cuyo coste no pueda demostrarse.

Criterio de aprobacion: cuenta Free sin saldo comprado o recarga y uso exclusivo de `openrouter/free`. Su disponibilidad y proveedor subyacente pueden variar.

## Registro sin secretos

Se puede conservar localmente una hoja con: fecha, proveedor, plan mostrado, modelo permitido, facturacion desactivada, limites visibles y persona que verifico. No incluir clave, token, correo de acceso, identificadores completos, capturas con secretos ni datos de clientes.

## Resultado

- `APROBADO PARA LA SESION`: se cumplen todos los criterios y el usuario acepta privacidad/riesgo del navegador.
- `BLOQUEADO`: falta una comprobacion, existe facturacion o las condiciones son ambiguas.

Este protocolo reduce el riesgo, pero no convierte los controles locales de Voltflow en un limite de gasto del proveedor.
