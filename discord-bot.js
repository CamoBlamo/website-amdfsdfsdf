import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;
const reviewChannelId = process.env.APPLICATION_REVIEW_CHANNEL_ID;

if (!token || !reviewChannelId) {
  console.warn('discord-bot: DISCORD_BOT_TOKEN and/or APPLICATION_REVIEW_CHANNEL_ID not configured. Bot will start in dry-run mode.');
}

const pendingApplications = new Map();

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: ['CHANNEL'],
});

discordClient.once('ready', () => {
  console.log(`Discord bot ready as ${discordClient.user?.tag}`);
});

discordClient.on('error', (error) => {
  console.error('discord-bot: client error', error);
});

discordClient.on('shardError', (error) => {
  console.error('discord-bot: shard error', error);
});

discordClient.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [prefix, applicationId, decision] = interaction.customId.split('_');
  if (prefix !== 'app' || !applicationId || !['accept', 'deny'].includes(decision)) {
    return;
  }

  const record = pendingApplications.get(applicationId);
  if (!record) {
    return interaction.reply({ content: 'This application is no longer available for moderation.', ephemeral: true });
  }

  const applicantTag = record.application.discordUsername || record.application.discordId || 'Applicant';
  const decisionDisplay = decision === 'accept' ? 'accepted' : 'denied';
  let dmResult = 'DM update not sent (no Discord user info).';

  try {
    if (record.application.discordId) {
      const targetUser = await discordClient.users.fetch(record.application.discordId);
      if (targetUser) {
        await targetUser.send(`Your application for ${record.application.applicationType} has been ${decisionDisplay}. Thank you for applying!`);
        dmResult = `Notified ${targetUser.tag}.`;
      }
    } else {
      const targetUser = discordClient.users.cache.find((u) => u.tag === record.application.discordUsername);
      if (targetUser) {
        await targetUser.send(`Your application for ${record.application.applicationType} has been ${decisionDisplay}. Thank you for applying!`);
        dmResult = `Notified ${targetUser.tag}.`;
      }
    }
  } catch (error) {
    console.warn('discord-bot: Unable to send DM to applicant', error);
  }

  pendingApplications.delete(applicationId);

  await interaction.update({
    content: `Application ${applicationId} ${decisionDisplay} by ${interaction.user.tag}. ${dmResult}`,
    components: [],
    embeds: [],
  });
});

export async function sendApplicationForReview(application) {
  if (!token || !reviewChannelId) {
    console.log('Application review:', JSON.stringify(application, null, 2));
    return;
  }

  if (!discordClient.isReady()) {
    await discordClient.login(token);
  }

  const channel = await discordClient.channels.fetch(reviewChannelId);
  if (!channel || !('send' in channel)) {
    throw new Error('Review channel not found or not writable');
  }

  const embed = new EmbedBuilder()
    .setTitle('New Application Submitted')
    .setColor('#4B7CBF')
    .addFields(
      { name: 'Application ID', value: application.id, inline: true },
      { name: 'Type', value: application.applicationType, inline: true },
      { name: 'Discord', value: application.discordUsername || 'n/a', inline: true },
      { name: 'Discord ID', value: application.discordId || 'not provided', inline: true },
      { name: 'DevDock Username', value: application.devdockUsername, inline: true },
      { name: 'Email', value: application.email, inline: true },
      { name: 'Submitted', value: application.submittedAt, inline: false },
      { name: 'Experience', value: application.responses.experience.slice(0, 1024) },
      { name: 'Scenario 1', value: application.responses.scenario1.slice(0, 1024) },
      { name: 'Scenario 2', value: application.responses.scenario2.slice(0, 1024) },
      { name: 'Scenario 3', value: application.responses.scenario3.slice(0, 1024) }
    )
    .setFooter({ text: `Applicant: ${application.discordUsername || application.discordId || 'Unknown applicant'}` });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app_${application.id}_accept`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_${application.id}_deny`).setLabel('Deny').setStyle(ButtonStyle.Danger)
  );

  const message = await channel.send({ embeds: [embed], components: [buttons] });
  pendingApplications.set(application.id, { application, messageId: message.id });

  return message;
}

// Auto-login when running this module directly (for local bot process)
if (token && reviewChannelId) {
  discordClient.login(token).catch((error) => {
    console.error('discord-bot: login failed', error);
  });
} else {
  console.log('discord-bot: no token or review channel provided; running in dry run mode.');
}
