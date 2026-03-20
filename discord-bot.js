// discord-bot.js is no longer used for application submissions.
// Application review is now handled by webhook in application-handler.js.

console.log('discord-bot: not used in this deployment (webhook mode enabled).');

export async function sendApplicationForReview(application) {
  console.log('discord-bot: sendApplicationForReview called (no-op in webhook mode)', application.id);
  return;
}
