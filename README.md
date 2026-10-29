# Auto Seidel GmbH + Co. KG – Website-Vorschau

Neue Website für den Kfz-Meisterbetrieb Auto Seidel in Schwarzenberg-Bermsgrün (Erzgebirge).
Die alte Seite auto-seidel.de zeigt nur noch eine Plesk-Standardseite; Inhalte stammen aus dem
Webarchiv (Stand 2016) und dem Google-Unternehmensprofil.

## Aufbau

- `public/` – die Seite (eine `index.html`, `assets/style.css`, `assets/app.js`, Bilder, Schrift lokal)
- `netlify/functions/chat.mjs` – KI-Assistent (Claude API, Streaming unter `/api/chat`)
- `dev-server.mjs` – lokale Vorschau inklusive Chat und Formular

## Lokal starten

```bash
npm install
node dev-server.mjs
```

Dann http://localhost:8803 öffnen. Ohne `ANTHROPIC_API_KEY` antwortet der Assistent mit festen Antworten.

## Veröffentlichen (Netlify)

1. Repo in Netlify verbinden (Publish-Ordner `public`, Funktionen `netlify/functions`, steht in `netlify.toml`).
2. Unter Site configuration → Environment variables `ANTHROPIC_API_KEY` eintragen.
3. Unter Forms die Formularerkennung einschalten; Anfragen landen als Formular „anfrage“.

## Noch offen

- Impressum: Registergericht, HRA-Nummer, Komplementär-GmbH und Geschäftsführung ergänzen (Anschrift, Telefon, Fax und USt-IdNr. stammen von der alten Seite).
- Datenschutzerklärung fehlt noch (Platzhalter).
- E-Mail-Adresse des Betriebs unbekannt.
- Samstag 09:00 bis 13:00 laut Google, bitte beim Betrieb bestätigen.
- Fahrzeuge im Abschnitt „Fahrzeughandel“ sind Beispiele mit Beispielpreisen.
- Beispielbilder (Unsplash) gegen eigene Fotos tauschen, sobald vorhanden. Quellen in `BILDQUELLEN.md`.
