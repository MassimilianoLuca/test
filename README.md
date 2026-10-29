# Modulo reclamo cliente – Diatecx

Versione web del modulo "Customer Complaint Form" (prima un .doc compilato e inviato via email).

Pagina statica (`index.html`, `style.css`, `script.js`), nessun server necessario: si può aprire
direttamente nel browser o pubblicare su GitHub Pages / qualsiasi hosting statico.

## Come funziona
1. Il cliente compila il modulo (campi obbligatori segnati con `*`).
2. Premendo **Invia reclamo** il modulo viene validato e si apre il programma di posta
   con oggetto e testo del reclamo già compilati, indirizzati a `CLAIM_EMAIL`.
3. Le foto vanno allegate a mano all'email (un link `mailto:` non può allegare file).
4. **Stampa / PDF** permette di salvare il modulo compilato in PDF.

## Configurazione
Cambiare l'indirizzo di destinazione in cima a `script.js`:

```js
const CLAIM_EMAIL = 'reclami@diatecx.com';
```
