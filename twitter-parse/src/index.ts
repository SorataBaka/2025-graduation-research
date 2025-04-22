import ParseClass from "./parse";
import dotenv from "dotenv";
import consola from "consola";
import DatabaseClass from "./db/init_db";
import initializeAPI from "./api/init_api";

dotenv.config();

const startup = async () => {
	try {
		const URI = process.env.MONGODB_URI;
		const PORT = process.env.PORT || "3000";

		if (URI === undefined) throw new Error("MONGODB_URI is not provided");

		new DatabaseClass(URI);
		initializeAPI(parseInt(PORT, 10));

		const parseClass = await ParseClass.initialize("cookies.json");

		await parseClass.login();
		await parseClass.search('RUU TNI "RUU TNI"');
		await parseClass.observe();
	} catch (e) {
		consola.error(e);
	}
};
startup();
