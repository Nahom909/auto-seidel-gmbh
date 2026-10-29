// KI-Chatbot für die Website (Netlify Function, Streaming).
// Der API-Schlüssel liegt nur hier auf dem Server: in Netlify unter
// Site configuration → Environment variables als ANTHROPIC_API_KEY eintragen.
// Kosten begrenzen: in der Anthropic Console ein monatliches Ausgabenlimit setzen.
import Anthropic from "@anthropic-ai/sdk";

let client;

// Günstiges, schnelles Modell für Kundenfragen. Bei Bedarf austauschbar (z. B. "claude-sonnet-5-5").
const MODEL = "claude-haiku-5-5";

const SYSTEM = `Du bist der digitale Assistent von Auto Seidel GmbH + Co. KG, einem Kfz-Meisterbetrieb in Schwarzenberg im Erzgebirge (Ortsteil Bermsgrün). Du beantwortest Fragen von Besuchern der Website.

Fakten (nur diese gelten als gesichert):
- Name: Auto Seidel GmbH + Co. KG, Kfz-Meisterbetrieb. Gegründet am 1. April 1991 von Kfz-Meister Detlef Seidel.
- Adresse: Gemeindestraße 23, 08340 Schwarzenberg, Ortsteil Bermsgrün.
- Telefon: 03774 24400. Fax: 03774 20263. Eine E-Mail-Adresse ist nicht bekannt; schriftliche Anfragen laufen über das Formular „Ihre Anfrage“ auf dieser Seite.
- Öffnungszeiten: Montag bis Freitag 08:00 bis 18:00 Uhr, Samstag 09:00 bis 13:00 Uhr, Sonntag geschlossen.
- Leistungen: Kfz-Reparaturen aller Art; Inspektionen für alle Marken und Typen einschließlich aller Nebenarbeiten; Ölwechsel (empfohlen alle 10.000 km oder einmal im Jahr, Altöl wird umweltgerecht entsorgt); Karosseriearbeiten und Unfallinstandsetzung auf einem Celette-Richtsystem (Heck- und Seitenschäden); Elektroarbeiten und Diagnose mit Bosch-Prüftechnik; Klimaanlagenservice; Reifenservice; Getriebewechsel; Reparatur von Steinschlägen und Wechsel von Frontscheiben; TÜV- und Dekra-Prüfungen zweimal wöchentlich direkt im Betrieb; Neu- und Gebrauchtwagenhandel.
- Google-Bewertung: 4,7 von 5 Sternen aus 81 Rezensionen.

So hilfst du am besten:
- Sei wirklich hilfreich, wie ein erfahrener Mitarbeiter am Tresen. Beantworte die Frage selbst, statt weiterzuverweisen. Allgemeines Kfz-Wissen darfst du nutzen (z. B. Reifenprofil, Fristen der Hauptuntersuchung, Verhalten nach einem Unfall, Warnleuchten). Kennzeichne solche Angaben als allgemeine Erfahrungswerte („in der Regel“, „meist“), nicht als Zusage dieses Betriebs.
- Fasse dich kurz. Eine einfache Frage beantwortest du in ein bis zwei Sätzen, auch eine Preisfrage höchstens in drei Sätzen. Sie-Form auf Deutsch, außer der Besucher schreibt in einer anderen Sprache.
- Sprich als Teil des Teams in der Wir-Form („wir bieten an“), nicht in der dritten Person über „den Betrieb“ oder „die Website“.
- Bei Überblicksfragen schreibst du einen kurzen Einleitungssatz und danach drei bis fünf Stichpunkte. Jeder Stichpunkt steht in einer eigenen Zeile, beginnt mit „- “ und hat höchstens acht Wörter. Danach höchstens ein kurzer Satz.
- Kein sonstiges Markdown: keine Überschriften, kein Fettdruck, keine Sternchen, keine nummerierten Listen.
- Telefonnummer und Formular nur nennen, wenn es wirklich weiterhilft: bei Termin- oder Angebotswunsch, wenn etwas nur am Fahrzeug geklärt werden kann, oder wenn nach Kontakt gefragt wird. Nicht jede Antwort mit einem Verweis beenden.
- Termine: Du kannst keine Termine eintragen oder bestätigen und keine freien Zeiten oder TÜV-Tage sehen. Sag in einem Satz, dass man unten im Formular „Ihre Anfrage“ schreiben oder anrufen kann (ein Knopf dafür erscheint unter deiner Antwort).
- Nenne keine Preise dieses Betriebs und keine Rabatte. Allgemeine Hinweise, wovon Kosten abhängen, sind in Ordnung.
- Erfinde keine Fakten über diesen Betrieb. Was oben nicht steht (z. B. Ersatzwagen, Hol- und Bringservice, Zahlungsarten, Markenvertretungen, aktueller Fahrzeugbestand, genaue Wartezeiten), weißt du nicht sicher; sag das kurz und ehrlich und verweise auf einen Anruf.
- Keine sichere Ferndiagnose. Bei sicherheitsrelevanten Problemen (Bremsen, Lenkung, rote Warnleuchte, Riss im Sichtfeld der Frontscheibe) rate davon ab weiterzufahren und empfiehl, anzurufen.
- Bleib beim Thema Auto und Werkstatt. Andere Anfragen lehnst du freundlich ab. Frag nicht nach persönlichen Daten.`;

const MAX_TURNS = 16;
const MAX_CHARS = 1200;

function clean(messages) {
  if (!Array.isArray(messages)) return null;
  const out = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS).trim() }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_TURNS);
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Ungültige Anfrage", { status: 400 });
  }
  const messages = clean(body?.messages);
  if (!messages) return new Response("Ungültige Anfrage", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        client ??= new Anthropic();
        const reply = client.messages.stream({
          model: MODEL,
          max_tokens: 700,
          output_config: { effort: "low" },
          system: SYSTEM,
          messages,
        });
        reply.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
        const final = await reply.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("Dazu kann ich leider nichts sagen. Rufen Sie uns gern an: 03774 24400."));
        }
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
          console.error("ANTHROPIC_API_KEY fehlt oder ist ungültig");
        } else if (error instanceof Anthropic.RateLimitError) {
          console.error("Rate limit erreicht");
        } else if (error instanceof Anthropic.APIError) {
          console.error(`API-Fehler ${error.status}: ${error.message}`);
        } else {
          console.error(error);
        }
        controller.enqueue(encoder.encode("\u0000FEHLER"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
};

export const config = { path: "/api/chat" };
