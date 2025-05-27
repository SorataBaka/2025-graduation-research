import express from "express";
import morgan from "morgan";
import { ApiOptions } from "./types";
import consola from "consola";
import NotFound from "./middleware/not_found";
import ErrorHandler from "./middleware/error";
import createRouter from "./routes/route";
import { CLIArgs } from "../types";
export default (options: ApiOptions, args: CLIArgs): void => {
	consola.success("Creating API Endpoint");
	const app = express();
	app.use(express.json());
	app.use(morgan("dev"));
	app.set("trust proxy", true);
	app.use("/api", createRouter(args));
	app.use(NotFound);
	app.use(ErrorHandler);

	app.listen(options.port, () => {
		consola.success("API is listening on port " + options.port);
	});
};
