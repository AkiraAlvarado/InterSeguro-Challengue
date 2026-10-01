# Reto técnico: QR y estadísticas de matrices

Aplicación de tres servicios: frontend web, API Go + Fiber y API Node.js + Express. Go valida la matriz, calcula su rotación horaria y factorización QR; luego envía Q y R por HTTP autenticado a Node, que calcula estadísticas.

## Decisión sobre el enunciado

El enunciado solicita QR como operación principal y también pide mostrar rotación. Se entregan ambas: una rotación de 90° en sentido horario de la matriz de entrada y la factorización QR de la matriz original.

La factorización usa reflexiones de Householder mediante Gonum, con QR delgada: para una entrada de tamaño $m \times n$ (con $m \ge n$), Q es $m \times n$ y R es $n \times n$, de modo que $A = QR$ y las columnas de Q son ortonormales. Se rechazan matrices vacías, no rectangulares y anchas ($m < n$). Cada dimensión se limita a 256 para contener memoria/CPU mientras Gonum materializa Q completa internamente; Go limita la entrada a 2 MiB y Node acepta hasta 4 MiB para Q/R.

## Rendimiento y límites

- La rotación recorre la matriz una vez: $O(mn)$ tiempo y memoria de salida $O(mn)$.
- Householder QR cuesta $O(mn^2)$; la salida es delgada, aunque la API de Gonum crea temporalmente Q completa ($O(m^2)$), de ahí el límite de dimensión.
- Node recorre cada factor una vez ($O(k)$ valores), con suma compensada de Neumaier para reducir error de redondeo y rechazo explícito de overflow.
- Los límites de payload y dimensiones también protegen los servicios de peticiones que agoten memoria/CPU.

## Arquitectura

```text
Navegador --> Frontend :5173 --JWT--> Go + Fiber :8080
        |                         | rotación + QR
        | login/token             | HTTP + JWT
        v                         v
       Node + Express :3000 <--- estadísticas de Q y R
```

## Ejecutar con Docker

Requisitos: Docker Desktop con Docker Compose v2.

Desde esta carpeta:

```sh
docker compose up --build
```

- Frontend: http://localhost:5173
- Go API: http://localhost:8080
- Node API: http://localhost:3000
- El navegador usa rutas del frontend (`/api/go` y `/api/node`), que reenvía las llamadas a los servicios; así la cookie HttpOnly permanece en el mismo origen.
- Acceso local de demostración: usuario `demo`, contraseña `demo-password` (no usar en producción).
- Estado de Go: `GET /health`
- Estado de Node: `GET /health`

Se puede copiar `.env.example` a `.env` y cambiar puertos y usuario. El ejemplo configura una sola cuenta mediante entorno; no incluye alta de usuarios ni base de datos de identidades. Go y Node deben compartir el mismo `JWT_SECRET`; la contraseña se compara contra un hash scrypt con sal, no se guarda en texto claro. Para una cuenta propia, genera un valor `AUTH_PASSWORD_HASH` así:

```sh
node --input-type=module -e "import {randomBytes,scryptSync} from 'node:crypto'; const salt=randomBytes(16).toString('hex'); console.log('scrypt:'+salt+':'+scryptSync('TU_CLAVE',salt,64).toString('hex'))"
```

En producción establece `NODE_ENV=production` y `APP_ENV=production`, usa un secreto aleatorio de al menos 32 bytes, `FRONTEND_ORIGIN` HTTPS, usuario/hash scrypt propios y `COOKIE_SECURE=true`. Ambos backends fallan al arrancar si falta esa configuración. Guarda los secretos en un gestor dedicado. Las APIs se comunican dentro de Compose mediante `http://node-api:3000`; no se debe usar `localhost` entre contenedores. El frontend usa `localhost` para alcanzar los puertos publicados desde el navegador.

## Ejecutar sin Docker

Requisitos: Go 1.24+ y Node.js 20+.

Terminal 1, API Node:

```sh
cd node-api
npm ci
npm test
npm start
```

Terminal 2, API Go:

```sh
cd go-api
go test ./...
STATISTICS_API_URL=http://localhost:3000 go run ./cmd/server
```

En PowerShell, configurar antes de iniciar Go con `$env:STATISTICS_API_URL="http://localhost:3000"`.

## Contrato HTTP

### `POST /api/auth/token` (Node)

Autentica usuario y contraseña; almacena la contraseña con scrypt y comparación en tiempo constante. Emite un JWT HS256 de una hora dentro de la cookie `matrixlab_token` (`HttpOnly`, `SameSite=Strict`, `Secure` habilitable). **El JWT no se incluye en el JSON ni queda disponible para JavaScript.**

