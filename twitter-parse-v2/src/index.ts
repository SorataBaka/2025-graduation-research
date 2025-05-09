import dotenv from "dotenv";
import consola from "consola";
import initialize_db from "./database/initialize_db";
import ParseClass from "./parse_class";
import PostModel from "./database/post_model";
dotenv.config();

const proxy_username = process.env.PROXY_USERNAME || "";
const proxy_password = process.env.PROXY_PASSWORD || "";
const mongodb_uri = process.env.MONGODB_URI || undefined;

const proxy_enabled = proxy_username !== "" && proxy_password !== "";
if (!proxy_enabled) consola.warn("Proxy authentication disabled");
else consola.warn("Running with proxy");
if (mongodb_uri === undefined) throw new Error("MONGODB_URI is not provided");

type MetricKey = "views" | "likes" | "retweets" | "replies" | "bookmarks";

const keywords: Record<string, MetricKey> = {
	tayangan: "views",
	suka: "likes",
	"posting ulang": "retweets",
	balasan: "replies",
	markah: "bookmarks",
};

const multipliers: Record<string, number> = {
	rb: 1_000,
	jt: 1_000_000,
};

function parseMetrics(text: string): Partial<Record<MetricKey, number>> {
	const result: Partial<Record<MetricKey, number>> = {};
	const regex = /([\d.,]+)\s*(rb|jt)?\s*([a-z\s]+?)(?=,|$)/gi;

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		let num = parseFloat(match[1].replace(",", "."));
		const unit = match[2]?.toLowerCase();
		const rawLabel = match[3].trim().toLowerCase();
		const key = keywords[rawLabel];

		if (unit && multipliers[unit]) {
			num *= multipliers[unit];
		}

		if (key) {
			result[key] = Math.round(num);
		}
	}

	return result;
}

(async () => {
	await initialize_db(mongodb_uri);

	const initializePull = await PostModel.findOne().sort({ time: 1 });
	const initializeTimePull = initializePull?.time
		? new Date(initializePull.time)
		: new Date();
	const year = initializeTimePull.getFullYear();
	const month = initializeTimePull.getMonth() + 1;
	const day = initializeTimePull.getDate();

	const parser = await ParseClass.initializeWithOptions(
		`https://x.com/search?q=%22RUU%20TNI%22%20(RUU%20OR%20TNI)%20lang%3Aid%20until%3A${year}-${month}-${day}%20-filter%3Alinks%20-filter%3Areplies&src=typed_query&f=live`,
		{
			proxy_username,
			proxy_password,
			parse_limit: 2,
			scroll_delay: 500,
		}
	);
	await parser.authenticate();
	await parser.navigate();
	while (true) {
		const data = await parser.parse();
		//If the length is 0 it means we have reached the end.
		if (data.length === 0) {
			consola.warn("Reached end of current timeline.");
			const pullatest = await PostModel.findOne().sort({ time: 1 });
			const latesttime = pullatest?.time
				? new Date(pullatest.time)
				: new Date();
			const newyear = latesttime.getFullYear();
			const newmonth = latesttime.getMonth() + 1;
			const newday = latesttime.getDate() - 1;
			parser.setSearchURL(
				`https://x.com/search?q=%22RUU%20TNI%22%20(RUU%20OR%20TNI)%20lang%3Aid%20until%3A${newyear}-${newmonth}-${newday}%20-filter%3Alinks%20-filter%3Areplies&src=typed_query&f=live`
			);
			parser.navigate(); // Upon navigation, if query selector could find the div, that means we are being rate limited. We can implement a logic that allows us to restart the process in about 10 minutes.
			continue;
		}
		const cleaned = [];
		for (const post of data) {
			const author = post.author;
			const time =
				post.time === "DATEUNDEFINED" ? Date.now() : new Date(post.time);
			const content = post.content.replace(/@[^\s]+/g, "").trim();
			if (content.length === 0) continue;
			if (content.split(" ").length < 4) continue;

			const metrics = parseMetrics(post.data);

			cleaned.push({
				author: author,
				time: time,
				content: content,
				created_at: Date.now(),
				comment_count: metrics.replies || 0,
				like_count: metrics.likes || 0,
				repost_count: metrics.retweets || 0,
				view_count: metrics.views || 0,
			});
		}

		const writeResult = await PostModel.insertMany(cleaned, {
			ordered: false,
		}).catch((err: any) => {
			consola.error("Some inserts failed");
			consola.log("Failed documents: ", err.writeErrors);
			return null;
		});
		if (writeResult === null) throw new Error("Failed to save");
		consola.success("Successfully pushed: " + writeResult.length);
	}
})();
