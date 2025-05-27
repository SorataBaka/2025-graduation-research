import express, { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { DefaultResponse, ApiOptions, RouteResponse } from "./types";
import consola from "consola";
import NotFound from "./middleware/not_found";
import ErrorHandler from "./middleware/error";
export default (options: ApiOptions): void => {
	const app = express();
	app.use(express.json());
	app.use(morgan("dev"));
	app.set("trust proxy", true);

	app.all("/api", (req: Request, res: Response, next: NextFunction) => {
		res.status(200).json({
			status: 200,
			message: "OK",
			code: "OK",
			path: req.originalUrl,
		} as RouteResponse);
	});
	app.use(NotFound);
	app.use(ErrorHandler);

	app.listen(options.port, () => {
		consola.success("API is listening on port " + options.port);
	});
};
