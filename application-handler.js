async function resolveFetch() {
  if (typeof fetch !== 'undefined') {
    return fetch;
  }

  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
}

export async function handleApplicationSubmission(application) {
  const applicationWithId = {
    ...application,
    id: `app_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    submittedAt: new Date().toISOString(),
  };

  const webhookUrl = process.env.APPLICATION_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('application-handler: APPLICATION_WEBHOOK_URL not configured, logging application payload only.');
    console.log('application:', JSON.stringify(applicationWithId, null, 2));
    return applicationWithId;
  }

  try {
    const fetchFn = await resolveFetch();
    const response = await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `New application submitted: ${applicationWithId.applicationType}`,
        embeds: [
          {
            title: 'New application submitted',
            color: 0x4b7cbf,
            fields: [
              { name: 'Application ID', value: applicationWithId.id, inline: true },
              { name: 'Type', value: applicationWithId.applicationType || 'Unknown', inline: true },
              { name: 'Discord', value: applicationWithId.discordUsername || 'n/a', inline: true },
              { name: 'Discord ID', value: applicationWithId.discordId || 'not provided', inline: true },
              { name: 'DevDock Username', value: applicationWithId.devdockUsername, inline: true },
              { name: 'Email', value: applicationWithId.email, inline: true },
              { name: 'Submitted', value: applicationWithId.submittedAt, inline: false },
              { name: 'Experience', value: applicationWithId.responses.experience.slice(0, 1024) },
              { name: 'Scenario 1', value: applicationWithId.responses.scenario1.slice(0, 1024) },
              { name: 'Scenario 2', value: applicationWithId.responses.scenario2.slice(0, 1024) },
              { name: 'Scenario 3', value: applicationWithId.responses.scenario3.slice(0, 1024) },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '<unable to read>');
      throw new Error(`Webhook POST failed: ${response.status} ${response.statusText} ${bodyText}`);
    }

    console.log('application-handler: webhook sent successfully');
  } catch (err) {
    console.error('application-handler: webhook send failed', err);
  }

  return applicationWithId;
}
