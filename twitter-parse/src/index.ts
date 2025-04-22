import ParseClass from "./parse";
import dotenv from "dotenv";
import consola from "consola";

dotenv.config();

const startup = async () => {
	try {
		const parseClass = await ParseClass.initialize("cookies.json");
		await parseClass.login();
		await parseClass.search('RUU TNI "RUU TNI"');
		await parseClass.observe();
	} catch (e) {
		consola.error(e);
	}
};
startup();