### `GET /api/session` (Go) y `POST /api/auth/logout` (Node)

Go valida la cookie y responde si la sesión sigue vigente. Node borra la cookie al cerrar sesión. El JWT ya emitido no tiene revocación centralizada y, si se hubiera filtrado, sigue siendo válido hasta que expire (máximo una hora).

### `POST /api/qr` (Go, requiere cookie o Bearer JWT)

Solicitud:

```json
{
  "matrix": [[12, -51, 4], [6, 167, -68], [-4, 24, -41]]
}
```

Respuesta `200`: contiene `rotated`, `q`, `r` y `statistics`. `rotated` es la matriz original girada 90° en sentido horario. La respuesta de `statistics` incluye datos por matriz (`matrices.q`, `matrices.r`), la combinación (`combined`: mínimo, máximo, suma, promedio y cantidad de valores) y `diagonalMatrices`.

### `POST /api/statistics` (Node, requiere Bearer JWT de servicio)

Recibe `{"q": [[...]], "r": [[...]]}`. La detección de diagonal usa tolerancia $\varepsilon = 10^{-10}$ para valores flotantes; una matriz no cuadrada no se considera diagonal. El promedio se calcula sobre todos los valores de Q y R.

Errores: `401` si falta o es inválida la sesión; `400` para JSON/matrices inválidas; `502` en Go si la API de estadísticas no responde correctamente. Las llamadas entre servicios tienen timeout. El navegador envía la cookie con `credentials: include`; Go valida firma/expiración y `Origin` antes de usarla, y reenvía JWT como Bearer a Node. CORS solo permite el origen configurado y credenciales. La cookie no es accesible desde JavaScript ni se guarda en Web Storage.

## Pruebas

- Go: `cd go-api && go test ./...` — reconstrucción $QR \approx A$, ortogonalidad de Q, triangularidad de R, límites, rotación, JWT y prueba de integración de las rutas Fiber con Node simulado. Cobertura: `go test -cover ./...`.
- Node: `cd node-api && npm test` — estadísticas/suma estable, detección diagonal, firma/verificación JWT, scrypt, cookies, endpoint HTTP y configuración de producción válida/insegura. Cobertura: `npm test -- --experimental-test-coverage`.
- Docker ejecuta `go test ./...` durante la construcción de la imagen Go.

## Despliegue público en Render

El archivo `render.yaml` define los tres servicios Docker y configura el enlace privado Node → Go. Para publicar:

1. En Render, crea un **Blueprint** nuevo y conecta el repositorio `AkiraAlvarado/InterSeguro-Challengue` en la rama `main`.
2. Render leerá `render.yaml`. En la primera creación, proporciona `AUTH_USERNAME` y `AUTH_PASSWORD_HASH`; crea el hash con el comando de scrypt de la sección anterior. No introduzcas la contraseña como valor de `AUTH_PASSWORD_HASH`.
3. Confirma que el frontend tenga el subdominio `interseguro-challengue-ui.onrender.com`. Si Render asigna otro, actualiza `FRONTEND_ORIGIN` en el grupo `interseguro-challengue-secrets` con `https://` y redeploya Node y Go.
4. Espera a que los tres servicios indiquen **Live**. La URL del frontend será `https://interseguro-challengue-ui.onrender.com`; verifica allí el login y un análisis.
5. Comparte la URL y las credenciales temporales con el evaluador por un canal privado; no las guardes en GitHub.

Render genera `JWT_SECRET`; el mismo grupo de variables lo entrega a ambos backends. El frontend actúa como proxy same-origin y reenvía cookie y `Origin`, mientras Go llama a Node por la red privada. Los servicios API siguen autenticando sus rutas aunque Render les asigne URL pública. El plan gratuito puede suspender servicios inactivos y tardar en responder al primer acceso; verifica el precio/condiciones actuales de Render antes de desplegar.

También se puede desplegar en otra nube con las tres imágenes Docker; para producción, limita el acceso público de las APIs y permite solo tráfico interno desde el frontend/backend según la arquitectura del proveedor.

Para despliegue público, usa TLS y `COOKIE_SECURE=true`, reemplaza el usuario/hash demo y `JWT_SECRET`, guarda los secretos en un gestor y restringe CORS al dominio real del frontend. El login se limita a 10 intentos cada 15 minutos por IP; el contador actual es en memoria por instancia, así que con varias réplicas se necesita un almacén compartido. La cuenta demo es solo para ejecución local. HttpOnly reduce la exposición del token frente a XSS, pero no sustituye la prevención de XSS, CSRF, controles de acceso ni TLS.
