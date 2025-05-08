import { Request, Response, NextFunction } from "express";
import { DefaultResponse } from "../../../..";
import joi from "joi";
import PostModel from "../../../db/posts";

const bodyValidator = joi.array().items(
	joi.object({
		time: joi.string().required(),
		author: joi.string().required(),
		content: joi.string().required(),
		data: joi.string().required(),
	})
);

interface BodyInterface {
	time: string;
	author: string;
	content: string;
	data: string;
}

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

export default async (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!req.body) throw new Error("Invalid request body");
		const validatedBody = bodyValidator.validate(req.body);
		if (validatedBody.error) throw validatedBody.error;

		const body = validatedBody.value as BodyInterface[];

		const cleaned = [];
		for (const post of body) {
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

		const writeResult = await PostModel.insertMany(cleaned).catch(() => null);
		if (writeResult === null) throw new Error("Failed to save");

		res.status(200).json({
			status: 200,
			code: "OK",
			message: "OK",
			data: writeResult,
		} as DefaultResponse<typeof writeResult>);
		return;
	} catch (e) {
		console.error(e);
		next(e);
	}
};
