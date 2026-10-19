# Secuencia de hasta cinco comunicaciones

## Regla principal

Cinco es el maximo predeterminado de comunicaciones comerciales confirmadas, no una obligación ni cinco borradores precreados. El sistema puede recomendar detenerse antes.

## Pasos

| Paso | Objetivo | Condiciones | Enfoque |
|---|---|---|---|
| 1 | Presentacion | contacto/legalidad aprobados | encaje real y propuesta de valor |
| 2 | Seguimiento breve | paso 1 enviado, sin respuesta, intervalo cumplido | argumento distinto y útil |
| 3 | Valor sectorial | sin respuesta, sigue siendo pertinente | caso de uso verificable, sin inventar necesidad |
| 4 | Alternativa | relación aun razonable | colaboración futura, mantenimiento o presupuesto |
| 5 | Cierre respetuoso | legalidad vigente y decisión humana | despedida sin presión y puerta abierta |

## Configuracion

- `maxConfirmedContacts`: 1-5, predeterminado 5.
- Intervalo por paso: definido por el usuario o política aprobada; no se fija en esta fase.
- Canales permitidos por contacto y finalidad.
- Horario y fecha sugeridos, nunca envio programado automatico.
- Pausa, cierre y caducidad.

La ausencia de respuesta no cambia la condicion legal ni autoriza insistencia.

## Generacion

Solo se genera el siguiente mensaje elegible. Contexto minimo:

- hechos verificados de empresa/establecimiento/contacto;
- perfil y rol comercial;
- mensajes `sent_confirmed` anteriores;
- respuestas y objeciones registradas;
- angulos ya usados;
- siguiente objetivo comercial;
- exclusiones y límites de privacidad.

Los borradores no enviados pueden regenerarse sin incrementar contador. Cada regeneracion crea versión; la aprobación queda invalidada si se edita despues.

## Diferenciacion

Un validador de secuencia debe rechazar:

- asunto/cuerpo practicamente iguales a pasos anteriores;
- mismo argumento principal repetido;
- hechos no presentes en el contexto verificado;
- falsa urgencia o prueba social sin fuente;
- CTA incompatible con el rol;
- paso posterior a respuesta, oposición, cierre o máximo.

No se exige una formula de copywriting distinta por paso; se exige un objetivo y argumento realmente distintos.

## Respuestas y cierre

`reply_received` cambia la secuencia a `suspended_on_reply`. Tras revisar, el usuario puede cerrar, convertir a seguimiento de conversación o crear una tarea; nunca continuar automaticamente la serie de “sin respuesta”.

Reimportar la empresa busca primero una secuencia por clave estable. Si existe, la enlaza; no crea otra ni reinicia el contador.

## Outlook

Sin Microsoft Graph autorizado, el mecanismo base es `mailto:` o apertura compatible del cliente. Se registra `outlook_opened`. Después, la UI ofrece `Confirmar enviado`, `No enviado` o `Cancelar`; solo la primera crea `sent_confirmed` con fecha real indicada/confirmada.

Importar manualmente un mensaje desde Elementos enviados puede proporcionar confirmacion adicional, con dedupe por hash. No se asume conexión autenticada.

