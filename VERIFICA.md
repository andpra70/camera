# Rapporto di verifica

Verifica eseguita l'11 settembre 2026. Sorgenti, configurazioni, script e documentazione implementati secondo `PROGETTO.md`; collaudo fisico delle camere ancora da eseguire.

## Risultati

| Verifica | Esito |
| --- | --- |
| TypeScript server e client | Superata |
| Test unitari e integrazione HTTP | 18 superati, 0 falliti |
| Test Playwright Chromium | 4 superati, 0 falliti |
| Build server e Vite | Superata in locale e dentro l'immagine |
| Formattazione Prettier | Superata |
| Sintassi script Bash | Superata |
| Build Docker standalone | Superata |
| Avvio Docker Compose con build e attesa readiness | Superato |
| Healthcheck container | `healthy` |
| Identità runtime | `uid=1000(node) gid=1000(node)` |
| Init container | `/usr/bin/tini --` |
| HTTP container sotto `/camera/` | Pagina, readiness e inventario senza camere verificati |
| Browser desktop/mobile sul container | Pagina vuota corretta, Avvia disabilitato, nessun errore JavaScript e nessun overflow orizzontale a 390 px |

I test coprono lettori condivisi, cleanup dopo 20 cicli, timeout, errore di spawn, SIGTERM/SIGKILL su processo reale, discovery con permessi negati e metadata, profili discreti/a passi, parser con JPEG FFmpeg reale, backpressure, snapshot, multipart, errori API, selezione/cambio camera/stop e retry limitati. Le verifiche HTTP e browser includono sia `/` sia `/camera/`.

## Ambiente e versioni osservate

- Node locale: 22.14.0; Node nel container: 24.21.0.
- Docker Engine: 29.1.3; Docker Compose: 2.40.3.
- Express: 5.2.1; React: 19.3.0; Vite: 7.3.6; TypeScript: 5.9.3.
- Playwright: 1.63.0; Chromium scaricato per la suite: 153.0.8010.12.
- Immagine basata su `node:24-bookworm-slim`, dipendenze JavaScript fissate nel lockfile.

Le immagini verificate sono state costruite localmente; nessun push a registry e nessuna pubblicazione Git sono stati eseguiti. I container temporanei di collaudo vengono rimossi al termine.

## Prove non eseguibili in questa sessione

Non erano presenti dispositivi `/dev/video*` nell'ambiente. Non è quindi verificata l'acquisizione fisica di una webcam Ubuntu, la compatibilità con specifici driver, il comportamento di occupazione/hotplug USB o la correttezza di un mapping con hardware reale.

Le fixture V4L2 e i provider simulati non sostituiscono queste prove. Restano da misurare su hardware reale latenza del primo frame, fps, banda, CPU/RSS e stabilità per 30 minuti con due lettori. Usare la checklist di `PROGETTO.md` e annotare modello camera, formato selezionato e caratteristiche dell'host.

## Riproduzione

```bash
npm ci
npm run check
npm run format:check
npx playwright install chromium
npm run test:e2e
docker compose up --build -d --wait
```

Per il mapping delle camere, vedere `README.md` e `docker-compose.devices.example.yml`. Durante questa sessione Chromium è stato installato in `/tmp/camera-playwright` e la suite eseguita con `PLAYWRIGHT_BROWSERS_PATH=/tmp/camera-playwright`.
