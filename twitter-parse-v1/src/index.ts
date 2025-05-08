import ParseClass from "./ParseClass";
import dotenv, { parse } from "dotenv";
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

		const initializePull = await PostModel.findOne().sort({ time: 1 });
		const initializeTimePull = initializePull?.time
			? new Date(initializePull.time)
			: new Date();
		const year = initializeTimePull.getFullYear();
		const month = initializeTimePull.getMonth() + 1;
		const day = initializeTimePull.getDate();
		const parseClass = await ParseClass.initialize(
			"cookies.json",
			`https://x.com/search?q=RUU%20TNI%20%22RUU%20TNI%22%20(RUU%20OR%20TNI)%20lang%3Aid%20until%3A${year}-${month}-${day}%20-filter%3Alinks%20-filter%3Areplies&src=typed_query&f=live`,
			50
		);
		await parseClass.login();
		while (true) {
			const findLatest = await PostModel.findOne().sort({ time: 1 });
			const findLatestTime = findLatest?.time
				? new Date(findLatest.time)
				: new Date();
			const newyear = findLatestTime.getFullYear();
			const newmonth = findLatestTime.getMonth() + 1;
			const newday = findLatestTime.getDate();
			console.log(`Setting new date to ${newyear}-${newmonth}-${newday}`);
			parseClass.setSearchQuery(
				`https://x.com/search?q=RUU%20TNI%20%22RUU%20TNI%22%20(RUU%20OR%20TNI)%20lang%3Aid%20until%3A${newyear}-${newmonth}-${newday}%20-filter%3Alinks%20-filter%3Areplies&src=typed_query&f=live`
			);
			await parseClass.search();
			const data = await parseClass.parse();
			console.log(data);
			await axios
				.post("http://localhost:3000/api/post/create", data)
				.catch(() => null);
			await new Promise((resolve) => {
				setTimeout(resolve, 2000);
			});
		}
	} catch (e) {
		consola.error(e);
		throw e;
	}
};
startup();
