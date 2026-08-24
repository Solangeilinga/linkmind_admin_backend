import logger from "../utils/logger";

// Appel direct à l'API REST de Resend (pas de SDK ajouté ici, pour éviter
// une nouvelle dépendance npm dans ce service — `fetch` est natif à partir
// de Node 18+, largement suffisant pour ce seul usage).
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("[EMAIL] RESEND_API_KEY manquante — email non envoyé");
    throw new Error("Service email non configuré");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "BASYAM <noreply@basyam.com>",
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error(`[EMAIL] Échec envoi Resend (${res.status}): ${body}`);
    throw new Error("Échec de l'envoi de l'email");
  }
}
