// Full Discord bot with invite tracking, ticket bumping, auto-deletion, and admin commands
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { config } = require('dotenv');
config(); // Load .env config

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

const invites = new Map();
const activeTickets = new Map(); // Track activity in tickets

// On bot ready
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const inviteList = await guild.invites.fetch();
  invites.set(guild.id, new Map(inviteList.map((inv) => [inv.code, inv.uses])));
});

// Track who invited new members
client.on(Events.GuildMemberAdd, async (member) => {
  const cachedInvites = invites.get(member.guild.id);
  const newInvites = await member.guild.invites.fetch();

  const usedInvite = newInvites.find((inv) => {
    const prev = cachedInvites.get(inv.code);
    return prev !== undefined && inv.uses > prev;
  });

  invites.set(member.guild.id, new Map(newInvites.map((inv) => [inv.code, inv.uses])));

  let inviterUsername = "vanity invite or unknown";
  if (usedInvite?.inviter) {
    inviterUsername = usedInvite.inviter.username;
  }

  let roleName = `Invited by ${inviterUsername}`;
  let inviterRole = member.guild.roles.cache.find(r => r.name === roleName);

  if (!inviterRole) {
    inviterRole = await member.guild.roles.create({
      name: roleName,
      color: 'Random',
      reason: 'Auto-created invite role',
    });
  }

  try {
    await member.roles.add(inviterRole);
    console.log(`${member.user.username} joined — assigned role: ${roleName}`);
  } catch (error) {
    console.error(`Failed to assign role to ${member.user.username}:`, error.message);
  }
});

// When a new channel is created (used as a ticket system)
client.on(Events.ChannelCreate, async (channel) => {
  if (channel.type === 0) { // Text channel
    const guild = channel.guild;
    const prospectRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'prospect');
    if (!prospectRole) return;

    activeTickets.set(channel.id, { prospectSpoke: false });

    // Bump message after 30 seconds (for testing; change to 6hr in production)
    setTimeout(async () => {
      if (!activeTickets.get(channel.id)?.prospectSpoke) {
        try {
          await channel.send(
            `Hey <@&${prospectRole.id}>!

This is just a quick bump reminding you to fill out the form and to send a voice note!

Failing to do so within a 24hour period will have this ticket deleted!`
          );
        } catch (err) {
          console.error(`Failed to send bump message in ${channel.name}:`, err.message);
        }
      }
    }, 30000); // 30 sec bump

    // Auto-delete after 30 seconds (for testing; change to 24hr in production)
    setTimeout(async () => {
      if (!activeTickets.get(channel.id)?.prospectSpoke) {
        try {
          await channel.send("⏳ This ticket is now being closed due to inactivity.");
          setTimeout(() => {
            channel.delete().catch(err =>
              console.error(`Failed to delete channel ${channel.name}:`, err.message)
            );
          }, 3000);
        } catch (err) {
          console.error(`Failed to delete channel ${channel.name}:`, err.message);
        }
      }
    }, 300000); // 30 sec delete

    // Intro message
    setTimeout(async () => {
      try {
        await channel.send(
          "**# How to apply:**\n\n" +
          ":writing_hand: 1️⃣ ➜ Submit your https://forms.gle/hdiNdsbEbykjgTaVA form (takes 60 seconds)\n\n" +
          ":microphone: 2️⃣ ➜ send us a voice note explaining:\n" +
          "- Why you'd be a great fit,\n" +
          "- A little about your hobbies"
        );
      } catch (err) {
        console.error(`Could not send intro message to ${channel.name}:`, err.message);
      }
    }, 6000);
  }
});

