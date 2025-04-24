import ParseClass from "./ParseClass";
import dotenv from "dotenv";
import consola from "consola";
import InitializeDB from "./db/InitDB";
import initializeAPI from "./api/InitializeAPI";
import PostModel from "./db/posts";
import axios from "axios";

dotenv.config();

const startup = async () => {
	try {
		const URI = process.env.MONGODB_URI;
		const PORT = process.env.PORT || "3000";

		if (URI === undefined) throw new Error("MONGODB_URI is not provided");

		await InitializeDB(URI);
		initializeAPI(parseInt(PORT, 10));

		const latestPull = await PostModel.findOne().sort({ time: 1 });
		const latestTimePull = latestPull?.time
			? new Date(latestPull.time)
			: new Date();
		console.log(latestTimePull);
		const year = latestTimePull.getFullYear();
		const month = latestTimePull.getMonth() + 1;
		const day = latestTimePull.getDate();
		console.log(`${year}-${month}-${day}`);
		const parseClass = await ParseClass.initialize(
			"cookies.json",
			`https://x.com/search?f=top&q=RUU%20TNI%20%22RUU%20TNI%22%20(RUU%20OR%20TNI)%20until%3A${year}-${month}-${day}&src=typed_query`,
			20
		);

		await (await parseClass.login()).search();

		while (true) {
			const data = await parseClass.parse();
			console.log(data);
			await axios
				.post("http://localhost:3000/api/post/create", data)
				.catch(() => null);
		}
	} catch (e) {
		consola.error(e);
		throw e;
	}
};
startup();
