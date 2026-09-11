# Ubuntu Camera Viewer

Web app in italiano per scegliere e vedere in diretta le camere V4L2 del server Ubuntu. Express serve API, JPEG/MJPEG e il client React compilato con Vite. Un solo container, utente non root, acquisizione FFmpeg condivisa fra lettori. Nessuna registrazione, audio o database.

## Avvio con Docker

Richiede Docker Engine e Docker Compose su Ubuntu. Dalla directory del progetto:

```bash
docker compose up --build -d
```

Aprire **http://127.0.0.1:3000/**. La configurazione base funziona anche senza camere: mostra un elenco vuoto. La build client e server avviene interamente nel Dockerfile. La porta host è associata a loopback per impostazione predefinita.

### Rendere disponibili le camere host

Il container non vede automaticamente le webcam Ubuntu. Prima individuare i nodi:

```bash
v4l2-ctl --list-devices
ls -l /dev/video*
stat -c '%g' /dev/video0
```

`v4l2-ctl` sull'host è fornito dal pacchetto Ubuntu `v4l-utils`. Scegliere i nodi esistenti, copiare l'override e impostare il GID numerico restituito da `stat`:

```bash
cp docker-compose.devices.example.yml docker-compose.override.yml
cp .env.example .env
```

Modificare `docker-compose.override.yml` per includere i device desiderati e aggiungere `VIDEO_GID=<numero>` a `.env`. Per esempio, con due nodi e GID 44:

```yaml
services:
  ubuntu-camera-viewer:
    devices:
      - /dev/video0:/dev/video0:rw
      - /dev/video2:/dev/video2:rw
    group_add:
      - "44"
```

Poi eseguire nuovamente `docker compose up --build -d`. Se i dispositivi appartengono a gruppi diversi, aggiungere ciascun GID a `group_add`. Il processo resta utente `node` (UID 1000), con gruppi supplementari; non occorre `privileged`.

Alcune webcam espongono un nodo video e uno metadata: l'app esclude i nodi privi di capacità di cattura. Più endpoint di cattura della stessa camera rimangono selezionabili e sono contrassegnati da un gruppo comune se riconoscibile.

Le camere aggiunte o rinumerate dopo l'avvio possono richiedere aggiornamento dell'override e ricreazione del container. Il pulsante Aggiorna rileva soltanto i device accessibili al processo. La baseline è Docker Engine nativo: Docker Desktop, rootless e camere con pipeline proprietarie non sono stati validati.

### Immagine da registry e script

`deploy.sh` costruisce e pubblica, su richiesta dell'operatore, l'immagine `${REGISTRY}/${IMAGE_NAME}:${TAG}`. Default: `docker.io/andpra70/ubuntu-camera-viewer:latest`. Serve un login Docker autorizzato per il push. L'implementazione non esegue automaticamente pubblicazioni.

```bash
TAG=1.0.0 ./deploy.sh
CAMERA_DEVICES=/dev/video0,/dev/video2 TAG=1.0.0 ./run.sh
```

`run.sh` esegue pull, ferma/rimuove un container omonimo e avvia quello nuovo. Rileva i GID dai device indicati, oppure usa `VIDEO_GID` se specificato. `ALL_CAMERAS=1` mappa esplicitamente tutti i `/dev/videoN` presenti all'avvio. Senza queste opzioni non mappa camere.

Per una build locale senza pull:

```bash
docker build -t ubuntu-camera-viewer:local .
IMAGE=ubuntu-camera-viewer:local PULL=0 ALL_CAMERAS=1 ./run.sh
```

Altre variabili script: `CONTAINER_NAME`, `HOST_BIND`, `HOST_PORT`, `IMAGE`, `REGISTRY`, `IMAGE_NAME`, `TAG`. `.env` viene letta da Compose; gli script shell usano le variabili esportate o passate sulla riga di comando. `publish.sh` contiene il flusso Git richiesto dalle istruzioni del repository e va eseguito soltanto intenzionalmente; non è necessario per avviare l'app.

## Sviluppo locale

Node.js >=22.12 (Node 24 nel container), npm, FFmpeg e `v4l2-ctl`. Le dipendenze JS sono bloccate da `package-lock.json`.

