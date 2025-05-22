import dotenv from "dotenv";
import consola from "consola";
import initialize_db from "./database/initialize_db";
import ParseClass, { Timeline } from "./parse_class";
import PostModel from "./database/post_model";
import LogModel from "./database/log_model";
import { isValidObjectId } from "mongoose";

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

const padNumber = (num: number): string => {
	return String(num).padStart(3, "0");
};

const searchParameters = [
	"#TolakRUUTNI",
	"#RUUTNI",
	'"RUU TNI"',
	'"demo mahasiswa"',
	'"unjuk rasa"',
	'"demonstrasi"',
	"#DukungRUUTNI",
	'"Dukung RUU TNI"',
	"#RUUTNIPerkuatNKRI",
	"#GagalkanRUUTNI",
	"#CabutRUUTNI",
	"#PeringatanDarurat",
	"#IndonesiaGelap",
	"#TolakRevisiUUTNI",
	"#TolakDwifungsiABRI",
	'"dwifungsi"',
];

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

async function parseCustom(id: string) {
	if (!isValidObjectId(id)) throw new Error("Provided id is invalid");
	await initialize_db(mongodb_uri as string);
	const latestlog = await LogModel.findById(id).catch(() => null);
	if (latestlog === null)
		throw new Error("Log with the provided id could not be found");
	const log_id = latestlog.id;
	consola.success("Continuing using log with id: " + log_id);
	const parser = await ParseClass.initializeWithOptions(
		ParseClass.generateSearchURL({
			either: searchParameters,
			timeline: Timeline.LATEST,
			until: latestlog.smallest_date,
		}),
		{
			proxy_username,
			proxy_password,
			parse_limit: 2,
			scroll_delay: 500,
			ratelimit_timeout: 10 * 60 * 1000,
			scroll_timeout: 10000,
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
			const timelineStartDate = findLatest.timeline_start_date;
			const latestdate = findLatest.smallest_date;
			if (
				timelineStartDate.getTime() - latestdate.getTime() <
				24 * 60 * 60 * 1000
			) {
				latestdate.setDate(latestdate.getDate() - 1);
				consola.warn(
					"Large timeline detected. Stepping back 1 day to prevent looping"
				);
			}

			parser.setSearchURL(
				ParseClass.generateSearchURL({
					either: searchParameters,
					timeline: Timeline.LATEST,
					until: latestdate,
				})
			);
			const updateStartDateQuery = await LogModel.findOneAndUpdate(
				{
					_id: log_id,
				},
				{
					timeline_start_date: latestdate,
				},
				{
					upsert: false,
				}
			).catch(() => null);
			if (updateStartDateQuery === null)
				throw new Error("Failed to update timeline start date");
			consola.success(
				`Successfully updated timeline start date to ${latestdate.toString()}`
			);
			await parser.navigateRecursive();
			continue;
		}
		const cleaned = [];

		const currentLog = await LogModel.findById(log_id);
		if (!currentLog) throw new Error("Created log is missing. Aborting.");
		let currentSmallestDate: Date = currentLog.smallest_date;
		for (const post of data) {
			const author = post.author;
			let time = new Date(post.time);
			if (isNaN(time.getTime())) time = new Date();

			const content = post.content.replace(/@[^\s]+/g, "").trim();
			if (content.length === 0) continue;

			const metrics = parseMetrics(post.data);
			if (time.getTime() < currentSmallestDate.getTime()) {
				currentSmallestDate = time;
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
		const updatelogquery = await LogModel.findOneAndUpdate(
			{
				_id: log_id,
			},
			{
				smallest_date: currentSmallestDate,
			},
			{
				upsert: false,
			}
		).catch(() => null);
		if (updatelogquery === null)
			throw new Error("Failed to update log.. aborting");
		consola.success(
			"Successfully updated log with: " + updatelogquery.smallest_date.getTime()
		);
		//Insert new data into the database.
		try {
			const result = await PostModel.insertMany(cleaned, {
				ordered: false,
			});
			consola.success(
				`Successfully pushed: ${padNumber(result.length)} Failed push: 000`
			);
		} catch (err: any) {
			const failedIndexes = err.writeErrors?.map((e: any) => e.index) ?? [];
			// Attempt to reconstruct successful docs
			const successDocs = cleaned.filter(
				(_, idx) => !failedIndexes.includes(idx)
			);
			consola.success(
				`Successfully pushed: ${padNumber(
					successDocs.length
				)} Failed push: ${padNumber(failedIndexes.length)}`
			);
		}
	}
}

async function parseContinue() {
	await initialize_db(mongodb_uri as string);
	const latestlog = await LogModel.findOne()
		.sort({ started_at: -1 })
		.catch(() => null);
	if (latestlog === null) throw new Error("Unable to find latest log");

	const log_id = latestlog.id;
	consola.success("Continuing using log with id: " + log_id);
	const parser = await ParseClass.initializeWithOptions(
		ParseClass.generateSearchURL({
			either: searchParameters,
			timeline: Timeline.LATEST,
			until: latestlog.smallest_date,
		}),
		{
			proxy_username,
			proxy_password,
			parse_limit: 2,
			scroll_delay: 500,
			ratelimit_timeout: 10 * 60 * 1000,
			scroll_timeout: 10000,
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
			const timelineStartDate = findLatest.timeline_start_date;
			const latestdate = findLatest.smallest_date;
			if (
				timelineStartDate.getTime() - latestdate.getTime() <
				24 * 60 * 60 * 1000
			) {
				latestdate.setDate(latestdate.getDate() - 1);
				consola.warn(
					"Large timeline detected. Stepping back 1 day to prevent looping"
				);
			}

			parser.setSearchURL(
				ParseClass.generateSearchURL({
					either: searchParameters,
					timeline: Timeline.LATEST,
					until: latestdate,
				})
			);
			const updateStartDateQuery = await LogModel.findOneAndUpdate(
				{
					_id: log_id,
				},
				{
					timeline_start_date: latestdate,
				},
				{
					upsert: false,
				}
			).catch(() => null);
			if (updateStartDateQuery === null)
				throw new Error("Failed to update timeline start date");
			consola.success(
				`Successfully updated timeline start date to ${latestdate.toString()}`
			);
			await parser.navigateRecursive();
			continue;
		}
		const cleaned = [];

		const currentLog = await LogModel.findById(log_id);
		if (!currentLog) throw new Error("Created log is missing. Aborting.");
		let currentSmallestDate: Date = currentLog.smallest_date;
		for (const post of data) {
			const author = post.author;
			let time = new Date(post.time);
			if (isNaN(time.getTime())) time = new Date();

			const content = post.content.replace(/@[^\s]+/g, "").trim();
			if (content.length === 0) continue;

			const metrics = parseMetrics(post.data);
			if (time.getTime() < currentSmallestDate.getTime()) {
				currentSmallestDate = time;
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
		const updatelogquery = await LogModel.findOneAndUpdate(
			{
				_id: log_id,
			},
			{
				smallest_date: currentSmallestDate,
			},
			{
				upsert: false,
			}
		).catch(() => null);
		if (updatelogquery === null)
			throw new Error("Failed to update log.. aborting");
		consola.success(
			"Successfully updated log with: " + updatelogquery.smallest_date.getTime()
		);
		//Insert new data into the database.
		try {
			const result = await PostModel.insertMany(cleaned, {
				ordered: false,
			});
			consola.success(
				`Successfully pushed: ${padNumber(result.length)} Failed push: 000`
			);
		} catch (err: any) {
			const failedIndexes = err.writeErrors?.map((e: any) => e.index) ?? [];
			// Attempt to reconstruct successful docs
			const successDocs = cleaned.filter(
				(_, idx) => !failedIndexes.includes(idx)
			);
			consola.success(
				`Successfully pushed: ${padNumber(
					successDocs.length
				)} Failed push: ${padNumber(failedIndexes.length)}`
			);
		}
	}
}

async function parseNormal() {
	await initialize_db(mongodb_uri as string);
	const latestlog = await LogModel.create({
		smallest_date: new Date(),
		started_at: new Date(),
		timeline_start_date: new Date(),
	});
	const log_id = latestlog.id;
	consola.success("Created new log with id: " + log_id);
	const parser = await ParseClass.initializeWithOptions(
		ParseClass.generateSearchURL({
			either: searchParameters,
			timeline: Timeline.LATEST,
		}),
		{
			proxy_username,
			proxy_password,
			parse_limit: 2,
			scroll_delay: 500,
			ratelimit_timeout: 10 * 60 * 1000,
			scroll_timeout: 10000,
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
			const timelineStartDate = findLatest.timeline_start_date;
			const latestdate = findLatest.smallest_date;
			if (
				timelineStartDate.getTime() - latestdate.getTime() <
				24 * 60 * 60 * 1000
			) {
				latestdate.setDate(latestdate.getDate() - 1);
				consola.warn(
					"Large timeline detected. Stepping back 1 day to prevent looping"
				);
			}

			parser.setSearchURL(
				ParseClass.generateSearchURL({
					either: searchParameters,
					timeline: Timeline.LATEST,
					until: latestdate,
				})
			);
			const updateStartDateQuery = await LogModel.findOneAndUpdate(
				{
					_id: log_id,
				},
				{
					timeline_start_date: latestdate,
				},
				{
					upsert: false,
				}
			).catch(() => null);
			if (updateStartDateQuery === null)
				throw new Error("Failed to update timeline start date");
			consola.success(
				`Successfully updated timeline start date to ${latestdate.toString()}`
			);
			await parser.navigateRecursive();
			continue;
		}
		const cleaned = [];

		const currentLog = await LogModel.findById(log_id);
		if (!currentLog) throw new Error("Created log is missing. Aborting.");
		let currentSmallestDate: Date = currentLog.smallest_date;
		for (const post of data) {
			const author = post.author;
			let time = new Date(post.time);
			if (isNaN(time.getTime())) time = new Date();

			const content = post.content.replace(/@[^\s]+/g, "").trim();
			if (content.length === 0) continue;

			const metrics = parseMetrics(post.data);
			if (time.getTime() < currentSmallestDate.getTime()) {
				currentSmallestDate = time;
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
		const updatelogquery = await LogModel.findOneAndUpdate(
			{
				_id: log_id,
			},
			{
				smallest_date: currentSmallestDate,
			},
			{
				upsert: false,
			}
		).catch(() => null);
		if (updatelogquery === null)
			throw new Error("Failed to update log.. aborting");
		consola.success(
			"Successfully updated log with: " + updatelogquery.smallest_date.getTime()
		);
		//Insert new data into the database.
		try {
			const result = await PostModel.insertMany(cleaned, {
				ordered: false,
			});
			consola.success(
				`Successfully pushed: ${padNumber(result.length)} Failed push: 000`
			);
		} catch (err: any) {
			const failedIndexes = err.writeErrors?.map((e: any) => e.index) ?? [];
			// Attempt to reconstruct successful docs
			const successDocs = cleaned.filter(
				(_, idx) => !failedIndexes.includes(idx)
			);
			consola.success(
				`Successfully pushed: ${padNumber(
					successDocs.length
				)} Failed push: ${padNumber(failedIndexes.length)}`
			);
		}
	}
}

async function example() {
	const flag = process.argv[2];
	switch (flag) {
		case "--continue":
			console.log("Starting in continuation mode");
			await parseContinue();
			break;
		case "--custom":
			const id = process.argv[3];
			if (id.length === 0) throw new Error("Please provide id argument");
			consola.success("Starting in custom mode with id: ", id);
			await parseCustom(id);
			break;
		default:
			console.log("Starting in default mode");
			await parseNormal();
	}
}
example();
