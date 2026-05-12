#!/usr/bin/env node
/**
 * Register Discord slash commands for the Kannaoke Bot.
 *
 * Usage:
 *   DISCORD_CLIENT_ID=<id> DISCORD_BOT_TOKEN=<token> node scripts/register-bot-commands.mjs
 */

const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!clientId || !token) {
  console.error('Usage: DISCORD_CLIENT_ID=<id> DISCORD_BOT_TOKEN=<token> node scripts/register-bot-commands.mjs');
  process.exit(1);
}

const commands = [
  {
    name: 'random',
    description: 'Post a random song to this channel',
   },
  {
    name: 'gacha',
    description: 'Post a random song to this channel',
   },
  {
    name: 'schedule',
    description: 'Manage daily scheduled song posts',
    integration_types: [0], // guild install only
    contexts: [0],          // guild channels only
    options: [
      {
        name: 'set',
        description: 'Set up daily scheduled posting',
        type: 1, // SUBCOMMAND
        options: [
          { name: 'hour', description: 'Hour (0-23)', type: 4, required: true, min_value: 0, max_value: 23 },
          { name: 'minute', description: 'Minute (0-59)', type: 4, required: true, min_value: 0, max_value: 59 },
          { name: 'timezone', description: 'Timezone (e.g. Asia/Tokyo)', type: 3, required: true, autocomplete: true },
         ],
       },
      { name: 'cancel', description: 'Disable scheduled posting', type: 1 },
      { name: 'status', description: 'Show current schedule', type: 1 },
     ],
   },
];

const res = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
  method: 'PUT',
  headers: {
     'Authorization': `Bot ${token}`,
     'Content-Type': 'application/json',
     'X-Audit-Log-Reason': 'Register Kannaoke Bot commands',
   },
  body: JSON.stringify(commands),
});

if (res.ok) {
  console.log('Commands registered successfully');
} else {
  console.error(`Failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
