import express, { Request, Response } from "express";
import consola from "consola";
import morgan from "morgan";

export default (PORT: number) => {
	const app = express();

	app.use(express.json());
	app.use(morgan("dev"));

	app.all("/", (req: Request, res: Response) => {
		res.status(200).json({
			status: 200,
			message: "OK",
			code: "OK",
			data: null,
		});
	});

	app.listen(PORT, () => {
		consola.success("Listening on port " + PORT);
	});
};
