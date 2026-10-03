# Google Calendar overlap report for n8n

Plantilla de [Webs del Camp](https://websdelcamp.cat/es/automatizaciones?utm_source=github&utm_medium=referral&utm_campaign=calendar_audit_2026_10_03&utm_content=repository_author) para revisar citas de Google Calendar y detectar solapamientos. Está pensada para un calendario de una persona o de un recurso que se puede reservar.

**English:** An n8n workflow that finds overlapping timed Google Calendar events and prepares an email report for an internal recipient. Includes a fictional demo and a setup guide in Spanish.

## Probar el ejemplo

1. Descarga [google-calendar-overlap-report.json](google-calendar-overlap-report.json) e impórtalo en n8n.
2. Mantén `demo_mode` en `true` dentro de **Configure calendar and report**.
3. Ejecuta **Run a manual check** y abre el resultado de **Inspect the audit result**.

El ejemplo contiene cinco citas ficticias. Excluye una cita cancelada y otra marcada como libre; revisa las tres restantes y encuentra un solapamiento. La demostración funciona sin conectar Google y no envía correo.

## Conectar un calendario

En **Configure calendar and report**, configura:

| Campo | Función |
| --- | --- |
| `calendar_id` | Calendario de Google que se revisará. |
| `recipient_email` | Destinatario interno del informe. |
| `report_timezone` | Zona horaria de las fechas del informe. |
| `lookahead_days` | Número de días que se revisarán. |
| `max_report_pairs` | Máximo de pares solapados incluidos en el informe. |

Conecta Google Calendar y Gmail en sus respectivos nodos. Cambia `demo_mode` a `false` y ejecuta una revisión manual. Comprueba el resultado antes de activar el horario de **Review each morning**; revisa también la zona horaria del workflow.

[Guía de montaje y ejemplo explicado](https://websdelcamp.cat/es/recursos/detectar-citas-solapadas-google-calendar?utm_source=github&utm_medium=referral&utm_campaign=calendar_audit_2026_10_03&utm_content=repository_setup).

## Alcance

- Lee las citas y prepara un informe interno; no cambia ni cancela eventos.
- Dos citas consecutivas que comparten la hora de fin e inicio son compatibles.
- Excluye eventos de día completo, cancelados, marcados como libres e invitaciones rechazadas por el titular.
- Un calendario compartido con reservas simultáneas intencionales también puede producir avisos.
- Un conflicto sin resolver puede aparecer de nuevo en la siguiente revisión.

## Validación

La plantilla se importó y su demostración se ejecutó en **n8n 2.41.6**, el 3 de octubre de 2026: tres citas revisadas y un solapamiento. La conexión real con Google, el envío por Gmail y el disparador programado requieren comprobación con la cuenta donde se vaya a instalar.

El JSON publicado comienza inactivo, en modo demostración y sin credenciales. Es el mismo archivo que se ofrece en la guía de Webs del Camp.
