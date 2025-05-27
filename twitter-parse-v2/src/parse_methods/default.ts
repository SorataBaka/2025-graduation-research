import LogModel from "../database/log_model";
import consola from "consola";
import parse_wrapper from "../parse_wrapper";
import { Proxy, ConfigType, CLIArgs } from "../types";
export default async (
	args: CLIArgs,
	configuration: ConfigType,
	proxy: Proxy
): Promise<void> => {
	const currentDate = new Date();
	const latestlog = await LogModel.create({
		smallest_date: currentDate,
		started_at: currentDate,
		timeline_start_date: currentDate,
	}).catch(() => null);
	if (latestlog === null)
		throw new Error("Unable to create new log. Check database connected?");
	consola.success("Created new log with id: ", latestlog.id);
	await parse_wrapper(latestlog, args, configuration, proxy);
};
