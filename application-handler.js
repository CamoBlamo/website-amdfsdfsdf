import { sendApplicationForReview } from './discord-bot.js';

export async function handleApplicationSubmission(application) {
  const applicationWithId = {
    ...application,
    id: `app_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    submittedAt: new Date().toISOString(),
  };

  await sendApplicationForReview(applicationWithId);

  return applicationWithId;
}
