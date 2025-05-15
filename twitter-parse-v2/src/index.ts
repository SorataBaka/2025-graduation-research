import dotenv from "dotenv";
import consola from "consola";
import initialize_db from "./database/initialize_db";
import ParseClass, { Timeline } from "./parse_class";
import PostModel from "./database/post_model";
import LogModel from "./database/log_model";

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
	await initialize_db(mongodb_uri as string);
	const latestlog = await LogModel.create({
		smallest_date: new Date(),
		started_at: Date.now(),
	});
	const log_id = latestlog.id;
	consola.success("Created new log with id: " + log_id);
	const parser = await ParseClass.initializeWithOptions(
		ParseClass.generateSearchURL({
			either: [
				"#TolakRUUTNI",
				"#IndonesiaGelap",
				'"protes"',
				'"Mahasiswa bergerak"',
				'"demo mahasiswa"',
				'"demonstrasi"',
				'"aksi demo"',
				'"tuntutan mahasiswa"',
				'"RUU TNI Jokowi"',
				'"Tolak revisi RUU TNI"',
				'"RUU TNI demo"',
				'"RUU TNI protes"',
				'"DPR" AND "RUU TNI"',
				'"DPR RUU TNI"',
				'"RUU TNI ditolak"',
				'"Revisi RUU TNI"',
				'"RUU TNI kontroversial"',
				'"Tolak RUU TNI"',
				'"RUU TNI"',
				'"Indonesia gelap"',
				'"demo"',
				'"unjuk rasa"',
				'"unjukrasa"',
				'"UU TNI"',
			],
			timeline: Timeline.LATEST,
		}),
		{
			proxy_username,
			proxy_password,
			parse_limit: 5,
			scroll_delay: 500,
			ratelimit_timeout: 7 * 60 * 1000,
			scroll_timeout: 10 * 60 * 60 * 1000,
		}
	);
	await parser.authenticate();
	await parser.navigateRecursive();
	while (true) {
		const data = await parser.parse();
		consola.success("Acquired " + data.length + " Tweets");

		//If the length is 0 it means we have reached the end.
		if (data.length === 0) {
			consola.warn("Reached end of current timeline.");
			const findLatest = await LogModel.findById(log_id);
			if (!findLatest) throw new Error("Created log is missing");

			const latestdate = findLatest.smallest_date;

			parser.setSearchURL(
				ParseClass.generateSearchURL({
					either: [
						"#TolakRUUTNI",
						"#IndonesiaGelap",
						'"protes"',
						'"Mahasiswa bergerak"',
						'"demo mahasiswa"',
						'"demonstrasi"',
						'"aksi demo"',
						'"tuntutan mahasiswa"',
						'"RUU TNI Jokowi"',
						'"Tolak revisi RUU TNI"',
						'"RUU TNI demo"',
						'"RUU TNI protes"',
						'"DPR" AND "RUU TNI"',
						'"DPR RUU TNI"',
						'"RUU TNI ditolak"',
						'"Revisi RUU TNI"',
						'"RUU TNI kontroversial"',
						'"Tolak RUU TNI"',
						'"RUU TNI"',
						'"Indonesia gelap"',
						'"demo"',
						'"unjuk rasa"',
						'"unjukrasa"',
						'"UU TNI"',
					],
					timeline: Timeline.LATEST,
					until: latestdate,
				})
			);
			await parser.navigateRecursive();
			continue;
		}
		const cleaned = [];

		const currentLog = await LogModel.findById(log_id);
		if (!currentLog) throw new Error("Created log is missing. Aborting.");
		const currentSmallestDate = currentLog?.smallest_date;

		for (const post of data) {
			const author = post.author;
			const time =
				post.time === "DATEUNDEFINED" ? new Date() : new Date(post.time);
			const content = post.content.replace(/@[^\s]+/g, "").trim();
			if (content.length === 0) continue;

			const metrics = parseMetrics(post.data);
			if (time.getUTCDate() < currentSmallestDate.getUTCDate()) {
				const updatelogquery = await LogModel.findOneAndUpdate(
					{
						_id: log_id,
					},
					{
						smallest_date: time,
					},
					{
						upsert: false,
					}
				).catch(() => null);
				if (updatelogquery === null)
					throw new Error("Failed to update log.. aborting");
				consola.success(
					"Successfully updated log with: " +
						updatelogquery.smallest_date.getUTCDate()
				);
			}

			cleaned.push({
				tweet_id: post.id,
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
			return err.result?.insertedDocs || [];
		});
		consola.success("Successfully pushed: " + writeResult.length);
	}
})();
