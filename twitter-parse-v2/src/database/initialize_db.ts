import mongoose from "mongoose";
import consola from "consola";
export default async (MONGOOSE_URI: string): Promise<void> => {
	mongoose.connection.on(
		"error",
		consola.error.bind(consola, "MongoDB Connection Error: ")
	);
	mongoose.connection.on("connected", () => {
		consola.success("Connected to MongoDB");
	});
	mongoose.connection.on("open", () => {
		consola.success("Database connection open");
	});
	await mongoose.connect(MONGOOSE_URI, {
		timeoutMS: 5000,
	});
	return;
};
