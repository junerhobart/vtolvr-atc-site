const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");

const clientId = "1481658305372880997";  

module.exports = (client) => {
	client.handleCommands = async (commandFiles, path) => {
		client.commandArray = [];
		
			for (var file of commandFiles) {
				const command = require(`../commands/${file}`);
				console.log(`[Discord bot]: Loaded [${file}] successfully.`);
				client.commands.set(command.data.name, command);
				client.commandArray.push(command.data.toJSON());
			}
		

		const restToken = process.env.D_TOKEN || process.env.Discord_TOKEN;
		const rest = new REST({ version: "9" }).setToken(restToken);
		(async () => {
			try {
				console.log("[Discord bot]:starting command refresh");

				await rest.put(Routes.applicationCommands(clientId), { body: client.commandArray });

				console.log("[Discord bot]:command refresh Finished");
			} catch (error) {
				console.error(error);
			}
		})();
	};
};