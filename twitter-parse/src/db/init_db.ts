import mongoose from "mongoose";
import consola from "consola";
export default async (MONGOOSE_URI: string) => {
	await mongoose.connect(MONGOOSE_URI);
	mongoose.connection.on("connect", () => {
		consola.success("Connected to the database");
	});
	mongoose.connection.on("disconnected", () => {
		consola.warn("Disconnected to database");
	});
	mongoose.connection.on("error", () => {
		consola.error("Database error");
	});
};
