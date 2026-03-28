const {EmbedBuilder, SlashCommandBuilder,ButtonBuilder,ActionRowBuilder,ButtonStyle} = require('discord.js');
const User = require("../schemas/users");
module.exports = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('view your account information').addUserOption(option =>
      option.setName('user')
        .setDescription('the user to view the account information of')
        .setRequired(false)),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const user = await User.findOne({ DiscordID: targetUser.id });
    if (!user) {
        return interaction.reply({ content: 'This user does not have an account linked. Please use the /link command to link their account.', ephemeral: true });
    }
    const profileButton = new ButtonBuilder()
        .setLabel('View own Profile')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://arn-control.com/profile`);
    const row = new ActionRowBuilder().addComponents(profileButton);
    const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Account Information`)
        .setDescription(`Here is the account information for ${targetUser.username}.`)
        .addFields(
            { name: 'Username', value: user.Username || 'N/A', inline: true },
            {name:"User ID", value: `<@!${user.DiscordID}>` || 'N/A', inline: true},
            { name: 'Flight Hours', value: user.Flighthours || 'N/A', inline: true },
            { name: 'Roles', value: user.Role?.join(',\n') || 'N/A', inline: true },
            { name: 'Account Created', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A', inline: true }
        )
        .setThumbnail(targetUser.avatarURL() || "https://cdn.discordapp.com/attachments/1128199132030869536/1130794416448359420/unknown.png")
        .setColor("#87cefa")
        .setFooter({ text: "ARN Control Bot" })
        .setTimestamp();
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });



    


  }
}