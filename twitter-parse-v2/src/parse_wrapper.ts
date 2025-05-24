import LogModel, { LogDocument } from "./database/log_model";
import PostModel from "./database/post_model";
import consola from "consola";
import ParseClass, { Timeline } from "./parse_class";
import padNumber from "./lib/pad_number";
import parseMetrics from "./lib/parse_metrics";
import { Proxy } from "./types";
export default async (
	log_data: LogDocument,
	search_parameters: string[],
	proxy: Proxy,
	continue_previous: Boolean
): Promise<void> => {
	const log_id = log_data.id;
	const parser = await ParseClass.initializeWithOptions(
		ParseClass.generateSearchURL({
			either: search_parameters,
			timeline: Timeline.LATEST,
			until: continue_previous ? log_data.smallest_date : undefined,
		}),
		{
			proxy_username: proxy.username,
			proxy_password: proxy.password,
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
					either: search_parameters,
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
};
