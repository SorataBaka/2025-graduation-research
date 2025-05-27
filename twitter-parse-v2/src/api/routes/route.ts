import { Router } from "express";
import DefaultHandler from "../middleware/default";
import { CLIArgs } from "../../types";
import createStatusHandler from "./status";
import consola from "consola";
export default (args: CLIArgs): Router => {
	consola.success("Creating route handler");
	const router = Router();
	router.all("/", DefaultHandler);
	router.get("/status", createStatusHandler(args));
	return router;
};
