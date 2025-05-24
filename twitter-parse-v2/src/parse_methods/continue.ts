import LogModel from "../database/log_model";
import consola from "consola";
import parse_wrapper from "../parse_wrapper";
import { Proxy } from "../types";
export default async (
	search_parameters: string[],
	proxy: Proxy
): Promise<void> => {
	const latestlog = await LogModel.findOne()
		.sort({
			started_at: -1,
		})
		.catch(() => null);
	if (latestlog === null) {
		consola.error("Unable to find the latest log.");
		process.exit(1);
	}
	consola.success("Continuing from log with id: ", latestlog.id);
	await parse_wrapper(latestlog, search_parameters, proxy, true);
};
