# Faro · Observatorio del despliegue

[![CI](https://github.com/Pipe-C/faro-devops/actions/workflows/ci.yml/badge.svg)](https://github.com/Pipe-C/faro-devops/actions/workflows/ci.yml)

Entorno DevOps completo y pequeño: una interfaz que muestra, en tiempo real, el recorrido de una
petición a través de **proxy → web → API → base de datos**, y deja enviar una "señal" que se guarda
en MySQL. Es la evolución del laboratorio *Arquitectura multicontenedor con Docker Compose* del
Taller Final de Docker.

| Requisito del taller | Dónde está |
|---|---|
| Docker Compose multicapa | `docker-compose.yml` (borde, presentación, lógica, datos, monitoreo; 3 redes) |
| Proxy inverso con SSL | `deploy/proxy/default.conf.template` + `make certs` / `make letsencrypt-issue` |
| Acceso seguro vía VPN | Servicio `wireguard`: el monitoreo **no publica ningún puerto** |
| Monitoreo | Prometheus + Grafana + un *sentinel* propio en Python (`apps/sentinel`) |
| Scripts de automatización | `ops/faro_ops.py` (CLI en Python) + `Makefile` + CI |

## Arquitectura

```mermaid
flowchart LR
  U([Navegador]) -- "443 TLS" --> P[proxy · Nginx]
  P --> W[web · React estático]
  P --> A[api · Fastify]
  A --> D[(db · MySQL 8.4)]
  V([Cliente VPN]) -- "51820/udp" --> G[wireguard]
  G --> GF[grafana] & PR[prometheus]
  PR --> A
  PR --> S[sentinel · Python]
  S -. "sondea /health/ready" .-> A
  A -. "/snapshot" .-> S
```

Tres redes de Docker, dos de ellas `internal: true` (sin salida a Internet ni puertos en el host):

- `edge`: la única expuesta. Publica **80/tcp, 443/tcp y 51820/udp**, nada más.
- `app`: proxy ↔ web ↔ api ↔ db. La base de datos solo existe aquí.
- `mgmt`: Prometheus, Grafana, sentinel y WireGuard. Se administra únicamente por la VPN.

## Replicar el proyecto paso a paso

### 1. Requisitos

| Sistema | Qué instalar |
|---|---|
| **Ubuntu / Debian** | `sudo apt install docker.io docker-compose-v2 python3 openssl make git` y luego `sudo usermod -aG docker $USER` (cierra sesión y vuelve a entrar). |
| **Windows** | Docker Desktop con integración **WSL2** y una distro Ubuntu. Ejecuta todo **dentro de Ubuntu (WSL)** y clona el repositorio en `~/` (no en `/mnt/c/...`): fuera del sistema de archivos de Linux los permisos de secretos y certificados no se respetan. |
| **macOS** | Docker Desktop, Python 3, OpenSSL y make. Sin VPN: ver [solución de problemas](#solución-de-problemas). |

Comprueba las versiones: `docker compose version` debe responder (Compose v2) y `make --version` también.

### 2. Clonar e inicializar

```bash
git clone https://github.com/Pipe-C/faro-devops.git
cd faro-devops
make init       # crea los secretos aleatorios y el archivo .env
```

`make init` genera tres contraseñas en `deploy/secrets/` y crea `.env` a partir de `.env.example`.
Si necesitas cambiar algo (puertos ocupados, dominio, clientes VPN), **este es el momento**: edita `.env`
antes del siguiente paso. Variables más habituales:

| Variable | Por defecto | Cuándo cambiarla |
|---|---|---|
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Si están ocupados: usa `8080` / `8443` |
| `PUBLIC_URL` | `https://faro.localhost` | Si cambias el puerto: `https://faro.localhost:8443` |
| `WG_SERVERURL` | `auto` | IP o dominio por el que los clientes alcanzan el servidor VPN (ver [VPN](#acceso-por-vpn-wireguard)) |
| `WG_PEERS` | `laptop,celular` | Nombres de los clientes VPN que se crean |

### 3. Verificar requisitos

```bash
make doctor
```

Debe mostrar `✓` en todo. Un `!` en un puerto es un aviso (ocupado); un `✗` hay que corregirlo:

```
 ✓ Docker instalado
 ✓ Docker Compose v2 disponible
 ✓ OpenSSL instalado
 ✓ Archivo .env presente
 ✓ Secretos generados
 ✗ Certificado TLS presente   Ejecuta `make certs`      <- normal antes del paso 4
```

### 4. Levantar todo

```bash
make up
```

Genera el certificado TLS si falta, construye las tres imágenes y arranca los contenedores. La primera vez
tarda varios minutos (descarga de imágenes). Termina cuando todos los servicios con *healthcheck* están
`healthy`. Compruébalo con `make ps`.

### 5. Probar

```bash
make smoke
```

Ocho comprobaciones de extremo a extremo (redirección HTTP→HTTPS, TLS verificado, cabeceras de seguridad,
API, escritura y lectura en MySQL, `/metrics` oculto). El resultado esperado es:

```
 ✓ HTTP redirige a HTTPS (301)
 ✓ HTTPS responde con certificado verificado
 ✓ Cabeceras de seguridad presentes (HSTS, CSP, nosniff)
 ✓ /api/status responde y la base de datos está operativa
 ✓ POST /api/signals guarda una señal (201)
 ✓ La señal aparece en GET /api/signals
 ✓ Mensaje inválido se rechaza (400)
 ✓ /metrics NO está expuesto al exterior (404)

8/8 comprobaciones correctas
```

Después abre **https://faro.localhost** (o la URL de `PUBLIC_URL`). El navegador avisará del certificado
porque lo firma una CA local: acepta la excepción o importa `deploy/certs/ca.crt` como autoridad raíz.
Si `faro.localhost` no resolviera en tu equipo, añade `127.0.0.1 faro.localhost` a `/etc/hosts`.

Qué deberías ver: un titular de estado («Todo el recorrido responde.»), las cuatro capas en verde, el
formulario para enviar una señal y la bitácora con el mensaje de bienvenida. Envía una señal, ejecuta
`make down && make up` y comprueba que sigue en la bitácora: está guardada en el volumen de MySQL.

### 6. Apagar

```bash
make down       # detiene los contenedores y conserva los datos
make clean      # ¡destructivo! borra también los volúmenes (base de datos incluida)
```

`make help` lista todos los comandos. Los más usados: `make logs S=api`, `make ps`, `make restart S=proxy`.

## Acceso por VPN (WireGuard)

Grafana y Prometheus no tienen puertos publicados. Solo se entra por el túnel.

1. **Antes del primer `make up`**, en `.env` pon `WG_SERVERURL` con la dirección por la que tu cliente
   alcanzará el servidor: la IP pública o el dominio en un servidor real, o la IP de tu red local
   (p. ej. `192.168.1.20`) si pruebas desde otro dispositivo de tu casa. Las configuraciones de los
   clientes se generan una sola vez; si cambias `WG_SERVERURL` o `WG_PEERS` después, ejecuta
   `docker compose down`, borra el contenido de `deploy/wireguard/` y vuelve a hacer `make up`.
2. Con el entorno levantado: `make vpn PEER=laptop` imprime la configuración del cliente
   (o `make vpn-qr PEER=celular` muestra un QR para la app de WireGuard del móvil).
3. En el cliente: guarda esa configuración como `/etc/wireguard/faro.conf` y activa el túnel con
   `sudo wg-quick up faro` (Linux; requiere `sudo apt install wireguard`), o impórtala en la app de WireGuard.
4. Con el túnel activo abre `http://grafana:3000` (usuario `admin`, contraseña en
   `deploy/secrets/grafana_admin_password.txt`) y `http://prometheus:9090`.
5. `make vpn-status` muestra qué clientes están conectados.

Los nombres se resuelven porque `PEERDNS=auto` reenvía al DNS interno de Docker. El túnel es *dividido*:
solo viaja por él el tráfico hacia `10.13.13.0/24` y `172.28.0.0/24`; el resto de tu Internet no cambia.
Conviene probar la VPN desde **otro dispositivo**: usar como cliente la misma máquina que hospeda los
contenedores complica el enrutamiento.

## Monitoreo

- **API** (`/metrics`): histograma de duración por ruta y código, contador de señales, métricas de proceso.
- **Sentinel** (Python/FastAPI): sondea `/health/ready` cada 10 s, lee la vigencia del certificado TLS desde disco y expone `/metrics` y `/snapshot`. La API reutiliza ese snapshot para pintar la telemetría de la interfaz.
- **Prometheus**: reglas en `deploy/monitoring/rules.yml` (API caída, sonda fallando, certificado a < 14 días, p95 alto, tasa de 5xx).
- **Grafana**: datasource y dashboard «Faro · Visión general» aprovisionados automáticamente.

No se incluye Alertmanager: las alertas se ven en Prometheus/Grafana, pero no se envían por correo.

## Automatización (`ops/faro_ops.py`, solo biblioteca estándar)

| Comando | Qué hace |
|---|---|
| `make init` | Secretos aleatorios (`secrets.token_urlsafe`), `.env` y el grupo propietario de `deploy/secrets` (`SECRETS_GID`). Idempotente. |
| `make certs` | CA local + certificado ECDSA P-256 con SAN (`faro.localhost`, `localhost`, `127.0.0.1`) y el grupo propietario de `deploy/certs` (`CERTS_GID`). |
| `make doctor` | Docker, Compose, OpenSSL, secretos, vigencia del certificado y puertos libres. |
| `make smoke` | HTTP→HTTPS, TLS verificado, cabeceras, API, escritura y lectura en MySQL, `/metrics` oculto. |
| `make backup` / `make restore FILE=…` | `mysqldump` comprimido en streaming, con retención de 7 copias. |
| `make letsencrypt-issue` / `-renew` | Certificado público con Certbot (reto HTTP-01) y recarga de Nginx. Programa la renovación con `cron`. |

## Seguridad: decisiones principales

- **Secretos fuera del código y de las variables de entorno**: Docker secrets en archivos (`deploy/secrets/`, ignorados por Git). La API acepta `DB_PASSWORD_FILE`; MySQL y Grafana soportan `*_FILE`.
- **Mínimo privilegio**: ningún contenedor propio corre como root; `cap_drop: ALL`, `no-new-privileges` y sistema de archivos de solo lectura en API y sentinel. WireGuard es el único con una capacidad añadida (`NET_ADMIN`).
- **Aislamiento de red**: la base de datos nunca tiene acceso a Internet ni a un puerto del host.
- **Nginx**: TLS 1.2/1.3 con suites modernas, HSTS, CSP estricta, `X-Frame-Options`, `nosniff`, `Referrer-Policy`; límite de 10 req/s por IP; rechaza peticiones con `Host` desconocido; `X-Forwarded-For` se sobrescribe (no se puede falsificar); `/metrics` y `/health` no se enrutan.
- **API**: validación con Zod, consultas preparadas (sin SQL concatenado), Helmet, *rate limit* global y más estricto en escritura, errores 5xx sin detalles internos, cuerpo máximo de 4 KiB.
- **Cliente**: React escapa el texto de las señales; la CSP bloquea scripts y estilos en línea.

### Permisos de secretos y certificados (lección del CI)

Los contenedores corren con usuarios sin privilegios (Nginx uid 101, API uid 1000, MySQL 999, Grafana 472…)
que **no son el dueño** de los archivos del anfitrión. Un directorio `0700` o un archivo `0600` los dejaría
sin acceso, porque al montar una carpeta (`./deploy/certs`) el contenedor necesita poder atravesarla. Abrir
todo a «otros» (`0644`) expondría las claves a cualquier usuario del equipo. La solución es el **grupo**:

- Directorios `0750` y archivos `0640`: dueño y grupo leen, el resto no.
- `make init` y `make certs` anotan en `.env` el GID del grupo propietario (`SECRETS_GID`, `CERTS_GID`).
- Compose los pasa a `group_add` de cada servicio que necesita leerlos, de modo que el usuario sin
  privilegios del contenedor pertenece a ese grupo.

El GID depende de cada máquina (típicamente 1000 en un portátil y 1001 en GitHub Actions), por eso se
calcula en lugar de fijarse. Si ves `Permission denied` al cargar el certificado, revisa
[solución de problemas](#solución-de-problemas).

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada *push* y *pull request*:

| Job | Qué valida |
|---|---|
| `api` | Tipos, pruebas y compilación de TypeScript |
| `web` | Tipos, separación diseño/código, pruebas, *build* y detector de Impeccable |
| `sentinel` | Pruebas de Python (pytest) |
| `ops` | Pruebas de la CLI y formato de **todos** los mensajes de commit |
| `compose` | Genera secretos y certificados, valida el Compose, construye las imágenes, levanta el entorno y ejecuta `make smoke` |

El job `compose` usa puertos altos (8080/8443) porque los *runners* no enlazan 80/443, y si algo falla
imprime un diagnóstico completo: estado de los contenedores, logs de proxy, API, MySQL, Grafana y
sentinel, salud de proxy y API, la configuración efectiva de Nginx (`nginx -T`) y los permisos de
secretos y certificados. Es lo primero que conviene mirar en una ejecución roja.

## Estructura

```
apps/
  web/        React 19 + TypeScript + Vite + Tailwind v4 (diseño en src/styles)
  api/        Node 22 + Fastify 5 + TypeScript (repositorio inyectable)
  sentinel/   Python 3.12 + FastAPI + prometheus-client
deploy/       proxy, esquema SQL, monitoreo; secrets/ certs/ wireguard/ (generados, no versionados)
ops/          CLI de automatización y sus pruebas
tools/        validador de commits
PRODUCT.md DESIGN.md   contexto y sistema de diseño (convención de Impeccable)
```

## Diseño y la librería Impeccable

Impeccable no es una librería de componentes: es un vocabulario de diseño para agentes de IA con un
detector de "patrones genéricos". Aquí se aplica de dos formas:

1. `PRODUCT.md` y `DESIGN.md` documentan el contexto y las decisiones antes de escribir CSS.
2. `make design-check` ejecuta `npx impeccable detect src/` (también en CI).

**Tailwind v4 y separación de responsabilidades**: los tokens viven en `tokens.css` (`@theme`) y cada
componente tiene su CSS con nombres semánticos (`route__stop`, `button`) construido con `@apply`.
Los `.tsx` no contienen ni una utilidad. `npm run lint:design` lo hace cumplir y falla si aparece
una clase que no esté definida o un `className` dinámico.

## Desarrollo y pruebas

Sin Docker, para trabajar en el código (requiere Node 22+ y Python 3.12):

```bash
make setup      # instala las dependencias de la API, la web y el sentinel
make test       # tipos + pruebas de las tres aplicaciones y de ops
make lint       # separación diseño/código y formato de commits
```

## Convención de commits

Conventional Commits en español, **máximo 50 caracteres** en el asunto: `feat(api): agrega ruta de señales`.
Tipos válidos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`;
la descripción empieza en minúscula y no termina en punto. `make hooks` activa un hook local que lo valida
antes de cada commit; el job `ops` del CI lo revisa en todo el historial.

## Diferencias frente a la guía original del laboratorio

| Guía | Faro |
|---|---|
| `CREATE laboratorio;` (SQL inválido) | `CREATE TABLE` sobre la base que crea la imagen (`MYSQL_DATABASE`) |
| `-predes123` en la verificación (contraseña mal escrita) | Sin contraseñas en comandos: se leen del secreto dentro del contenedor |
| Contraseña `redes123` fija y por defecto en el código | Secretos aleatorios por instalación; la API falla si no hay contraseña |
| `fetch('http://localhost:3000')` (solo funciona en la misma máquina) | Ruta relativa `/api` a través del proxy |
| Backend publicado en el puerto 3000, MySQL como `root` | Solo el proxy publica puertos; la API usa un usuario propio sin privilegios de administración |
| `version: '3.8'` (obsoleto) y `mysql:8.0` (fin de soporte) | Compose sin `version`, `mysql:8.4` LTS |
| `depends_on` sin esperar a la base de datos | `healthcheck` + `condition: service_healthy` |

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `address already in use` | Puerto ocupado. Cambia `HTTP_PORT`/`HTTPS_PORT`/`PUBLIC_URL` en `.env` y repite `make up`. |
| `permission denied` al cargar `fullchain.pem`/`privkey.pem`, o el proxy queda `unhealthy` | Falta el GID del grupo propietario en `.env`. Comprueba `grep GID .env` y `ls -ln deploy/certs`: el número de grupo de los archivos debe coincidir con `CERTS_GID`. Para regenerar: `make certs ARGS=--force` y `make up`. |
| `permission denied` leyendo una contraseña (API, MySQL o Grafana en bucle de reinicio) | Igual con `SECRETS_GID`: `grep GID .env` y `ls -ln deploy/secrets`; ejecuta `make init` para que lo registre. |
| El navegador desconfía del certificado | Es normal con una CA local. Acepta la excepción o importa `deploy/certs/ca.crt` como autoridad raíz. |
| `faro.localhost` no resuelve | Añade `127.0.0.1 faro.localhost` a `/etc/hosts` (en Windows, también al archivo `hosts` de Windows). |
| WireGuard no arranca (Docker Desktop en Mac/Windows) | Necesita un kernel Linux con el módulo `wireguard`. Funciona en Ubuntu y WSL2 recientes. Sin VPN: `docker compose up -d --build --scale wireguard=0`. |
| Cambié las contraseñas con `make init ARGS=--force` y MySQL rechaza la conexión | La base conserva la contraseña antigua en su volumen: `make clean` (borra los datos) y `make up`. |
| La telemetría dice «el sentinel no está reportando» | `make logs S=sentinel`. |
| Cualquier otro fallo | `make ps` y `make logs S=<servicio>` (`proxy`, `api`, `db`, `sentinel`, `prometheus`, `grafana`). |

## Alcance y límites conocidos

- Sin Alertmanager, sin tracing ni logs centralizados (Loki): añadirlos es el siguiente paso natural.
- Un solo nodo: no hay alta disponibilidad de MySQL ni balanceo.
- La API guarda mensajes públicos sin autenticación: es una demostración de infraestructura, no un producto.