```bash
npm ci
./localrun.sh
```

Vite: **http://127.0.0.1:5173/**. API Express: porta 3000; Vite inoltra `/api` al backend. Il launcher di sviluppo usa `/` e termina entrambi i processi con Ctrl+C. L'utente host deve avere permessi sui device, anche fuori Docker.

Per verificare il comportamento di produzione e un prefisso:

```bash
npm run build
BASE_PATH=/camera/ PORT=3000 npm start
```

Aprire **http://127.0.0.1:3000/camera/**. Lo stesso client compilato funziona con qualsiasi `BASE_PATH` valido, senza nuova build; `/camera` reindirizza a `/camera/`. Non ci sono route SPA annidate. La configurazione Vite usa asset relativi e il client ricava gli URL dalla pagina corrente. Statici mancanti e API inesistenti restituiscono 404.

Un eventuale reverse proxy deve preservare il prefisso, evitare buffering/compressione sul MJPEG e usare timeout maggiori della durata della visualizzazione. Le richieste POST verificano l'origine contro protocollo e Host ricevuti da Express: la baseline supporta accesso HTTP diretto o proxy che preserva questi dati senza terminazione TLS. L'autenticazione e la pubblicazione HTTPS esterna richiedono un'integrazione dedicata.

## Utilizzo

1. Selezionare una camera nell'elenco: non si avvia automaticamente all'apertura.
2. Premere **Avvia**. Il browser mostra le immagini della camera Ubuntu, senza richiedere la propria webcam.
3. Cambiare selezione per passare a un'altra camera; **Ferma** chiude soltanto il proprio lettore.
4. **Aggiorna** richiede una scansione. L'inventario viene aggiornato automaticamente ogni 10 secondi.

I tentativi automatici per errori transitori sono limitati a tre, dopo 1, 2 e 4 secondi; al termine usare **Riprova**. Permessi insufficienti e formati non supportati richiedono intervento sul dispositivo/configurazione.

## Configurazione applicativa

Le variabili sono validate all'avvio. I percorsi ammessi per `BASE_PATH` contengono segmenti alfanumerici, `_` e `-`.

| Variabile | Default | Significato |
| --- | --- | --- |
| `PORT` | `3000` | Porta interna Express; mantenerla 3000 in Compose |
| `BASE_PATH` | `/` | Context path web e API |
| `CAMERA_ALLOWLIST` | vuoto | Percorsi `/dev/videoN` separati da virgola; vuoto = tutti i device visibili |
| `CAMERA_SCAN_INTERVAL_MS` | `10000` | Intervallo discovery |
| `TARGET_WIDTH`, `TARGET_HEIGHT`, `TARGET_FPS` | `640`, `480`, `15` | Profilo desiderato |
| `MAX_ACTIVE_CAMERAS` | `2` | Limite processi di acquisizione simultanei |
| `MAX_CLIENTS_PER_CAMERA` | `4` | Lettori simultanei, snapshot inclusi |
| `CAPTURE_START_TIMEOUT_MS` | `8000` | Attesa primo frame e snapshot |
| `CAPTURE_STALL_TIMEOUT_MS` | `10000` | Timeout senza immagini |
| `CAPTURE_IDLE_TIMEOUT_MS` | `3000` | Attesa prima del rilascio senza lettori |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

La selezione del profilo confronta, nell'ordine: risoluzioni entro l'obiettivo prima di quelle superiori, distanza da larghezza/altezza richieste, preferenza MJPEG e distanza dagli fps richiesti. Le gamme a passi sono normalizzate a una combinazione valida vicina all'obiettivo. Vengono esposti soltanto formati riconosciuti: MJPG/JPEG, YUYV, UYVY, NV12, YU12, RGB3, BGR3, GREY, H264. FFmpeg produce JPEG alla risoluzione negoziata e limita gli fps di uscita al target; non forza una risoluzione arbitraria.

Se `/dev/v4l/by-id` è visibile e i suoi link sono risolvibili dentro il container, viene usato per ID persistenti. In caso contrario gli ID valgono per la sessione e possono cambiare a ogni riavvio; un mapping standard dei soli device usa questo fallback. Non accettare ID come percorsi host.

## API

Percorsi relativi a `BASE_PATH`:

