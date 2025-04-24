import mongoose, { Connection } from "mongoose";
import consola from "consola";
export default async (MONGOOSE_URI: string) => {
	mongoose
		.connect(MONGOOSE_URI)
		.then((instance) => {
			consola.success("Connected to Database");
		})
		.catch((err) => {
			consola.error(err);
			throw err;
		});
};