// On message, mark if a Prospect replied in a ticket
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const ticket = activeTickets.get(channelId);
  if (ticket) {
    const member = message.member;
    if (member?.roles.cache.some(r => r.name.toLowerCase() === 'prospect')) {
      ticket.prospectSpoke = true; // Mark the ticket as active
      activeTickets.set(channelId, ticket);
    }
  }

  // Admin-only delete command
  if (message.content.toLowerCase() === 'x!delete') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You don't have permission to use this command.");
    }
    try {
      await message.channel.send("⚠️ Deleting channel in 3 seconds...");
      setTimeout(() => message.channel.delete().catch(console.error), 3000);
    } catch (err) {
      console.error("Error during channel deletion:", err);
    }
    return;
  }

  // FAQ command
  if (message.content.toLowerCase() === '!faq') {
    const faqEmbed = new EmbedBuilder()
      .setTitle('📌 X RECRUITMENT – FAQ')
      .setColor('#014bac')
      .addFields(
        { name: '❓ What is this agency?', value: 'We’re an OnlyFans chatting agency. We partner directly with top models, letting chatters handle fan interactions and sales.' },
        { name: '💬 What does a chatter do?', value: 'Your job is to build strong relationships with fans and sell an experience that keeps them spending.' },
        { name: '⌨️ Why do I need to type over 100 WPM?', value: 'We work with extremely high-traffic accounts — fast typing and thinking are essential.' },
        { name: '🕓 What are the work hours?', value: 'Shifts are flexible. Most people work 8 hours/day, 6-7 days a week. You choose your schedule.' },
        { name: '🧭 What shift times can I choose from?', value: '**MAIN:** 01:00 – 09:00 UK\n**GRAVEYARD:** 09:00 – 17:00 UK\n**AFTERNOON:** 17:00 – 01:00 UK' },
        { name: '💸 How do I get paid and how much?', value: 'Paid monthly via bank or crypto. Average chatter earns $3K/month. Top performers earn $10K+.' },
        { name: '📝 What’s the hiring process?', value: 'Open a ticket. If selected, you’ll go through 1–3 weeks of training before assignment.' },
        { name: '🎤 Why do I need to send a voice note?', value: 'It helps us hear your vibe and confidence. Communication is key here.' },
      );
    await message.channel.send({ embeds: [faqEmbed] });
    return;
  }

  // Custom panel embed builder
  if (message.content.toLowerCase().startsWith('x!panel')) {
    const lines = message.content.split('\n').slice(1);
    const embed = new EmbedBuilder();
    const fields = [];
    let currentField = { name: '', value: '' };
    let color = '#00b0f4';

    for (const line of lines) {
      const [keyRaw, ...rest] = line.split(':');
      const key = keyRaw.trim().toLowerCase();
      const value = rest.join(':').trim();

      switch (key) {
        case 'title': embed.setTitle(value); break;
        case 'color': color = value.startsWith('#') ? value : `#${value}`; break;
        case 'name':
          if (currentField.name && currentField.value) fields.push({ ...currentField });
          currentField = { name: value, value: '' };
          break;
        case 'value': currentField.value += (currentField.value ? '\n' : '') + value; break;
        case 'enter': currentField.value += '\n'.repeat(parseInt(value) || 1); break;
      }
    }
    if (currentField.name && currentField.value) fields.push(currentField);
    if (fields.length > 0) embed.addFields(...fields);
    embed.setColor(color);

    const image = message.attachments.first();
    if (image?.contentType?.startsWith('image/')) {
      embed.setImage(image.url);
    }
    await message.channel.send({ embeds: [embed] });
  }

  // Rename ticket
  if (message.content.toLowerCase().startsWith('x!rename')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("❌ You don't have permission to rename channels.");
    }
    const newName = message.content.slice('x!rename'.length).trim();
    if (!newName) return message.reply("❌ Provide a new name. Example: `x!rename 100wpm-india-18yo`");
    if (newName.length > 100) return message.reply("❌ Name too long. Max 100 characters.");

    try {
      await message.channel.setName(newName);
      await message.reply(`✅ Channel renamed to **${newName}**`);
    } catch (err) {
      console.error(`Failed to rename channel:`, err);
      await message.reply("❌ Failed to rename. Check my permissions.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
