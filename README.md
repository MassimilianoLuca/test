# Reclami clienti – Diatecx

Versione web del modulo "Customer Complaint Form" (prima un .doc compilato e inviato via email),
con archivio dei reclami e dashboard per l'amministratore.

| File | A cosa serve |
|---|---|
| `index.html`, `script.js` | Modulo compilato dal cliente |
| `grazie.html` | Conferma dopo l'invio, con il numero del reclamo |
| `admin.html`, `admin.js`, `admin.css` | Dashboard amministratore: KPI, grafici, elenco, cambio stato, export CSV |
| `config.js` | URL dell'API (unica cosa da configurare nel sito) |
| `apps-script/Code.gs` | Backend: da incollare in Google Apps Script |

## Come funziona
- Il cliente invia il modulo → la Web App Apps Script:
  - salva il reclamo come riga nel Google Sheet (foglio **Reclami**) con un numero `REC-AAAA-NNNN` e stato **Aperto**;
  - salva l'eventuale foto nella cartella Drive **Reclami - Foto**;
  - manda un'email a **mluca@fbk.eu** con tutti i campi e la foto allegata ("Rispondi" risponde al cliente).
- L'amministratore apre `admin.html`, inserisce il token e vede:
  - KPI: reclami nel periodo, aperti (e da oltre 30 giorni), tempo medio di chiusura, % accolti,
    % con richiesta di sostituzione, % con foto o campioni;
  - grafici: reclami per mese, per divisione, per stabilimento, per stato, clienti e articoli con più reclami;
  - filtri per periodo, divisione, stabilimento, stato e ricerca libera;
  - elenco dei reclami; cliccando un reclamo si vedono i dettagli e si cambiano stato
    (Aperto / In lavorazione / Chiuso - accolto / Chiuso - respinto) e note interne;
  - esportazione CSV dei reclami filtrati.
- Il pulsante **Vedi con dati di esempio** mostra la dashboard con dati finti, senza bisogno di configurare nulla.

## Installazione (una volta sola)
1. Crea un nuovo **Google Sheet** (es. "Reclami Diatecx") con l'account Google che deve ricevere i dati.
2. Nel foglio: **Estensioni → Apps Script**. Cancella il contenuto e incolla `apps-script/Code.gs`. Salva.
3. Nell'editor seleziona la funzione **`setup`** e premi **Esegui**. Autorizza i permessi richiesti
   (Fogli, Drive, invio email). Nel **Registro di esecuzione** compare il **token amministratore**: conservalo.
4. **Esegui il deployment → Nuovo deployment → Tipo: App web**.
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
   Copia l'URL che termina con `/exec`.
5. Incolla l'URL in `config.js`:
   ```js
   window.CLAIMS_API_URL = 'https://script.google.com/macros/s/.../exec';
   ```
6. Pubblica il sito (es. GitHub Pages: Settings → Pages → ramo `master`).

Se modifichi `Code.gs` in seguito: **Esegui il deployment → Gestisci deployment → modifica → Nuova versione**
(così l'URL resta lo stesso).

## Note
- Il destinatario delle email si cambia in `NOTIFY_EMAIL` in `Code.gs`.
- Il token si cambia da Apps Script → Impostazioni progetto → Proprietà dello script → `ADMIN_TOKEN`.
- I dati si possono vedere e modificare anche direttamente nel Google Sheet
  (non rinominare né riordinare le colonne).
- Limite Google per account gratuiti: circa 100 email al giorno.
