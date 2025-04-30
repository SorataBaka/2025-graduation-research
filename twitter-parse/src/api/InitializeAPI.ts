import express, { NextFunction, Request, Response } from "express";
import consola from "consola";
import morgan from "morgan";
import ErrorMiddleware from "./middlewares/error";
import NotFoundMiddleware from "./middlewares/notfound";
import baseRouter from "./base";
import BodyParser from "body-parser";

export default (PORT: number) => {
	const app = express();

	app.use(express.json());
	app.use(morgan("dev"));
	app.use(BodyParser.json());
	app.use("/api", baseRouter);
	app.use(ErrorMiddleware);
	app.use(NotFoundMiddleware);

	app.listen(PORT, () => {
		consola.success("Listening on port " + PORT);
	});
};
