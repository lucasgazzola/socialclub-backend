# Demo en vivo — 3ra exposición (16/11/2026)

**Duración:** 2:30 a 3:00. **Público:** profesores y stakeholders, no necesariamente técnicos.
**Historia:** «De vecina a socia, y de socia a su primer evento».

Se ve lo más sólido del producto, con tres roles (vecina que se hace socia,
colaborador en la puerta, administrador) y seis funcionalidades: landing,
alta de socio, cobro online, entradas con QR, control de acceso y tablero de
gestión.

> No mencionar funcionalidades pendientes ni deuda técnica.

## Quién hace qué

| Persona | Rol en la demo | Dispositivo |
|---|---|---|
| Expositor A | Narra y maneja a **Martina** (la vecina) | Notebook, proyectada |
| Expositor B | Sostiene el **celular de Martina** frente a la webcam | Celular |
| Expositor A o C | **Colaborador** en la puerta y **Admin** al final | Notebook, proyectada |

Martina hace su recorrido en la notebook para que el público lo vea. El celular
ya tiene la sesión de Martina abierta y solo se usa para mostrar el QR en la
puerta: es el momento más fuerte de la demo.

## Guion

| Tiempo | Quién y dónde | Qué se hace | Qué se dice |
|---|---|---|---|
| 0:00–0:15 | **Visitante** · landing (`/`) | Bajar hasta los planes y tocar **Elegir este plan** | «Así conoce el club cualquier vecino de Ordóñez: disciplinas, próximos eventos y la cuota real.» |
| 0:15–0:50 | **Martina** · alta (`/asociarme`) | Cargar el DNI → **Confirmar y asociarme** → **Pagar** → **Aprobar** en el simulador | «Se asocia sola, desde su casa, y paga la primera cuota online. El club cobra sin abrir una ventanilla.» |
| 0:50–1:20 | **Martina** · Mi club → Eventos | Ver su inicio y comprar 2 entradas del evento de la demo; se ve el precio con descuento | «Ya es socia, y el descuento se aplica solo.» |
| 1:20–1:35 | **Celular de Martina** · Entradas | Actualizar, tocar **Mostrar en la puerta** (QR a pantalla completa) | «Llega al evento con la entrada en el celular.» |
| 1:35–2:05 | **Colaborador** · Validar QR | Elegir el evento y escanear el celular con la webcam: **¡ACCESO PERMITIDO!** Escanear el mismo QR otra vez: **¡ENTRADA YA UTILIZADA!** | «Sin listas en papel. Una entrada no sirve dos veces.» |
| 2:05–2:15 | **Celular de Martina** · Entradas → Historial | La entrada aparece como «Usada el …» | «Ella también ve que ya la usó.» |
| 2:15–2:50 | **Admin** · Dashboard y Reportes → Asistencia a eventos | Recorrer los gráficos; en Asistencia, el evento muestra entradas vendidas, ingresos y recaudación | «La comisión directiva ve en vivo cuánto se recaudó y quién vino. Y cada operación queda en una auditoría que nadie puede borrar.» |
| 2:50–3:00 | Cierre | — | «Lo que antes era una planilla, una caja y una lista impresa, hoy es un solo sistema.» |

**Si sobra tiempo (ensayo por debajo de 2:40):** sumar unos 25 segundos de
documentación con revisión. Martina sube su certificado médico en Mi club →
Disciplinas → Documentación y queda «En revisión». El admin lo aprueba desde la
bandeja «Documentación para revisar» del inicio del panel, y la inscripción
pasa a «Habilitado». Va **después** del QR, nunca en su lugar.

**Si falta tiempo:** primero se corta el paso del Historial (2:05–2:15) y
después la Auditoría, que alcanza con nombrarla.

## Preparación técnica

### Apps y pasarela

- Correr las apps **en local** desde `dev`. El entorno de test no está al día.
- En el `.env` del back: `PASARELA_PAGOS=simulada`. Los pagos se aprueban en el
  simulador y no se cobra nada. No usar Mercado Pago de prueba en vivo: pide
  iniciar sesión y cargar una tarjeta.

### Celular en la misma red

El celular no puede abrir `localhost`: entra por la IP de la notebook a una
segunda instancia del front. La cámara de la webcam solo funciona en
`localhost`, así que el colaborador y el admin siguen usando el front normal.

1. Conectar la notebook al **hotspot del celular**. El Wi-Fi de la facultad
   puede bloquear la conexión entre dispositivos.
2. Ver la IP de la notebook: `hostname -I` (por ejemplo `192.168.43.20`).
3. En el `.env` del back, permitir los dos orígenes y reiniciar la API:
   ```
   CORS_ORIGIN=http://localhost:5173,http://<IP>:5174
   ```
4. Levantar el front normal (`npm run dev`, puerto 5173) y, en otra terminal
   dentro de `socialclub-frontend`, la instancia para el celular:
   ```bash
   VITE_API_URL=http://<IP>:3000/api/v1 npx vite --host --port 5174
   ```
5. En el celular, abrir `http://<IP>:5174` e iniciar sesión como Martina.
6. Si la notebook tiene firewall activo, abrir los puertos 3000 y 5174.

La IP cambia cada vez que se conecta al hotspot: hacer los pasos 2 a 5 **en el
aula**, antes de empezar.

### Datos

- **Evento de la demo.** El padrón realista deja una «Peña de socios» con 20 %
  de descuento. Si el seed corre de noche, la peña queda para el día siguiente
  a las 11:00 y la puerta abre a las 08:00. Si la presentación es más tarde,
  volver a correr `npm run prisma:seed` (no duplica datos y mueve la peña).
- **Cuenta nueva de Martina**, verificada y **sin membresía**. La del ensayo
  anterior ya es socia y no sirve.
- Revisar que la landing no muestre datos de prueba. «Jockey Femenino» viene del
  seed con el nombre mal escrito: corregirlo en la base local, no en el seed.

### Sesiones abiertas antes de empezar

En la notebook, una ventana o perfil de Chrome por rol, ya logueados, para no
escribir contraseñas en vivo:

| Ventana | Usuario | Pantalla inicial |
|---|---|---|
| Visitante → Martina | Martina (sin iniciar sesión en la landing; iniciar al elegir el plan, o dejarla logueada) | Landing |
| Colaborador | `franco.bustos@socialclub.local` | Validar QR |
| Admin | `admin@socialclub.local` | Dashboard |

En el celular: Martina logueada en `http://<IP>:5174`.

## Plan B

| Si falla… | Hacer |
|---|---|
| El celular no conecta | Mostrar el QR desde otra ventana de la notebook o desde un segundo celular conectado al hotspot |
| La webcam no lee el QR | En Validar QR, usar **Ingreso manual** y pegar el código de la entrada |
| El simulador aprobó pero no volvió a la app | Ir a Mi club → Cuotas: el pago ya quedó acreditado al tocar **Aprobar** |
| Algo se cuelga | Seguir narrando con la ventana del paso siguiente, que ya está abierta |

## Checklist del día

- [ ] Apps levantadas desde `dev`, con `PASARELA_PAGOS=simulada`.
- [ ] Hotspot, IP, `CORS_ORIGIN` y la instancia del puerto 5174 funcionando.
- [ ] Evento de la demo creado, con descuento y empezando en menos de 3 h.
- [ ] Cuenta de Martina nueva, verificada y sin membresía.
- [ ] Martina logueada en el celular; colaborador y admin logueados en la notebook.
- [ ] Brillo del celular al máximo para que la webcam lea el QR.
- [ ] Ensayo cronometrado completo al menos una vez.
