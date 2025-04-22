import ParseClass from "./parse";
import dotenv from "dotenv";
import consola from "consola";
import initDb from "./db/init_db";

dotenv.config();

const startup = async () => {
	try {
		const URI = process.env.MONGODB_URI;
		if (URI === undefined) throw new Error("MONGODB_URI is not provided");
		await initDb(URI);

		const parseClass = await ParseClass.initialize("cookies.json");
		await parseClass.login();
		await parseClass.search('RUU TNI "RUU TNI"');
		await parseClass.observe();
	} catch (e) {
		consola.error(e);
	}
};
startup();