| Metodo | Percorso | Risposta |
| --- | --- | --- |
| GET | `api/health` | Stato processo, senza requisito hardware |
| GET | `api/ready` | 200 se client compilato, FFmpeg e v4l2-ctl disponibili; altrimenti 503 |
| GET | `api/cameras` | Inventario con `scannedAt`, `stale`, `diagnostics` |
| POST | `api/cameras/refresh` | Scansione e nuovo inventario, limitato a una richiesta/s |
| GET | `api/cameras/:id` | Camera e numero lettori |
| GET | `api/cameras/:id/snapshot` | JPEG non più vecchio di 2 secondi, oppure attesa nuovo frame |
| GET | `api/cameras/:id/stream` | `multipart/x-mixed-replace; boundary=frame` |

Schema errori: `{ "error": { "code", "message", "retryable" }, "requestId" }`. Codici e tipi sono definiti in `shared/src/models/camera.ts` e descritti nel progetto. Dopo gli header MJPEG, un errore chiude la connessione; lo stato resta interrogabile dall'API finché la camera è presente.

Un solo FFmpeg per camera attiva; snapshot e stream condividono i frame. Buffer JPEG massimo 5 MiB, ultimo frame mantenuto in memoria, al massimo un frame in attesa per client lento. Un client che non drena per 10 secondi viene scollegato. Il rilascio invia SIGTERM, poi SIGKILL dopo 3 secondi se necessario. Tini nel container gestisce i processi orfani e i segnali.

## Verifiche

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

`check`: TypeScript server/client, test unitari e HTTP, build completa. I test browser richiedono prima la build e avviano due server di test, su 3191 e 3192, con provider simulati non esposti dall'applicazione di produzione. `tests/fixtures/frame.jpg` è un monoscopio sintetico generato con FFmpeg. Le fixture testuali V4L2 sono rappresentative del formato CLI, non un collaudo di hardware collegato in questa sessione.

I test verificano capacità effettive V4L2, negoziazione formati, chunk JPEG e marker, scansioni accorpate, inventario obsoleto, snapshot, multipart, limiti, backpressure, timeout, crash, rimozione, cleanup, 20 cicli avvio/arresto e URL sotto context. Playwright verifica selezione, immagini decodificabili, cambio camera, stop e retry limitati.

Per il collaudo hardware seguire la tabella in `PROGETTO.md`: almeno una camera reale, occupazione esterna, scollegamento, due lettori, rilascio e arresto container. Misurare CPU/RSS/banda e latenza con modello e formato della camera registrati. Le prove simulate non dimostrano compatibilità USB o prestazioni hardware.

## Diagnostica

- **Elenco vuoto:** verificare `/dev/video*` sull'host, mapping Compose e capacità V4L2.
- **Permessi insufficienti:** confrontare `stat -c '%g' /dev/videoN` con `group_add`; verificare ACL host senza cambiare i permessi a tutti gli utenti.
- **Camera occupata:** chiudere altri programmi che acquisiscono il device e riprovare.
- **Formato non supportato:** controllare `v4l2-ctl --device /dev/videoN --list-formats-ext`.
- **Nuova camera non visibile:** aggiornare mapping e ricreare il container.
- **Readiness 503 in locale:** eseguire `npm run build` e controllare presenza di `ffmpeg` e `v4l2-ctl` nel PATH.
- **Immagine ferma dietro proxy:** controllare buffering e timeout; il client controlla anche `lastFrameAt` ogni 2 secondi.
- **Log:** `docker compose logs -f`, senza immagini o output FFmpeg integrale.

La porta è locale per default. Per rete LAN fidata impostare esplicitamente `HOST_BIND=0.0.0.0`. Non è presente autenticazione applicativa.

## Riferimenti tecnici

[Specifica del progetto](PROGETTO.md), [V4L2 capture](https://cdn.kernel.org/doc/html/latest/userspace-api/media/v4l/dev-capture.html), [FFmpeg V4L2](https://ffmpeg.org/ffmpeg-devices.html#video4linux2_002cv4l2), [Express static](https://expressjs.com/en/starter/static-files/), [Vite build](https://vite.dev/guide/build), [Node release schedule](https://github.com/nodejs/Release).
