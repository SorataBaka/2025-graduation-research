import LogModel from "../database/log_model";
import consola from "consola";
import parse_wrapper from "../parse_wrapper";
import { Proxy, ConfigType, CLIArgs } from "../types";
import { isValidObjectId } from "mongoose";
export default async (
	args: CLIArgs,
	configuration: ConfigType,
	proxy: Proxy
): Promise<void> => {
	if (!isValidObjectId(args.id)) {
		consola.error("Provided id is not a valid mongodb id");
		process.exit(1);
	}
	const latestlog = await LogModel.findById(args.id).catch(() => null);
	if (latestlog === null) {
		consola.error("Unable to find the log with id: ", args.id);
		process.exit(1);
	}
	consola.success("Continuing from log with id: ", latestlog.id);
	await parse_wrapper(latestlog, args, configuration, proxy, true);
};
