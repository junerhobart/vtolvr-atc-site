const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Events = require("../schemas/events");

const Devs =["582279365912559631","1087024962914766898"]

module.exports = {
	name: "interactionCreate",
	async execute(interaction, client) {
const command = client.commands.get(interaction.commandName);

// check if is a button intertion for going to or declining an event

if (interaction.isButton()) {
  const [action, eventId] = interaction.customId.split("_");
  if (action === "join") {
	const event = await Events.findById(eventId);
	if (!event) {
		return interaction.reply({ content: "Event not found.", ephemeral: true });
	}
	if (event.attendees.some(attendee => attendee.id === interaction.user.id)) {
		return interaction.reply({ content: "You have already joined this event.", ephemeral: true });
	}
	event.attendees.push({ id: interaction.user.id, username: interaction.user.tag });
	await event.save();
	//update the event message to show the new attendee count
	const channel = await client.channels.fetch("1462570082793160867");
	const message = await channel.messages.fetch(event.messageId);
	const Event = EmbedBuilder.from(message.embeds[0])
	.spliceFields(5, 1, { name: "Attendees", value: event.attendees.map(a => a.username).join("\n") || "No attendees yet", inline: false })
	.setFooter({ text: `${event.attendees.length} attendees` });
	message.edit({ embeds: [Event] });

	const embed = new EmbedBuilder()
		.setTitle(`Joined Event: ${event.name}`)
		.setDescription(`You have successfully joined the event "${event.name}".\n\n**Host:** ${event.hostName}\n**Date:** ${new Date(event.startTime).toLocaleString()}`)
		.setColor("Green")
		.setFooter({ text: "VTOL VR ATC Bot" })
		.setTimestamp().setColor("#87cefa");
		

	return interaction.user.send({ embeds: [embed], ephemeral: true });
	  } else if (action === "leave") {
	const event = await Events.findById(eventId);
	if (!event) {
		return interaction.reply({ content: "Event not found.", ephemeral: true });
	}
	event.attendees = event.attendees.filter(attendee => attendee.id !== interaction.user.id);
	await event.save();
	//update the event message to show the new attendee count and remove the user from the attendee list to the already existing attendees field
	const channel = await client.channels.fetch("1462570082793160867");
	const message = await channel.messages.fetch(event.messageId);
	const Event = EmbedBuilder.from(message.embeds[0])
	.spliceFields(5, 1, { name: "Attendees", value: event.attendees.map(a => a.username).join("\n") || "No attendees yet", inline: false })
	.setFooter({ text: `${event.attendees.length} attendees` });
	message.edit({ embeds: [Event] });


	const embed = new EmbedBuilder()

		.setTitle(`Left Event: ${event.name}`)
		.setDescription(`You have left the event "${event.name}".\n\n**Host:** ${event.hostName}\n**Date:** ${new Date(event.startTime).toLocaleString()}`)
		.setColor("Red")
		.setFooter({ text: "VTOL VR ATC Bot" })
		.setTimestamp()
		.setColor("#87cefa");
	return interaction.user.send({ embeds: [embed], ephemeral: true });
	  }
	}
	  
if (!interaction.isCommand()) return;
if (!command) return;

if (interaction.user.bot) return interaction.reply({ content: 'Bots cannot use this command', ephemeral: true});
if( command.DevOnly && !Devs.includes(interaction.user.id.toString())) return interaction.reply({ content: 'Are you a spriggull brain or what? you are not allowed to use this command'});








 try{  
await command.execute(interaction, client);
 } catch (error) {
console.error(error);
return interaction.followUp({ content: 'There was an error while executing this command!\n' + error, ephemeral: true });

}
}}
