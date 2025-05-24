import LogModel from "../database/log_model";
import consola from "consola";
import parse_wrapper from "../parse_wrapper";
import { Proxy } from "../types";
import { isValidObjectId } from "mongoose";
export default async (
	search_parameters: string[],
	proxy: Proxy,
	id: string
): Promise<void> => {
	if (!isValidObjectId(id)) {
		consola.error("Provided id is not a valid mongodb id");
		process.exit(1);
	}
	const latestlog = await LogModel.findById(id).catch(() => null);
	if (latestlog === null) {
		consola.error("Unable to find the log with id: ", id);
		process.exit(1);
	}
	consola.success("Continuing from log with id: ", latestlog.id);
	await parse_wrapper(latestlog, search_parameters, proxy, true);
};
