import mongoose, { Connection } from "mongoose";
import consola from "consola";
import Posts, { PostType } from "./posts";
// export default async (MONGOOSE_URI: string) => {
// 	await mongoose
// 		.connect(MONGOOSE_URI)
// 		.then(() => {
// 			consola.success("Connected to database");
// 		})
// 		.catch(() => {
// 			consola.error("Failed to connect to database");
// 		});
// 	mongoose.connection.on("disconnected", () => {
// 		consola.warn("Disconnected to database");
// 	});
// 	mongoose.connection.on("error", () => {
// 		consola.error("Database error");
// 	});
// };
export default class DatabaseClass {
	private connection!: Connection;
	public static postCollection: PostType = Posts;
	constructor(MONGOOSE_URI: string) {
		mongoose
			.connect(MONGOOSE_URI)
			.then((instance) => {
				consola.success("Connected to Database");
				this.connection = instance.connection;
			})
			.catch((err) => {
				consola.error(err);
				throw err;
			});
	}
	public getConnection(): Connection {
		return this.connection;
	}
}
